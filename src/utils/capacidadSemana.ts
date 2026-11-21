/**
 * AH2-050: horas de caja que puede cubrir el personal activo en la semana, por grupo.
 * - Cajeros (FULL/PART): sus horas de contrato.
 * - Eventuales: su presencia en franjas con necesidad, sin pasar el menor entre su ficha
 *   y el máximo por contrato de Configuración.
 * - Supervisores (AUX): solo cuando hay otro supervisor de pie (presentes − 1), más las franjas
 *   autorizadas en Configuración en que un supervisor solo puede atender caja.
 * Es un máximo («hasta»): el motor decide cuánto usa de cada grupo.
 */
import { parsearRangos } from '../algoritmo/adapter'
import type { FranjaApertura } from '../hibrido/configuracionPersistente'

const SLOTS = 30
const slot = (h: string) => { const [a, b] = h.split(':').map(Number); return (a - 8) * 2 + Math.floor(b / 30) }

/** Presencia [día][franja] a partir del horario semanal («08:00-14:00|20:00-23:00» por día). */
export function presencia(horarioSemanal: string[] = []): boolean[][] {
  return Array.from({ length: 7 }, (_, d) => {
    const fila = Array<boolean>(SLOTS).fill(false)
    for (const [i, f] of parsearRangos(horarioSemanal[d] ?? '')) for (let s = Math.max(0, i); s < Math.min(SLOTS, f); s++) fila[s] = true
    return fila
  })
}

export interface CapacidadSemana { cajeros: number; eventuales: number; supervisores: number; total: number }

export function capacidadSemana(e: {
  /** necesidad[día][franja de 08:00] (cajas) */
  necesidad: number[][]
  horasCajeros: number
  eventuales: { horarioSemanal: string[]; topeHoras?: number | null }[]
  auxiliares: { horarioSemanal: string[] }[]
  franjasAuxSolo?: FranjaApertura[]
}): CapacidadSemana {
  const hay = (d: number, s: number) => (e.necesidad[d]?.[s] ?? 0) > 0
  let ev = 0
  for (const p of e.eventuales) {
    const m = presencia(p.horarioSemanal)
    let n = 0
    for (let d = 0; d < 7; d++) for (let s = 0; s < SLOTS; s++) if (m[d][s] && hay(d, s)) n++
    const tope = p.topeHoras == null ? Infinity : Math.max(0, p.topeHoras) * 2
    ev += Math.min(n, tope)
  }
  const pres = e.auxiliares.map(a => presencia(a.horarioSemanal))
  const solo = (d: number, s: number) => (e.franjasAuxSolo ?? []).some(f => f.dia === d && slot(f.desde) <= s && s < slot(f.hasta))
  let aux = 0
  for (let d = 0; d < 7; d++) for (let s = 0; s < SLOTS; s++) {
    if (!hay(d, s)) continue
    const n = pres.filter(m => m[d][s]).length
    aux += n >= 2 ? Math.min(n - 1, e.necesidad[d][s]) : n === 1 && solo(d, s) ? 1 : 0
  }
  const cajeros = e.horasCajeros, eventuales = ev / 2, supervisores = aux / 2
  return { cajeros, eventuales, supervisores, total: cajeros + eventuales + supervisores }
}
