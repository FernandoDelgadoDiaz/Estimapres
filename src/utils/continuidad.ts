/**
 * AH2-063 · Continuidad dentro del mes (decisión del propietario, 23/11/2026).
 *
 * Dentro del mismo mes se elige, entre los horarios válidos, el que MENOS cambia para los cajeros (días en que cambia
 * el tipo de turno: mañana / tarde / cierre / franco; el domingo no cuenta porque se reparte parejo), siempre que no
 * tenga más de `margenHoras` de faltante extra frente al de mejor cobertura. Margen por defecto: 2 h por semana,
 * configurable por sucursal (0 = la cobertura siempre primero). Al cambiar de mes no se aplica.
 */
import type { Jornada } from '../algoritmo/types'
import type { HorarioColaborador } from '../types'
import { horariosAcreditados } from '../contingencias/ausencias'
import { clasificarJornadaUI } from './preferencias'

export interface Continuidad { semanaAnterior: HorarioColaborador[]; margenHoras: number }

const aSlot = (h: string) => { const [a, b] = h.split(':').map(Number); return (a - 8) * 2 + Math.floor(b / 30) }
const aHora = (s: number) => `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`

/** Jornadas de cajeros de la semana anterior en ids del motor (semillas de la búsqueda). */
export function semillasDeSemana(anterior: HorarioColaborador[], v2PorUi: Map<string, string>): Record<string, Jornada[]> {
  return Object.fromEntries(horariosAcreditados(anterior).filter(h => h.rolGeneral === 'cajero' && v2PorUi.has(h.colaboradorId)).map(h => {
    const id = v2PorUi.get(h.colaboradorId)!
    return [id, Array.from({ length: 7 }, (_, d) => {
      const j = h.jornadas.find(x => x.dia === d)
      return { colab_id: id, dia: d as Jornada['dia'], bloques: !j || j.esFranco ? [] : j.turnos.map(t => ({ slot_inicio: aSlot(t.inicio), slot_fin: aSlot(t.fin) })) }
    })]
  }))
}

const clase = (j?: Jornada) => clasificarJornadaUI({ esFranco: !j?.bloques.length, turnos: (j?.bloques ?? []).map(b => ({ inicio: aHora(b.slot_inicio), fin: aHora(b.slot_fin) })) })

/** Días (lunes a sábado) en que cambia el tipo de turno de cada cajero respecto de las semillas. */
export function cambiosDeTurno(semanas: Record<string, Jornada[]>, semillas: Record<string, Jornada[]>): number {
  let n = 0
  for (const [id, prev] of Object.entries(semillas)) {
    const sem = semanas[id]
    if (!sem) continue
    for (let d = 0; d < 6; d++) if (clase(sem.find(j => j.dia === d)) !== clase(prev.find(j => j.dia === d))) n++
  }
  return n
}

/**
 * Elige entre candidatos: el de menor faltante define la referencia; entre los que no superan ese faltante + margen,
 * gana el que menos cambia (a igualdad, menor faltante y luego el primero de la lista).
 */
export function elegirConContinuidad<T>(candidatos: T[], faltanteHoras: (c: T) => number, cambios: (c: T) => number, margenHoras: number): T {
  const minimo = Math.min(...candidatos.map(faltanteHoras))
  const dentro = candidatos.filter(c => faltanteHoras(c) <= minimo + margenHoras + 1e-9)
  return dentro.reduce((a, b) => cambios(b) < cambios(a) || (cambios(b) === cambios(a) && faltanteHoras(b) < faltanteHoras(a) - 1e-9) ? b : a)
}
