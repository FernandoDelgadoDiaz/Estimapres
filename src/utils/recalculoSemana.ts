// src/utils/recalculoSemana.ts
// #38 — Recálculo integral de la cascada tras una edición manual.
//
// Cualquier edición (cajero, presencia de AUX o caja de un eventual) cambia la
// cobertura de la que dependen las pasadas siguientes. Este módulo re-ejecuta la
// lógica REAL de las pasadas 2 y 3 sobre el horario editado, con la misma
// configuración operativa con la que se generó la semana:
//
//   1. Cobertura de FULL/PART = sus jornadas actuales (decisión del motor o manual).
//   2. Celdas de eventuales editadas a mano ("id|día") = decisión confirmada: se
//      respetan tal cual y su cobertura se descuenta antes de recalcular.
//   3. Pasada 2: CAJA de AUX desde su presencia actual y el déficit real.
//   4. Pasada 3: CAJA del resto de los eventuales sobre el déficit residual, dentro
//      de su disponibilidad resuelta de la semana. Sin disponibilidad conocida
//      (semanas históricas) no se reasignan: se conservan y se informa.
//   5. Cobertura, faltantes y % se recalculan con las tres categorías.
//
// Nada se sobrescribe en silencio: los conflictos que no se pueden resolver de
// forma segura (p. ej. un eventual fijado a mano donde ya no hay déficit) quedan
// a cargo del validador, que deja la semana en BORRADOR con la causa precisa.

import type { AsignacionCajaColaborador, HorarioColaborador, JornadaAsignada, ResultadoAsignacion } from '../types'
import { HORAS_FRANJAS } from '../types'
import type { AsignacionEv, MatrizDisponibilidad, MatrizPresencia } from '../algoritmo/types'
import { ejecutarPasada2 } from '../algoritmo/pasada2-auxiliares'
import { ejecutarPasada3 } from '../algoritmo/pasada3-eventuales'
import { presenciaDesdeJornadas } from './recalculoAux'
import { DEFAULTS_OPERATIVOS, type ConfigOperativa } from './preferencias'

const SLOTS = 30
const DIAS = [0, 1, 2, 3, 4, 5, 6]
const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }
const slotDeFranja = (fi: number) => (aMin(HORAS_FRANJAS[fi]) - 8 * 60) / 30
const horaDeSlot = (s: number) => `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`

export interface ContextoRecalculo {
  /** Necesidad del POM [franja HORAS_FRANJAS][día]. */
  necesidadFranjas: number[][]
  operativa: Partial<ConfigOperativa>
  nombrePorId: Record<string, string>
  /** Disponibilidad resuelta de la semana por id (formato horarioSemanal). */
  disponibilidad?: Record<string, string[]>
  /** Celdas de eventuales fijadas a mano ("id|día"). */
  eventualesFijos?: string[]
}

export interface ResultadoRecalculo extends Pick<ResultadoAsignacion,
  'horarios' | 'cajaAux' | 'cajaEventual' | 'coberturaFranjas' | 'faltantesFranjas' | 'porcentajeCobertura'> {
  /** Información para el supervisor sobre lo que no se pudo recalcular. */
  avisos: string[]
}

/** Slots cubiertos por un turno: los que empiezan dentro de [inicio, fin). */
function marcarTurnos(fila: number[] | boolean[], turnos: { inicio: string; fin: string }[]) {
  for (const t of turnos) {
    for (let m = aMin(t.inicio); m < aMin(t.fin); m += 30) {
      const s = Math.floor((m - 8 * 60) / 30)
      if (s < 0 || s >= SLOTS) continue
      if (typeof fila[s] === 'number') (fila as number[])[s]++
      else (fila as boolean[])[s] = true
    }
  }
}

function matrizHorario(hs: string[]): boolean[][] {
  return DIAS.map(d => {
    const fila = Array<boolean>(SLOTS).fill(false)
    marcarTurnos(fila, (hs[d] ?? '').split('|').filter(Boolean).map(r => { const [inicio, fin] = r.split('-'); return { inicio, fin } }))
    return fila
  })
}

