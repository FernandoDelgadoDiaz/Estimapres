// AH2 · Tramo B1 — Vista mínima de un horario semanal para el núcleo de planificación.
// Usa los tipos existentes de la app (ResultadoAsignacion.horarios) sin modificarlos.
import type { HorarioColaborador, JornadaAsignada } from '../types'
import { type Fecha, sumarDias } from './fechas'

export interface SemanaPlan {
  fechaLunes: Fecha
  horarios: HorarioColaborador[]
}

/** Fecha de la jornada del día `dia` (0 = lunes) de la semana. */
export const fechaDeDia = (fechaLunes: Fecha, dia: number): Fecha => sumarDias(fechaLunes, dia)

/** Jornadas indexadas por colaborador y fecha. */
export function jornadasPorFecha(s: SemanaPlan): Map<string, Map<Fecha, JornadaAsignada>> {
  const m = new Map<string, Map<Fecha, JornadaAsignada>>()
  for (const h of s.horarios) {
    const porFecha = new Map<Fecha, JornadaAsignada>()
    for (const j of h.jornadas) porFecha.set(fechaDeDia(s.fechaLunes, j.dia), j)
    m.set(h.colaboradorId, porFecha)
  }
  return m
}

const trabaja = (j: JornadaAsignada | undefined) => !!j && !j.esFranco && j.turnos.length > 0

/** Igualdad operativa de dos jornadas: franco o mismos turnos (horas de inicio y fin). */
export function mismaJornada(a: JornadaAsignada | undefined, b: JornadaAsignada | undefined): boolean {
  if (!trabaja(a) && !trabaja(b)) return true
  if (trabaja(a) !== trabaja(b)) return false
  const ta = a!.turnos, tb = b!.turnos
  return ta.length === tb.length && ta.every((t, i) => t.inicio === tb[i].inicio && t.fin === tb[i].fin)
}

export { trabaja }
