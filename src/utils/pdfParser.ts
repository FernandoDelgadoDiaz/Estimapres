import * as pdfjsLib from 'pdfjs-dist'
import { Franja } from '../types'
import { detectarSemanaPOM, parsearTablaEstimado, type ResultadoSemana } from './pomContrato'

export interface ResultadoParseoPDF {
  franjas: Franja[]
  datosCrudos: Array<{hora: string, necesidad: number[]}>
  totalSlots: number
  totalDemanda: number
  /** POM-01: semana del documento (encabezado o nombre del archivo), no del reloj. */
  semana: ResultadoSemana
  /** POM-01: observaciones no bloqueantes del contrato POM. */
  avisos: string[]
  /** POM-01: Σ celdas / 2. */
  horasCaja: number
}

/** Texto completo del PDF (todas las páginas, ítems unidos por espacio). */
export async function extraerTextoPDF(data: ArrayBuffer | Uint8Array): Promise<string> {
  // Mitigación de PDF.js para CVE-2024-4367.
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise
  let texto = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    texto += ' ' + content.items.map((item: any) => item.str).join(' ')
  }
  return texto
}

/** Aplica el contrato POM v2 (pomContrato.ts) sobre el texto ya extraído. */
export function interpretarTextoPOM(texto: string, nombreArchivo = ''): ResultadoParseoPDF {
  const tabla = parsearTablaEstimado(texto) // lanza ErrorContratoPOM con todos los problemas
  let totalSlots = 0
  let totalDemanda = 0
  for (const f of tabla.franjas) for (const v of f.necesidad) {
    if (v > 0) totalSlots++
    totalDemanda += v
  }
  return {
    franjas: tabla.franjas,
    datosCrudos: tabla.filasLeidas,
    totalSlots,
    totalDemanda,
    semana: detectarSemanaPOM(texto, nombreArchivo),
    avisos: tabla.avisos,
    horasCaja: tabla.horasCaja,
  }
}

export async function extraerNecesidadDesdePDF(file: File): Promise<ResultadoParseoPDF> {
  const texto = await extraerTextoPDF(await file.arrayBuffer())
  return interpretarTextoPOM(texto, file.name)
}
