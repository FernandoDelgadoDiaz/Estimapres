// #38 — Helpers compartidos por las pruebas de apertura y reglas operativas.
import { convertirInputAV2, convertirOutputDeV2 } from '../../adapter'
import { ejecutarAlgoritmo } from '../../orquestador'
import { MATRIZ_POM_SINTETICA } from '../../../utils/__tests__/fixtures/pomSintetico'
import type { Auxiliar, Colaborador, Eventual, Franja, ResultadoAsignacion } from '../../../types'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from './semana47Anonimizada'

export const NECESIDAD_S47: Franja[] = MATRIZ_POM_SINTETICA.map(([hora, necesidad]) => ({ hora, necesidad: [...necesidad] }))
export const LUNES_S47 = '2026-11-16'

export type Operativa = typeof OPERATIVA_S47

export function generar(
  operativa: Operativa = OPERATIVA_S47,
  auxiliares: Auxiliar[] = AUX_S47,
  eventuales: Eventual[] = EVENTUALES_S47,
  cajeros: Colaborador[] = CAJEROS_S47,
  necesidad: Franja[] = NECESIDAD_S47,
): ResultadoAsignacion {
  const input = convertirInputAV2(necesidad, cajeros, auxiliares, eventuales, [], { ...operativa })
  return convertirOutputDeV2(ejecutarAlgoritmo(input), cajeros, auxiliares, eventuales)
}
export const generarS47 = generar

const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b }

/** Personas EN CAJA por categoría en un día y slot (0 = 08:00, 1 = 08:30, …). */
export function composicion(r: ResultadoAsignacion, dia: number, slot: number) {
  const t = 8 * 60 + slot * 30
  const cajeros = r.horarios.filter(h => h.rolGeneral === 'cajero' && h.jornadas.some(j =>
    j.dia === dia && !j.esFranco && j.turnos.some(x => minutos(x.inicio) <= t && minutos(x.fin) > t)))
  return {
    fullPart: cajeros.length,
    aux: (r.cajaAux ?? []).filter(a => a.slotsCajaPorDia[dia]?.[slot]).map(a => a.colaboradorId),
    eventual: (r.cajaEventual ?? []).filter(e => e.slotsCajaPorDia[dia]?.[slot]).map(e => e.colaboradorId),
  }
}
export const composicionApertura = (r: ResultadoAsignacion, dia: number, slot: 0 | 1) => composicion(r, dia, slot)

/** ¿La persona está presente/disponible en ese día y slot según su patrón "HH:MM-HH:MM|…"? */
export function presente(horarioSemanal: string[], dia: number, slot: number): boolean {
  const t = 8 * 60 + slot * 30
  return (horarioSemanal[dia] ?? '').split('|').filter(Boolean).some(r => {
    const [a, b] = r.split('-')
    return minutos(a) <= t && minutos(b) > t
  })
}
