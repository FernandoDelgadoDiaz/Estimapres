// Resumen de una semana en el lenguaje del supervisor: cuánto se cubre, cuántas horas
// quedan sin cubrir y dónde faltan cajas. Sin términos del motor ni de validación.
import { DIAS_SEMANA, HORAS_FRANJAS, type AsignacionCajaColaborador, type HorarioColaborador, type SemanaHistorial } from '../types'
import { calcularCoberturaHorarios } from './efectividad'
import { ultimasVersiones } from './preferencias'

export interface TramoFaltante {
  dia: number
  diaNombre: string
  desde: string
  hasta: string
  /** Cajas que faltan en el peor momento del tramo */
  cajas: number
  /** Horas-caja sin cubrir dentro del tramo */
  horas: number
}

export interface ResumenSemana {
  coberturaPct: number
  horasNecesarias: number
  horasSinCubrir: number
  /** Tramos continuos con cajas faltantes, del más grave al más leve */
  faltantes: TramoFaltante[]
}

const finDeFranja = (fi: number) => {
  const [h, m] = HORAS_FRANJAS[fi].split(':').map(Number)
  const t = h * 60 + m + 30
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Resume la semana a partir de la necesidad [franja][día] y la cobertura [franja][día]. */
export function resumirCobertura(necesidad: number[][], cobertura: number[][]): ResumenSemana {
  let necesarias = 0, cubiertas = 0
  const faltantes: TramoFaltante[] = []
  for (let dia = 0; dia < 7; dia++) {
    let tramo: TramoFaltante | null = null
    for (let fi = 0; fi < HORAS_FRANJAS.length; fi++) {
      const y = necesidad[fi]?.[dia] ?? 0
      const x = cobertura[fi]?.[dia] ?? 0
      if (y > 0) { necesarias += y; cubiertas += Math.min(x, y) }
      const falta = Math.max(0, y - x)
      if (falta > 0) {
        if (!tramo) tramo = { dia, diaNombre: DIAS_SEMANA[dia], desde: HORAS_FRANJAS[fi], hasta: finDeFranja(fi), cajas: 0, horas: 0 }
        tramo.hasta = finDeFranja(fi)
        tramo.cajas = Math.max(tramo.cajas, falta)
        tramo.horas += falta / 2
      } else if (tramo) { faltantes.push(tramo); tramo = null }
    }
    if (tramo) faltantes.push(tramo)
  }
  faltantes.sort((a, b) => b.cajas - a.cajas || b.horas - a.horas || a.dia - b.dia || a.desde.localeCompare(b.desde))
  return {
    coberturaPct: necesarias ? (cubiertas / necesarias) * 100 : 100,
    horasNecesarias: necesarias / 2,
    horasSinCubrir: (necesarias - cubiertas) / 2,
    faltantes,
  }
}

/** Resumen en vivo a partir de los horarios actuales (con ediciones). */
export function resumirHorarios(horarios: HorarioColaborador[], necesidad: number[][], cajaAux: AsignacionCajaColaborador[] = []): ResumenSemana {
  return resumirCobertura(necesidad, calcularCoberturaHorarios(horarios, necesidad, cajaAux).cobertura)
}

/** Necesidad de la semana guardada; semanas antiguas la reconstruyen desde cobertura + faltantes. */
export function necesidadDeSemana(s: SemanaHistorial): { necesidad: number[][]; aproximada: boolean } | null {
  if (s.necesidadFranjas) return { necesidad: s.necesidadFranjas, aproximada: false }
  if (!s.coberturaFranjas || !s.faltantesFranjas) return null
  return { necesidad: s.coberturaFranjas.map((fila, fi) => fila.map((x, d) => x + (s.faltantesFranjas?.[fi]?.[d] ?? 0))), aproximada: true }
}

/** Semanas para elegir en «Horarios»: la última versión de cada lunes, la más reciente primero. */
export function semanasParaConsultar(historial: SemanaHistorial[]): SemanaHistorial[] {
  return ultimasVersiones(historial).sort((a, b) => b.fechaLunes.localeCompare(a.fechaLunes) || b.generadoEl.localeCompare(a.generadoEl))
}

/** Fecha corta en español: «23/11». */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return d && m ? `${d}/${m}` : iso
}

/** Lunes de la semana siguiente a la fecha dada (YYYY-MM-DD, hora local). */
export function proximoLunes(hoy = new Date()): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const dow = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() + (7 - dow))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** «Semana del 23/11 al 29/11» a partir del lunes. */
export function rangoSemana(lunes: string): string {
  const [y, m, d] = lunes.split('-').map(Number)
  const fin = new Date(y, m - 1, d + 6)
  return `Semana del ${fechaCorta(lunes)} al ${String(fin.getDate()).padStart(2, '0')}/${String(fin.getMonth() + 1).padStart(2, '0')}`
}
