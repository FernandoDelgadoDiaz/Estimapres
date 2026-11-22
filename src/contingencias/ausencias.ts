/**
 * AH2-057 · Ausencias sobre un horario ya comunicado.
 *
 * Una ausencia deja la jornada visible vacía (la persona no cubre caja ese día) y conserva la jornada comunicada
 * en `ausencia.turnosOriginales`. El validador la ACREDITA para el contrato (composición FULL 9-9-9-8-8-5 + franco,
 * horas, descanso de 12 h y reglas por persona), pero la cobertura, la supervisión y la presencia se miden con la
 * jornada visible. Así una ausencia no se confunde con un franco ni obliga a «reponer» horas a la persona.
 */
import type { HorarioColaborador, JornadaAsignada, Turno } from '../types'

export interface AusenciaValidacion { colaboradorId: string; dia: number; turnos: Turno[] }

/** Jornada visible de un día ausente: vacía, con la original guardada. */
export function marcarAusente(j: JornadaAsignada, motivo: string): JornadaAsignada {
  if (j.ausencia) return { ...j, ausencia: { ...j.ausencia, motivo } }
  return {
    dia: j.dia, turnos: [], horas: 0, esFranco: true, rol: 'franco',
    ausencia: { motivo, turnosOriginales: j.esFranco ? [] : j.turnos.map(t => ({ ...t })), horasOriginales: j.esFranco ? 0 : j.horas, rolOriginal: j.rol },
  }
}

/** Ausencias declaradas en las jornadas visibles (solo días en que la persona tenía que trabajar). */
export function ausenciasDeHorarios(horarios: HorarioColaborador[]): AusenciaValidacion[] {
  return horarios.flatMap(h => h.jornadas
    .filter(j => j.ausencia && j.ausencia.turnosOriginales.length)
    .map(j => ({ colaboradorId: h.colaboradorId, dia: j.dia, turnos: j.ausencia!.turnosOriginales })))
}

const horasDe = (turnos: Turno[]) => turnos.reduce((n, t) => {
  const m = (x: string) => { const [a, b] = x.split(':').map(Number); return a * 60 + b }
  return n + (m(t.fin) - m(t.inicio)) / 60
}, 0)

/**
 * Vista para el control de CONTRATO: cada día ausente vuelve a su jornada comunicada. Solo se acredita si la
 * jornada visible está vacía (si alguien la volvió a cargar a mano, rige lo visible).
 */
export function horariosAcreditados(horarios: HorarioColaborador[], extra: AusenciaValidacion[] = []): HorarioColaborador[] {
  const porClave = new Map(extra.map(a => [`${a.colaboradorId}|${a.dia}`, a.turnos]))
  for (const a of ausenciasDeHorarios(horarios)) porClave.set(`${a.colaboradorId}|${a.dia}`, a.turnos)
  if (!porClave.size) return horarios
  return horarios.map(h => {
    let cambio = false
    const jornadas = h.jornadas.map(j => {
      const turnos = porClave.get(`${h.colaboradorId}|${j.dia}`)
      if (!turnos?.length || !j.esFranco || j.turnos.length) return j
      cambio = true
      const horas = horasDe(turnos)
      return { ...j, turnos: turnos.map(t => ({ ...t })), horas, esFranco: false, rol: j.ausencia?.rolOriginal ?? (horas <= 5 ? 'franco_medio' : 'cajero') }
    })
    return cambio ? { ...h, jornadas, totalHoras: jornadas.reduce((n, j) => n + (j.esFranco ? 0 : j.horas), 0) } : h
  })
}

/** Una jornada marcada ausente que vuelve a tener turnos visibles es contradictoria. */
export function ausenciasConTurnos(horarios: HorarioColaborador[]): Array<{ colaboradorId: string; dia: number }> {
  return horarios.flatMap(h => h.jornadas.filter(j => j.ausencia && (!j.esFranco || j.turnos.length)).map(j => ({ colaboradorId: h.colaboradorId, dia: j.dia })))
}
