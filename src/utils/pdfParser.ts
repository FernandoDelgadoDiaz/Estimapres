import * as pdfjsLib from 'pdfjs-dist'
import { Franja, HORAS_FRANJAS } from '../types'

export interface ResultadoParseoPDF {
  franjas: Franja[]
  datosCrudos: Array<{hora: string, necesidad: number[]}>
  totalSlots: number
  totalDemanda: number
}

/**
 * Títulos de tablas conocidas del PDF semanal. Se usan para delimitar dónde
 * termina la tabla "Estimado de cajas necesarias": el segmento de un candidato
 * llega hasta el próximo título de CUALQUIER tabla (diferencia, programación
 * de personal, etc.), no solo hasta "diferencia".
 */
const TITULOS_TABLAS = [
  /estimado\s+de\s+cajas\s+necesarias/gi,
  /diferencia\s+de\s+cajas\s+necesarias/gi,
  /programaci[oó]n\s+de(l)?\s+personal/gi,
  /personal\s+programado/gi,
]

interface FilasParseadas {
  franjas: Franja[]
  celdasNegativas: number
}

/**
 * Parsea filas "HH:MM(:SS) + 7 números" de un segmento de texto.
 * NO aplica abs() silencioso: cuenta las celdas negativas para que el caller
 * pueda detectar que el segmento corresponde a la tabla "Diferencia" (que es
 * la única con valores negativos) y descartarlo.
 */
function parsearFilasDeSegmento(texto: string): FilasParseadas {
  // Anclar en el encabezado "Horario" si existe (evita ruido previo del título)
  const matchHorario = /horario/i.exec(texto)
  const textoDatos = matchHorario ? texto.substring(matchHorario.index) : texto

  const tokens = textoDatos
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)

  const esHora = (t: string) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t)

  const franjas: Franja[] = []
  let celdasNegativas = 0
  let idx = 0

  // Saltar hasta la primera hora válida
  while (idx < tokens.length && !esHora(tokens[idx])) idx++

  while (idx < tokens.length && franjas.length < HORAS_FRANJAS.length) {
    const token = tokens[idx]
    if (esHora(token)) {
      const hora = token.substring(0, 5) // HH:MM
      const valores: number[] = []
      let todosNumerosValidos = true
      for (let j = 1; j <= 7; j++) {
        if (idx + j >= tokens.length) {
          todosNumerosValidos = false
          break
        }
        const val = parseInt(tokens[idx + j], 10)
        if (isNaN(val)) {
          todosNumerosValidos = false
          break
        }
        if (val < 0) celdasNegativas++
        valores.push(val)
      }

      if (todosNumerosValidos && valores.length === 7) {
        franjas.push({ hora, necesidad: valores })
        idx += 8 // hora + 7 valores
      } else {
        idx++
      }
    } else {
      idx++
    }
    // Avanzar hasta la próxima hora
    while (idx < tokens.length && !esHora(tokens[idx])) idx++
  }

  return { franjas, celdasNegativas }
}

export async function extraerNecesidadDesdePDF(file: File): Promise<ResultadoParseoPDF> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  // Extraer TODO el texto de TODAS las páginas
  let textoCompleto = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ')
    textoCompleto += ' ' + pageText
  }

  // 1. Todas las ocurrencias del título "Estimado de cajas necesarias".
  //    Cada una es un CANDIDATO a tabla de demanda real; la posición (primera,
  //    última) no alcanza para decidir porque el PDF tiene varias tablas y el
  //    título puede repetirse en resúmenes o leyendas.
  const regexEstimado = /estimado\s+de\s+cajas\s+necesarias/gi
  const ocurrencias = [...textoCompleto.matchAll(regexEstimado)]
  if (ocurrencias.length === 0) {
    throw new Error('No se encontró la tabla Estimado de cajas necesarias en el PDF')
  }

  // 2. Posiciones de TODOS los títulos de tabla conocidos, para delimitar
  //    cada candidato hasta el próximo título (de cualquier tabla).
  const posicionesTitulos: number[] = []
  for (const regex of TITULOS_TABLAS) {
    regex.lastIndex = 0
    for (const m of textoCompleto.matchAll(regex)) {
      if (m.index !== undefined) posicionesTitulos.push(m.index)
    }
  }
  posicionesTitulos.sort((a, b) => a - b)

  // 3. Parsear cada candidato y elegir el de mejor puntaje:
  //    - más filas válidas es mejor (la tabla real tiene ~31 franjas)
  //    - celdas negativas penalizan fuerte (firma de la tabla "Diferencia")
  let mejor: FilasParseadas | null = null
  let mejorPuntaje = -Infinity
  for (const oc of ocurrencias) {
    const desde = (oc.index ?? 0) + oc[0].length
    const siguienteTitulo = posicionesTitulos.find(p => p > desde)
    const segmento = textoCompleto.substring(desde, siguienteTitulo ?? textoCompleto.length)
    const parseado = parsearFilasDeSegmento(segmento)
    const puntaje = parseado.franjas.length * 10 - parseado.celdasNegativas * 25
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje
      mejor = parseado
    }
  }

  const franjas = mejor?.franjas ?? []
  if (mejor && mejor.celdasNegativas > 0) {
    console.warn(
      `[PDF Parser] La tabla elegida contiene ${mejor.celdasNegativas} celdas negativas; ` +
      'se usan como 0. Verificá que el PDF tenga la tabla "Estimado de cajas necesarias" completa.'
    )
  }

  if (franjas.length < 10) {
    throw new Error(`Solo se parsearon ${franjas.length} franjas. El PDF puede tener un formato diferente.`)
  }

  // La demanda real nunca es negativa: clamp defensivo a 0 (si hubiera
  // negativos residuales serían ruido, no demanda).
  const franjasSaneadas = franjas.map(f => ({
    hora: f.hora,
    necesidad: f.necesidad.map(v => Math.max(0, v)),
  }))

  // Alinear franjas parseadas con HORAS_FRANJAS esperadas
  const mapa = new Map<string, number[]>()
  franjasSaneadas.forEach(f => mapa.set(f.hora, f.necesidad))

  const franjasAlineadas: Franja[] = HORAS_FRANJAS.map(hora => {
    const necesidad = mapa.get(hora) || Array(7).fill(0)
    return { hora, necesidad }
  })

  // Calcular estadísticas (informativas solamente - no para validación)
  let totalSlots = 0
  let totalDemanda = 0
  franjasAlineadas.forEach(f => {
    f.necesidad.forEach(v => {
      if (v > 0) totalSlots++
      totalDemanda += v
    })
  })

  return {
    franjas: franjasAlineadas,
    datosCrudos: franjasSaneadas, // Datos originales parseados (sin alinear)
    totalSlots,
    totalDemanda
  }
}
