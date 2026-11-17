import type { ContextoCiclos } from './optimizacionCiclos'
import { historialEfectivo } from '../planificacion/historial'

/** Manifiesto offline. B vuelve a resolver los tramos, aun si llegaron desde A. */
export function manifiestoHistorial(ctx: ContextoCiclos, ids: ReadonlyMap<string, string>) {
  const res = historialEfectivo({ ...ctx.historial, sucursalId: ctx.sucursalId })
  if (!res.ok) throw Error('Historial efectivo inválido')
  const fuente = res.valor.filter(d => d.fuente === 'oficial')
  const tramoIds = new Set(fuente.map(d => d.tramoId))
  const tramos = ctx.historial.tramos.filter(t => tramoIds.has(t.id))
  const versionIds = new Set(tramos.map(t => t.versionId))
  const slot = (hora: string) => { const [h, m] = hora.split(':').map(Number); return (h * 60 + m - 480) / 30 }
  return {
    branch_id: ctx.sucursalId, as_of: ctx.historial.hoy,
    versions: ctx.historial.versiones.filter(o => versionIds.has(o.version.id)).map(({ version: v, semana }) => ({
      id: v.id, branch_id: v.sucursalId, week: v.fechaLunes, cycle_id: v.cicloId,
      scope: v.ambito, state: v.estado, legacy: Boolean(v.legado),
      jornadas: Object.fromEntries(semana.horarios.filter(h => ids.has(h.colaboradorId)).map(h => [ids.get(h.colaboradorId), h.jornadas.map(j => ({
        dia: j.dia, bloques: j.turnos.map(t => ({ slot_inicio: slot(t.inicio), slot_fin: slot(t.fin) })),
      }))])),
    })),
    segments: tramos.map(t => ({
      branch_id: t.sucursalId, version_id: t.versionId, start: t.desde < ctx.historial.desde ? ctx.historial.desde : t.desde,
      effective_end: t.hastaEfectivo && t.hastaEfectivo > ctx.historial.hasta ? ctx.historial.hasta : t.hastaEfectivo,
    })),
    absences: fuente.flatMap(d => d.ausentes.filter(id => ids.has(id)).map(id => ({ date: d.fecha, id: ids.get(id) }))),
  }
}
