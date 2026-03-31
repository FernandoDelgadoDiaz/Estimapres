import * as pdfjsLib from 'pdfjs-dist'
import { Franja, HORAS_FRANJAS } from '../types'

export async function extraerNecesidadDesdePDF(file: File): Promise<Franja[]> {
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

  // Estrategias flexibles para encontrar la tabla de estimado
  let posicion = -1
  let longitudMarcador = 0

  const MARCADOR_EXACTO = 'Estimado de cajas necesarias'
  const MARCADOR_PARCIAL = 'Estimado de cajas'

  // Buscar primera ocurrencia del texto exacto
  const primeraPosExacta = textoCompleto.indexOf(MARCADOR_EXACTO)

  // Buscar segunda ocurrencia (empezando después de la primera)
  if (primeraPosExacta !== -1) {
    posicion = textoCompleto.indexOf(MARCADOR_EXACTO, primeraPosExacta + 1)
    if (posicion !== -1) {
      longitudMarcador = MARCADOR_EXACTO.length
    }
  }

  // Si no hay segunda ocurrencia exacta, intentar con texto parcial — segunda ocurrencia
  if (posicion === -1) {
    const primeraPosParcial = textoCompleto.indexOf(MARCADOR_PARCIAL)
    if (primeraPosParcial !== -1) {
      posicion = textoCompleto.indexOf(MARCADOR_PARCIAL, primeraPosParcial + 1)
      if (posicion !== -1) {
        longitudMarcador = MARCADOR_PARCIAL.length
      }
    }
  }

  // Si sigue sin encontrar, usar la primera ocurrencia exacta como fallback
  if (posicion === -1 && primeraPosExacta !== -1) {
    posicion = primeraPosExacta
    longitudMarcador = MARCADOR_EXACTO.length
  }

  // Estrategia 5: regex case-insensitive
  if (posicion === -1) {
    const match = textoCompleto.match(/estimado\s+de\s+cajas/i)
    if (match && match.index !== undefined) {
      posicion = match.index
      longitudMarcador = match[0].length
    }
  }

  // Estrategia 6: segunda ocurrencia de "Horario"
  if (posicion === -1) {
    const primeraOcurrencia = textoCompleto.indexOf('Horario')
    if (primeraOcurrencia !== -1) {
      const segundaOcurrencia = textoCompleto.indexOf('Horario', primeraOcurrencia + 1)
      if (segundaOcurrencia !== -1) {
        posicion = segundaOcurrencia
        longitudMarcador = 0  // Incluir "Horario" en el texto para el parsing
      }
    }
  }

  if (posicion === -1) {
    throw new Error('No se encontró la tabla Estimado de cajas necesarias en el PDF')
  }


  // Trabajar SOLO con el texto DESPUÉS del marcador encontrado
  const textoEstimado = textoCompleto.substring(posicion + longitudMarcador)


  // Dividir en tokens (palabras/números separados por espacios)
  const tokens = textoEstimado
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)


  // Buscar "Horario" en los tokens para encontrar el encabezado
  let idxHorario = -1
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].toLowerCase() === 'horario') {
      idxHorario = i
      break
    }
  }

  if (idxHorario === -1) {
    throw new Error('No se encontró encabezado "Horario" en la tabla de estimado')
  }

  // Los 7 tokens siguientes a "Horario" son las fechas (MM-DD)

  // A partir de ahí, leer filas de datos
  // Cada fila: "HH:MM:SS" seguido de 7 números
  const franjas: Franja[] = []
  let idx = idxHorario + 8 // empezar después del encabezado

  while (idx < tokens.length && franjas.length < 31) {
    const token = tokens[idx]

    // Verificar si es una hora en formato HH:MM:SS o HH:MM
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(token)) {
      const hora = token.substring(0, 5) // tomar solo HH:MM
      const valores: number[] = []

      // Leer los 7 números siguientes
      for (let j = 1; j <= 7; j++) {
        if (idx + j < tokens.length) {
          const val = parseInt(tokens[idx + j], 10)
          valores.push(isNaN(val) ? 0 : Math.max(0, val)) // negativos → 0
        }
      }

      if (valores.length === 7) {
        franjas.push({ hora, necesidad: valores })
        idx += 8 // saltar hora + 7 valores
      } else {
        idx++
      }
    } else {
      idx++
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

  return franjasAlineadas
}