function jornadaDesdeSlots(dia: number, slots: boolean[]): JornadaAsignada {
  const turnos: { inicio: string; fin: string }[] = []
  let ini = -1
  for (let s = 0; s <= SLOTS; s++) {
    const on = s < SLOTS && slots[s]
    if (on && ini === -1) ini = s
    else if (!on && ini !== -1) { turnos.push({ inicio: horaDeSlot(ini), fin: horaDeSlot(s) }); ini = -1 }
  }
  const horas = turnos.reduce((h, t) => h + (aMin(t.fin) - aMin(t.inicio)) / 60, 0)
  return { dia, turnos, horas, esFranco: turnos.length === 0, rol: turnos.length ? 'eventual_sector' : 'franco' }
}

export function recalcularSemanaTrasEdicion(r: ResultadoAsignacion, ctx: ContextoRecalculo): ResultadoRecalculo {
  const avisos: string[] = []
  const op = {
    apertura_solo_aux: ctx.operativa.aperturaSoloAux ?? DEFAULTS_OPERATIVOS.apertura_solo_aux,
    sin_aux_cierre: ctx.operativa.sinAuxCierre ?? DEFAULTS_OPERATIVOS.sin_aux_cierre,
    supervisor_jornada_completa: ctx.operativa.supervisorJornadaCompleta ?? DEFAULTS_OPERATIVOS.supervisor_jornada_completa,
  }
  const fijos = new Set(ctx.eventualesFijos ?? [])

  // Demanda 7×30
  const demanda = DIAS.map(() => Array<number>(SLOTS).fill(0))
  HORAS_FRANJAS.forEach((_, fi) => {
    const s = slotDeFranja(fi)
    if (s >= 0 && s < SLOTS) DIAS.forEach(d => { demanda[d][s] = ctx.necesidadFranjas[fi]?.[d] ?? 0 })
  })

  // 1. FULL/PART
  const cobFP = DIAS.map(() => Array<number>(SLOTS).fill(0))
  for (const h of r.horarios.filter(x => x.rolGeneral === 'cajero')) {
    for (const j of h.jornadas) if (!j.esFranco) marcarTurnos(cobFP[j.dia], j.turnos)
  }

  // 2. Eventuales fijados a mano (decisión confirmada)
  const cajaEvPrev = new Map((r.cajaEventual ?? []).map(e => [e.colaboradorId, e]))
  const cobFijos = DIAS.map(() => Array<number>(SLOTS).fill(0))
  for (const e of cajaEvPrev.values()) DIAS.forEach(d => {
    if (fijos.has(`${e.colaboradorId}|${d}`)) e.slotsCajaPorDia[d]?.forEach((x, s) => { if (x) cobFijos[d][s]++ })
  })

  const deficit_1 = demanda.map((fila, d) => fila.map((v, s) => Math.max(0, v - cobFP[d][s] - cobFijos[d][s])))

  // 3. Pasada 2 sobre la presencia actual de los AUX
  const filasAux = r.horarios.filter(h => h.rolGeneral === 'aux_supervisor')
  const presencia_aux: Record<string, MatrizPresencia> = Object.fromEntries(filasAux.map(h => [h.colaboradorId, presenciaDesdeJornadas(h)]))
  const p2 = ejecutarPasada2(
    { demanda, colaboradores: [], presencia_aux, disponibilidad_eventual: {}, ...op },
    { jornadas_full: {}, jornadas_part: {}, deficit_1, infactibles: [] },
  )
  const cajaAux: AsignacionCajaColaborador[] = Object.entries(p2.asignacion_aux)
    .map(([id, m]) => ({ colaboradorId: id, nombre: ctx.nombrePorId[id] ?? r.cajaAux?.find(a => a.colaboradorId === id)?.nombre ?? id, slotsCajaPorDia: m.map(f => f.map(e => e === 'CAJA')) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  // 4. Pasada 3 sobre el déficit residual (eventuales no fijados a mano)
  const idsEv = [...new Set([
    ...r.horarios.filter(h => h.rolGeneral === 'eventual_sector').map(h => h.colaboradorId),
    ...cajaEvPrev.keys(),
  ])]
  let cajaEventual: AsignacionCajaColaborador[]
  const sinDisp = idsEv.filter(id => !ctx.disponibilidad?.[id])
  if (sinDisp.length) {
    // Sin disponibilidad resuelta no se puede reasignar con garantías: se conserva y se avisa.
    cajaEventual = [...cajaEvPrev.values()]
    avisos.push('No se recalcularon los eventuales: falta su disponibilidad resuelta de esta semana (semana anterior a #38). La validación informa cualquier duplicación de cobertura.')
  } else {
    const disponibilidad_eventual: Record<string, MatrizDisponibilidad> = Object.fromEntries(idsEv.map(id => {
      const disp = matrizHorario(ctx.disponibilidad![id])
      return [id, DIAS.map(d => disp[d].map(ok => (ok && !fijos.has(`${id}|${d}`) ? 'NO_USADO' : 'NO_DISPONIBLE') as AsignacionEv))]
    }))
    const p3 = ejecutarPasada3({ demanda, colaboradores: [], presencia_aux: {}, disponibilidad_eventual }, p2)
    cajaEventual = idsEv.map(id => {
      const prev = cajaEvPrev.get(id)
      return {
        colaboradorId: id,
        nombre: ctx.nombrePorId[id] ?? prev?.nombre ?? id,
        slotsCajaPorDia: DIAS.map(d => fijos.has(`${id}|${d}`)
          ? [...(prev?.slotsCajaPorDia[d] ?? Array(SLOTS).fill(false))]
          : p3.asignacion_eventual[id][d].map(e => e === 'CAJA')),
      }
    }).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }

  // Filas de eventuales = sus bloques en CAJA (las fijadas a mano no se tocan)
  const cajaEvPorId = new Map(cajaEventual.map(e => [e.colaboradorId, e]))
  const horarios: HorarioColaborador[] = r.horarios.map(h => {
    if (h.rolGeneral !== 'eventual_sector' || sinDisp.length) return h
    const caja = cajaEvPorId.get(h.colaboradorId)
    if (!caja) return h
    const jornadas = h.jornadas.map(j => (fijos.has(`${h.colaboradorId}|${j.dia}`) ? j : jornadaDesdeSlots(j.dia, caja.slotsCajaPorDia[j.dia])))
    return { ...h, jornadas, totalHoras: jornadas.reduce((s, j) => s + j.horas, 0) }
  })

  // 5. Cobertura y faltantes
  const cob = cobFP.map(f => [...f])
  for (const a of [...cajaAux, ...cajaEventual]) a.slotsCajaPorDia.forEach((f, d) => f.forEach((x, s) => { if (x) cob[d][s]++ }))
  const coberturaFranjas = HORAS_FRANJAS.map(() => Array<number>(7).fill(0))
  const faltantesFranjas = HORAS_FRANJAS.map(() => Array<number>(7).fill(0))
  let dem = 0, falt = 0
  HORAS_FRANJAS.forEach((_, fi) => {
    const s = slotDeFranja(fi)
    if (s < 0 || s >= SLOTS) return
    DIAS.forEach(d => {
      coberturaFranjas[fi][d] = cob[d][s]
      faltantesFranjas[fi][d] = Math.max(0, demanda[d][s] - cob[d][s])
      dem += demanda[d][s]
      falt += faltantesFranjas[fi][d]
    })
  })

  return {
    horarios, cajaAux, cajaEventual, coberturaFranjas, faltantesFranjas,
    porcentajeCobertura: dem > 0 ? ((dem - falt) / dem) * 100 : 0,
    avisos,
  }
}
