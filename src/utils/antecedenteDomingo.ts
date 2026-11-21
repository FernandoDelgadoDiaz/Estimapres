import type { Colaborador } from '../types'

/**
 * El domingo anterior es una fuente operativa independiente del historial de
 * simulaciones. Se importa SOLO en la sesión de generación, sin persistencia.
 * 'null' significa franco / sin trabajo el domingo (no horario desconocido).
 */
export interface AntecedenteDomingo {
  lunes: string
  domingo: string
  sucursal: string
  finPorId: Record<string, string | null>
}

export function domingoAnteriorISO(lunes: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lunes)) throw new Error('Fecha del lunes inválida.')
  const d = new Date(lunes + 'T12:00:00Z')
  if (Number.isNaN(d.getTime()) || d.getUTCDay() !== 1 || d.toISOString().slice(0, 10) !== lunes) {
    throw new Error('La fecha indicada debe corresponder a un lunes válido.')
  }
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function leerAntecedenteDomingo(
  archivo: unknown, lunes: string, cajeros: Colaborador[], sucursal: string,
): AntecedenteDomingo {
  const domingo = domingoAnteriorISO(lunes)
  if (!archivo || typeof archivo !== 'object' || Array.isArray(archivo)) throw new Error('Archivo JSON inválido.')
  const obj = archivo as Record<string, unknown>
  if (obj.sucursal !== sucursal) throw new Error('El antecedente pertenece a otra sucursal o no indica su sucursal.')
  if (obj.lunes !== lunes || obj.domingo !== domingo) {
    throw new Error(`El antecedente debe indicar domingo ${domingo} y lunes ${lunes}.`)
  }
  if (!obj.finPorId || typeof obj.finPorId !== 'object' || Array.isArray(obj.finPorId)) {
    throw new Error('Falta finPorId: un registro por cajero FULL/PART.')
  }
  const recibido = obj.finPorId as Record<string, unknown>
  const activos = cajeros.filter(c => c.activo && (c.tipo === 'FULL' || c.tipo === 'PART'))
  const ids = new Set(activos.map(c => c.id))
  if (activos.length === 0 || ids.size !== activos.length || Object.keys(recibido).length !== ids.size ||
      Object.keys(recibido).some(id => !ids.has(id))) {
    throw new Error('El archivo debe incluir exactamente a los cajeros FULL/PART activos; no AUX ni eventuales.')
  }
  const finPorId: Record<string, string | null> = {}
  for (const c of activos) {
    const fin = recibido[c.id]
    if (fin === null) {
      finPorId[c.id] = null
      continue
    }
    if (typeof fin !== 'string' || !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(fin)) {
      throw new Error(`Hora de salida dominical inválida o no confirmada: ${c.nombre}.`)
    }
    finPorId[c.id] = fin
  }
  return { lunes, domingo, sucursal, finPorId }
}

/** Primera entrada admisible el lunes en slots desde las 08:00. */
export function entradaMinimaLunesSlots(fin: string | null): number {
  if (fin === null) return 0
  const [h, m] = fin.split(':').map(Number)
  const minutos = h * 60 + m
  return Math.max(0, Math.ceil((minutos - 12 * 60 - 8 * 60) / 30))
}

/**
 * AH2-046: el domingo anterior se toma del horario GUARDADO de la semana previa (última versión),
 * sin carga manual. Cajeros que no figuran en esa semana (altas nuevas) cuentan como sin trabajo el domingo.
 * Sin semana previa guardada → null (el descanso del lunes no se puede verificar esa vez).
 */
export function antecedenteDesdeHistorial(
  historial: Array<{ fechaLunes: string; version: number; horarios: Array<{ colaboradorId: string; jornadas: Array<{ dia: number; esFranco: boolean; turnos: Array<{ fin: string }> }> }> }>,
  lunes: string, cajeros: Colaborador[], sucursal: string,
): (AntecedenteDomingo & { lunesOrigen: string }) | null {
  let domingo: string
  try { domingo = domingoAnteriorISO(lunes) } catch { return null }
  const previo = new Date(lunes + 'T12:00:00Z'); previo.setUTCDate(previo.getUTCDate() - 7)
  const lunesPrevio = previo.toISOString().slice(0, 10)
  const semana = historial.filter(h => h.fechaLunes === lunesPrevio).sort((a, b) => b.version - a.version)[0]
  if (!semana) return null
  const finPorId: Record<string, string | null> = {}
  for (const c of cajeros.filter(x => x.activo && (x.tipo === 'FULL' || x.tipo === 'PART'))) {
    const j = semana.horarios.find(h => h.colaboradorId === c.id)?.jornadas.find(x => x.dia === 6)
    const fin = j && !j.esFranco && j.turnos.length ? j.turnos[j.turnos.length - 1].fin.slice(0, 5) : null
    finPorId[c.id] = fin && /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(fin) ? fin : null
  }
  return { lunes, domingo, sucursal, finPorId, lunesOrigen: lunesPrevio }
}
