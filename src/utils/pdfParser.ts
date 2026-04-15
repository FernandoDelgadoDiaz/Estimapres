import * as pdfjsLib from 'pdfjs-dist'
import { Franja, HORAS_FRANJAS } from '../types'

export interface ResultadoParseoPDF {
  franjas: Franja[]
  datosCrudos: Array<{hora: string, necesidad: number[]}>
  totalSlots: number
  totalDemanda: number
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

  // Buscar ÚNICAMENTE la tabla "Estimado de cajas necesarias", ignorando completamente "Diferencia de cajas necesarias"
  // Búsqueda case-insensitive y tolerante a espacios adicionales
  // Buscar TODAS las ocurrencias y usar la ÚLTIMA (la tabla correcta)
  const regexMarcador = /estimado\s+de\s+cajas\s+necesarias/gi
  const matches = [...textoCompleto.matchAll(regexMarcador)]
  if (matches.length === 0) {
    throw new Error('No se encontró la tabla Estimado de cajas necesarias en el PDF')
  }
  // Usar la última ocurrencia (la tabla correcta)
  const lastMatch = matches[matches.length - 1]
  const posicion = lastMatch.index
  const longitudMarcador = lastMatch[0].length

  // Buscar la tabla de diferencia después del marcador (case-insensitive)
  const textoRestante = textoCompleto.substring(posicion + longitudMarcador)
  const regexDiferencia = /diferencia\s+de\s+cajas\s+necesarias/i
  const matchDiferencia = regexDiferencia.exec(textoRestante)
  const posicionDiferencia = matchDiferencia ? posicion + longitudMarcador + matchDiferencia.index : -1

  // Trabajar SOLO con el texto DESPUÉS del marcador y ANTES de la tabla de diferencia (si existe)
  const textoEstimado = posicionDiferencia !== -1
    ? textoCompleto.substring(posicion + longitudMarcador, posicionDiferencia)
    : textoCompleto.substring(posicion + longitudMarcador)


  // Dividir en tokens (palabras/números separados por espacios)
  let tokens = textoEstimado
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)



  // Buscar "Horario" en el texto (case-insensitive) para encontrar el encabezado
  const regexHorario = /horario/i
  const matchHorario = regexHorario.exec(textoEstimado)
  if (!matchHorario) {
    throw new Error('No se encontró encabezado "Horario" en la tabla de estimado')
  }

  // Tokenizar solo la parte del texto a partir de "Horario"
  const textoDesdeHorario = textoEstimado.substring(matchHorario.index)
  tokens = textoDesdeHorario
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)

  // "Horario" debería ser el primer token ahora (puede tener puntuación adjunta)
  const idxHorario = 0
  const primerToken = tokens[0].toLowerCase()
  if (tokens.length === 0 || !primerToken.includes('horario')) {
    throw new Error('Error al procesar encabezado "Horario"')
  }


  // Los 7 tokens siguientes a "Horario" son las fechas (MM-DD)
  // Pero puede haber texto adicional, así que buscamos la primera hora válida

  // A partir de ahí, leer filas de datos
  // Cada fila: "HH:MM:SS" seguido de 7 números
  const franjas: Franja[] = []
  let idx = idxHorario + 1 // empezar después de "Horario"

  // Buscar la primera hora válida (HH:MM o HH:MM:SS)
  while (idx < tokens.length && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(tokens[idx])) {
    idx++
  }

  // Si no encontramos ninguna hora, error
  if (idx >= tokens.length) {
    throw new Error('No se encontró ninguna hora válida después del encabezado "Horario"')
  }

  // Ahora procesar filas desde la primera hora encontrada
  while (idx < tokens.length && franjas.length < 31) {
    const token = tokens[idx]

    // Verificar si es una hora en formato HH:MM:SS o HH:MM
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(token)) {
      const hora = token.substring(0, 5) // tomar solo HH:MM
      const valores: number[] = []

      // Leer los 7 números siguientes, verificando que sean números válidos
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
        // Cada celda es un valor absoluto (una media hora, no sumar ni acumular)
        if (val < 0) {
          console.warn(`[PDF Parser] Valor negativo encontrado en franja ${hora}, día ${j}: ${val}. Convirtiendo a valor absoluto.`)
        }
        valores.push(Math.abs(val)) // valor absoluto
      }

      if (todosNumerosValidos && valores.length === 7) {
        franjas.push({ hora, necesidad: valores })
        idx += 8 // saltar hora + 7 valores

        // Verificar que el siguiente token (si existe) sea una hora para continuar
        // Si no es una hora, avanzamos hasta encontrar la próxima hora
        while (idx < tokens.length && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(tokens[idx])) {
          idx++
        }
      } else {
        // Si no son 7 números válidos, avanzamos un token y buscamos la próxima hora
        idx++
        while (idx < tokens.length && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(tokens[idx])) {
          idx++
        }
      }
    } else {
      idx++
      while (idx < tokens.length && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(tokens[idx])) {
        idx++
      }
    }
  }


  if (franjas.length < 10) {
    throw new Error(`Solo se parsearon ${franjas.length} franjas. El PDF puede tener un formato diferente.`)
  }

  // Alinear franjas parseadas con HORAS_FRANJAS esperadas
  const mapa = new Map<string, number[]>()
  franjas.forEach(f => mapa.set(f.hora, f.necesidad))

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
    datosCrudos: franjas, // Datos originales parseados (sin alinear)
    totalSlots,
    totalDemanda
  }
}