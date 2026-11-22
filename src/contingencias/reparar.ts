/**
 * AH2-057 · Cobertura de una ausencia sobre un horario ya comunicado (cualquier sucursal; sin motor externo).
 *
 * Reglas (decisión del propietario, 22/11/2026):
 *  - La propuesta arranca el DÍA SIGUIENTE al aviso: el día del aviso y los anteriores no se tocan.
 *  - Dos propuestas:
 *      · «Menor impacto»: solo corre en el día la jornada de cajeros (misma duración, mismo día de trabajo, sin
 *        mover francos); prioriza cubrir y, a igual cobertura, la menor cantidad de personas y jornadas cambiadas.
 *      · «Mejor cobertura»: además puede intercambiar días de trabajo de una misma persona (mueve francos o medio
 *        franco dentro de los días que se replanifican).
 *  - Orden de cobertura: primero se reacomodan cajeros; después cubre caja un supervisor (con otro de pie) y por
 *    último los eventuales, dentro de su disponibilidad y de su tope semanal (pasadas 2 y 3 reales del motor).
 *  - Nunca agrega horas a nadie: la duración de cada jornada FULL/PART se conserva (AH2-024).
 *  - Toda propuesta se revalida con el MISMO validador de Horarios; si agrega un incumplimiento, se descarta.
 */
import type { AsignacionCajaColaborador, AusenciaCargada, HorarioColaborador, JornadaAsignada, ResultadoAsignacion, Turno } from '../types'
import { HORAS_FRANJAS } from '../types'
import { recalcularSemanaTrasEdicion } from '../utils/recalculoSemana'
import type { ConfigOperativa } from '../utils/preferencias'
import { marcarAusente } from './ausencias'

const DIAS = 7, SLOTS = 30
const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const slotDeFranja = (fi: number) => (aMin(HORAS_FRANJAS[fi]) - 8 * 60) / 30
export const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export interface ViolacionSimple { codigo: string; colaboradorId?: string; dia?: number; detalle: string }

export interface EntradaReparacion {
  base: ResultadoAsignacion
  fechaLunes: string
  ausencia: AusenciaCargada
  necesidadFranjas: number[][]
  operativa: Partial<ConfigOperativa>
  nombrePorId: Record<string, string>
  /** Disponibilidad de CAJA por eventual (7×30). */
  disponibilidadEventual: Record<string, boolean[][]>
  reservasEventual?: Record<string, boolean[][]>
  /** Tope semanal de caja por eventual (medias horas). Sin dato: sin tope adicional. */
  topesEventualSlots?: Record<string, number>
  /** Hora máxima de salida de cajeros (por defecto 22:30, configurable por local). */
  finCajeros?: string
  /** Ingreso del lunes siguiente por cajero, si esa semana ya existe (null = franco). Protege el descanso de 12 h. */
  inicioLunesSiguiente?: Record<string, string | null>
  /** El mismo validador de la pantalla Horarios. */
  validar: (r: ResultadoAsignacion) => ViolacionSimple[]
  /** Corte de tiempo de la búsqueda (ms). */
  presupuestoMs?: number
}

export interface Cambio {
  colaboradorId: string
  nombre: string
  tipo: 'cajero' | 'supervisor' | 'eventual'
  dia: number
  antes: string
  despues: string
}

export interface Propuesta {
  opcion: 'menor_impacto' | 'mejor_cobertura'
  plan: ResultadoAsignacion
  cambios: Cambio[]
  /** Medias horas sin cubrir de mañana al domingo. */
  faltante: number
  faltantePorDia: number[]
  personas: number
  jornadas: number
  francosMovidos: number
  /** Medias horas en las que faltan 2 cajas o más (de mañana al domingo). */
  franjasDobles: number
  violaciones: ViolacionSimple[]
}

export interface ResultadoReparacion {
  hoy: string
  diasAusente: number[]
  diasModificables: number[]
  /** Faltante (medias horas) de mañana al domingo: horario comunicado / con la ausencia y sin cambios. */
  faltanteOriginal: number
  faltanteSinCambios: number
  /** Faltante del día del aviso con la ausencia (no se replanifica). */
  faltanteDiaAviso: number
  sinCambios: ResultadoAsignacion
  menorImpacto: Propuesta
  mejorCobertura: Propuesta
  /** true si las dos propuestas son idénticas (se muestra una sola). */
  coinciden: boolean
}

const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Fecha local (YYYY-MM-DD) de un instante, en la zona de la sucursal. */
export function fechaLocal(instante: Date, zona = 'America/Argentina/Buenos_Aires'): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(instante).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

function demandaSlots(necesidadFranjas: number[][]): number[][] {
  const dem = Array.from({ length: DIAS }, () => Array<number>(SLOTS).fill(0))
  HORAS_FRANJAS.forEach((_, fi) => {
    const s = slotDeFranja(fi)
    if (s >= 0 && s < SLOTS) for (let d = 0; d < DIAS; d++) dem[d][s] = necesidadFranjas[fi]?.[d] ?? 0
  })
  return dem
}

function slotsDeTurnos(turnos: Turno[]): number[] {
  const out: number[] = []
  for (const t of turnos) for (let m = aMin(t.inicio); m < aMin(t.fin); m += 30) {
    const s = Math.floor((m - 8 * 60) / 30)
    if (s >= 0 && s < SLOTS) out.push(s)
  }
  return out
}

/** Cobertura 7×30 de cajeros + caja de AUX y eventuales. */
function cobertura(r: ResultadoAsignacion): number[][] {
  const cob = Array.from({ length: DIAS }, () => Array<number>(SLOTS).fill(0))
  for (const h of r.horarios) if (h.rolGeneral === 'cajero') for (const j of h.jornadas) if (!j.esFranco) for (const s of slotsDeTurnos(j.turnos)) cob[j.dia][s]++
  for (const a of [...(r.cajaAux ?? []), ...(r.cajaEventual ?? [])]) a.slotsCajaPorDia.forEach((f, d) => f.forEach((x, s) => { if (x) cob[d][s]++ }))
  return cob
}

function conMetricas(r: ResultadoAsignacion, dem: number[][]): ResultadoAsignacion {
  const cob = cobertura(r)
  const coberturaFranjas = HORAS_FRANJAS.map(() => Array<number>(7).fill(0))
  const faltantesFranjas = HORAS_FRANJAS.map(() => Array<number>(7).fill(0))
  let total = 0, falt = 0
  HORAS_FRANJAS.forEach((_, fi) => {
    const s = slotDeFranja(fi)
    if (s < 0 || s >= SLOTS) return
    for (let d = 0; d < DIAS; d++) {
      coberturaFranjas[fi][d] = cob[d][s]
      faltantesFranjas[fi][d] = Math.max(0, dem[d][s] - cob[d][s])
      total += dem[d][s]
      falt += faltantesFranjas[fi][d]
    }
  })
  return { ...r, coberturaFranjas, faltantesFranjas, porcentajeCobertura: total > 0 ? ((total - falt) / total) * 100 : 0 }
}

const faltantePorDia = (r: ResultadoAsignacion, dem: number[][]) => {
  const cob = cobertura(r)
  return dem.map((fila, d) => fila.reduce((n, v, s) => n + Math.max(0, v - cob[d][s]), 0))
}

const textoTurnos = (j?: JornadaAsignada) => !j || j.esFranco || !j.turnos.length ? (j?.ausencia ? 'Ausente' : 'Franco') : j.turnos.map(t => `${t.inicio}–${t.fin}`).join(' y ')
const textoCaja = (fila?: boolean[]) => {
  const tramos: string[] = []
  let ini = -1
  for (let s = 0; s <= SLOTS; s++) {
    const on = s < SLOTS && !!fila?.[s]
    if (on && ini < 0) ini = s
    else if (!on && ini >= 0) { tramos.push(`${aHora(8 * 60 + ini * 30)}–${aHora(8 * 60 + s * 30)}`); ini = -1 }
  }
  return tramos.length ? `Caja ${tramos.join(' y ')}` : 'Sin caja'
}
const mismaJornada = (a?: JornadaAsignada, b?: JornadaAsignada) =>
  !!a && !!b && a.esFranco === b.esFranco && JSON.stringify(a.turnos) === JSON.stringify(b.turnos)
const mismaFila = (a?: boolean[], b?: boolean[]) => (a ?? []).every((x, s) => !!x === !!b?.[s]) && (b ?? []).every((x, s) => !!x === !!a?.[s])

/**
 * Aplica la ausencia: jornadas visibles vacías en los días ausentes desde el aviso inclusive (la persona no viene),
 * presencia/disponibilidad de AUX y eventuales anulada esos días, y su caja retirada.
 */
export function aplicarAusencia(base: ResultadoAsignacion, ausencia: AusenciaCargada, diasAusente: number[]): ResultadoAsignacion {
  const dias = new Set(diasAusente)
  const quitar = (lista?: AsignacionCajaColaborador[]) => lista?.map(a => a.colaboradorId !== ausencia.colaboradorId ? a
    : { ...a, slotsCajaPorDia: a.slotsCajaPorDia.map((f, d) => dias.has(d) ? f.map(() => false) : f) })
  const horarios = base.horarios.map(h => h.colaboradorId !== ausencia.colaboradorId ? h : (() => {
    const jornadas = h.jornadas.map(j => dias.has(j.dia) && !(j.esFranco && !j.ausencia) ? marcarAusente(j, ausencia.motivo) : j)
    return { ...h, jornadas, totalHoras: jornadas.reduce((n, j) => n + (j.esFranco ? 0 : j.horas), 0) }
  })())
  const eventualesFijos = (base.eventualesFijos ?? []).filter(k => !(k.startsWith(`${ausencia.colaboradorId}|`) && dias.has(Number(k.split('|')[1]))))
  return { ...base, horarios, cajaAux: quitar(base.cajaAux), cajaEventual: quitar(base.cajaEventual), eventualesFijos }
}

interface Contexto {
  e: EntradaReparacion
  dem: number[][]
  original: ResultadoAsignacion
  /** Días que la propuesta puede cambiar (todos posteriores al aviso). */
  modificables: Set<number>
  /** Días ausentes posteriores al aviso: siempre se recalcula su apoyo. */
  ausentes: Set<number>
  ausente: (id: string, d: number) => boolean
}

/** Días en que el apoyo se recalcula: los ausentes y los que tienen algún cajero cambiado. */
function diasTocados(c: Contexto, r: ResultadoAsignacion): Set<number> {
  const out = new Set(c.ausentes)
  for (const h of r.horarios) {
    if (h.rolGeneral !== 'cajero') continue
    const o = c.original.horarios.find(x => x.colaboradorId === h.colaboradorId)
    for (const j of h.jornadas) if (c.modificables.has(j.dia) && !mismaJornada(j, o?.jornadas.find(x => x.dia === j.dia))) out.add(j.dia)
  }
  return out
}

/** Recalcula la caja de AUX y eventuales SOLO en los días replanificados (los demás quedan como estaban). */
function recalcularApoyo(c: Contexto, r: ResultadoAsignacion): ResultadoAsignacion {
  const { e } = c
  const modificables = diasTocados(c, r)
  const idsEv = [...new Set([...(r.cajaEventual ?? []).map(x => x.colaboradorId), ...r.horarios.filter(h => h.rolGeneral === 'eventual_sector').map(h => h.colaboradorId)])]
  const fijos = new Set(r.eventualesFijos ?? [])
  for (const id of idsEv) for (let d = 0; d < DIAS; d++) if (!modificables.has(d)) fijos.add(`${id}|${d}`)
  const usados = (id: string) => (r.cajaEventual ?? []).find(x => x.colaboradorId === id)?.slotsCajaPorDia
    .reduce((n, f, d) => n + (fijos.has(`${id}|${d}`) ? f.filter(Boolean).length : 0), 0) ?? 0
  const topes = Object.fromEntries(idsEv.map(id => [id, Math.max(0, Math.min(210, e.topesEventualSlots?.[id] ?? 210) - usados(id))]))
  const disponibilidadEventualMatriz = Object.fromEntries(idsEv.map(id => [id, Array.from({ length: DIAS }, (_, d) =>
    Array.from({ length: SLOTS }, (_, s) => !c.ausente(id, d) && !!e.disponibilidadEventual[id]?.[d]?.[s]))]))
  const rec = recalcularSemanaTrasEdicion(r, {
    necesidadFranjas: e.necesidadFranjas, operativa: e.operativa, nombrePorId: e.nombrePorId,
    eventualesFijos: [...fijos], disponibilidadEventualMatriz, topesEventualSlots: topes, reservasEventual: e.reservasEventual,
  })
  // Los días que no se replanifican conservan exactamente la caja de AUX comunicada.
  const cajaAuxPrev = new Map((r.cajaAux ?? []).map(a => [a.colaboradorId, a]))
  const cajaAux = (rec.cajaAux ?? []).map(a => ({ ...a, slotsCajaPorDia: a.slotsCajaPorDia.map((f, d) =>
    modificables.has(d) ? f : [...(cajaAuxPrev.get(a.colaboradorId)?.slotsCajaPorDia[d] ?? Array<boolean>(SLOTS).fill(false))]) }))
  // Filas de eventuales: los días ausentes siguen marcados como ausencia.
  const horarios = rec.horarios.map(h => {
    const prev = r.horarios.find(x => x.colaboradorId === h.colaboradorId)
    if (h.rolGeneral !== 'eventual_sector' || !prev) return h
    const jornadas = h.jornadas.map((j, i) => prev.jornadas[i]?.ausencia ? prev.jornadas[i] : j)
    return { ...h, jornadas, totalHoras: jornadas.reduce((n, j) => n + (j.esFranco ? 0 : j.horas), 0) }
  })
  const recalculado = conMetricas({ ...r, horarios, cajaAux, cajaEventual: rec.cajaEventual }, c.dem)
  // Cada día conserva el apoyo que ya tenía (sin la persona ausente) salvo que recalcularlo cubra más: así no se
  // reacomoda a supervisores ni eventuales sin necesidad, y se respetan las reglas con que se generó la semana.
  const previo = conMetricas(r, c.dem)
  const fp = faltantePorDia(recalculado, c.dem), fo = faltantePorDia(previo, c.dem)
  const usarPrevio = new Set([...modificables].filter(d => fo[d] <= fp[d]))
  const total = (x: ResultadoAsignacion) => { const f = faltantePorDia(x, c.dem); return [...modificables].reduce((n, d) => n + f[d], 0) }
  // A igual faltante total, gana el apoyo que ya estaba (cero cambios); después la mezcla por día; último el recálculo.
  const elegir = (...xs: ResultadoAsignacion[]) => xs.reduce((a, b) => total(b) < total(a) ? b : a)
  if (!usarPrevio.size) return elegir(previo, recalculado)
  const mezclar = (nuevo?: AsignacionCajaColaborador[], viejo?: AsignacionCajaColaborador[]) => {
    const ids = [...new Set([...(nuevo ?? []), ...(viejo ?? [])].map(a => a.colaboradorId))]
    return ids.map(id => {
      const n = nuevo?.find(a => a.colaboradorId === id), v = viejo?.find(a => a.colaboradorId === id)
      const vacio = () => Array<boolean>(SLOTS).fill(false)
      return { ...(n ?? v)!, slotsCajaPorDia: Array.from({ length: DIAS }, (_, d) => [...((usarPrevio.has(d) ? v : n)?.slotsCajaPorDia[d] ?? vacio())]) }
    }).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }
  const cajaEventual = mezclar(recalculado.cajaEventual, r.cajaEventual)
  // El tope semanal de cada eventual se respeta también en la mezcla; si no, rige el recálculo completo.
  const excede = cajaEventual.some(a => a.slotsCajaPorDia.flat().filter(Boolean).length > (e.topesEventualSlots?.[a.colaboradorId] ?? 210)
    && a.slotsCajaPorDia.flat().filter(Boolean).length > ((r.cajaEventual ?? []).find(x => x.colaboradorId === a.colaboradorId)?.slotsCajaPorDia.flat().filter(Boolean).length ?? 0))
  if (excede) return elegir(previo, recalculado)
  const horariosMezcla = recalculado.horarios.map(h => h.rolGeneral !== 'eventual_sector' ? h : (() => {
    const v = r.horarios.find(x => x.colaboradorId === h.colaboradorId)
    const jornadas = h.jornadas.map(j => usarPrevio.has(j.dia) && v ? v.jornadas.find(x => x.dia === j.dia) ?? j : j)
    return { ...h, jornadas, totalHoras: jornadas.reduce((n, j) => n + (j.esFranco ? 0 : j.horas), 0) }
  })())
  return elegir(previo, conMetricas({ ...recalculado, horarios: horariosMezcla, cajaAux: mezclar(recalculado.cajaAux, r.cajaAux), cajaEventual }, c.dem), recalculado)
}

function medir(c: Contexto, r: ResultadoAsignacion) {
  const porDia = faltantePorDia(r, c.dem)
  const faltante = [...c.modificables].reduce((n, d) => n + porDia[d], 0)
  // Concentración: faltar 2 cajas en una franja es peor que faltar 1 en dos franjas.
  const cob = cobertura(r)
  const concentracion = [...c.modificables].reduce((n, d) => n + c.dem[d].reduce((t, v, s) => t + Math.max(0, v - cob[d][s]) ** 2, 0), 0)
  const franjasDobles = [...c.modificables].reduce((n, d) => n + c.dem[d].filter((v, s) => v - cob[d][s] >= 2).length, 0)
  const cambios: Cambio[] = []
  let francosMovidos = 0, mediasHoras = 0
  for (const h of c.original.horarios) {
    const nuevo = r.horarios.find(x => x.colaboradorId === h.colaboradorId)
    const nombre = c.e.nombrePorId[h.colaboradorId] ?? h.colaboradorId
    for (const d of c.modificables) {
      if (c.ausente(h.colaboradorId, d)) continue
      if (h.rolGeneral === 'cajero') {
        const a = h.jornadas.find(j => j.dia === d), b = nuevo?.jornadas.find(j => j.dia === d)
        if (mismaJornada(a, b)) continue
        if (!!a?.esFranco !== !!b?.esFranco) francosMovidos++
        const sa = new Set(slotsDeTurnos(a?.esFranco ? [] : a?.turnos ?? [])), sb = new Set(slotsDeTurnos(b?.esFranco ? [] : b?.turnos ?? []))
        mediasHoras += [...sa].filter(s => !sb.has(s)).length + [...sb].filter(s => !sa.has(s)).length
        cambios.push({ colaboradorId: h.colaboradorId, nombre, tipo: 'cajero', dia: d, antes: textoTurnos(a), despues: textoTurnos(b) })
      }
    }
  }
  for (const [tipo, antes, despues] of [['supervisor', c.original.cajaAux, r.cajaAux], ['eventual', c.original.cajaEventual, r.cajaEventual]] as const) {
    const ids = new Set([...(antes ?? []), ...(despues ?? [])].map(a => a.colaboradorId))
    for (const id of ids) for (const d of c.modificables) {
      if (c.ausente(id, d)) continue
      const a = antes?.find(x => x.colaboradorId === id)?.slotsCajaPorDia[d], b = despues?.find(x => x.colaboradorId === id)?.slotsCajaPorDia[d]
      if (mismaFila(a, b)) continue
      mediasHoras += (a ?? []).filter((x, s) => !!x !== !!b?.[s]).length + (b ?? []).filter((x, s) => x && !a?.[s]).length
      cambios.push({ colaboradorId: id, nombre: c.e.nombrePorId[id] ?? id, tipo, dia: d, antes: textoCaja(a), despues: textoCaja(b) })
    }
  }
  cambios.sort((x, y) => x.dia - y.dia || x.nombre.localeCompare(y.nombre))
  const personas = new Set(cambios.map(x => x.colaboradorId)).size
  return { porDia, faltante, concentracion, franjasDobles, cambios, personas, jornadas: cambios.length, francosMovidos, mediasHoras }
}

type Medida = ReturnType<typeof medir>
const puntaje = (m: Medida) => [m.faltante, m.personas, m.jornadas, m.francosMovidos, m.mediasHoras]
const mejor = (a: number[], b: number[]) => { const i = a.findIndex((x, k) => x !== b[k]); return i >= 0 && a[i] < b[i] }

const claveViolacion = (v: ViolacionSimple) => `${v.codigo}|${v.colaboradorId ?? ''}|${v.dia ?? ''}`

/** Desplaza todos los tramos de una jornada `delta` medias horas. */
function desplazar(j: JornadaAsignada, delta: number, soloTramo?: number): JornadaAsignada {
  return { ...j, turnos: j.turnos.map((t, i) => soloTramo !== undefined && i !== soloTramo ? t : { inicio: aHora(aMin(t.inicio) + delta * 30), fin: aHora(aMin(t.fin) + delta * 30) }) }
}

function conJornada(r: ResultadoAsignacion, id: string, d: number, j: JornadaAsignada): ResultadoAsignacion {
  return { ...r, horarios: r.horarios.map(h => h.colaboradorId !== id ? h : { ...h, jornadas: h.jornadas.map(x => x.dia === d ? { ...j, dia: d } : x) }) }
}

export function proponerCobertura(e: EntradaReparacion): ResultadoReparacion {
  const inicio = Date.now()
  const presupuesto = e.presupuestoMs ?? 8000
  const hoy = e.ausencia.aviso
  const fechas = Array.from({ length: DIAS }, (_, d) => sumarDias(e.fechaLunes, d))
  const diasAusente = fechas.flatMap((f, d) => f >= hoy && e.ausencia.desde <= f && f <= e.ausencia.hasta ? [d] : [])
  const diasModificables = fechas.flatMap((f, d) => f > hoy && diasAusente.includes(d) ? [d] : [])
  // Se replanifican los días ausentes posteriores al aviso; «mejor cobertura» puede traer francos desde otros días
  // posteriores al aviso (ventana de intercambio), que también pasan a ser replanificables.
  const ventana = fechas.flatMap((f, d) => f > hoy ? [d] : [])
  const dem = demandaSlots(e.necesidadFranjas)
  const original = conMetricas(e.base, dem)
  const ausente = (id: string, d: number) => id === e.ausencia.colaboradorId && diasAusente.includes(d)
  const finMax = aMin(e.finCajeros ?? '22:30')
  const inicioMin = (e.operativa.aperturaSoloAux ?? true) ? 9 * 60 : 8 * 60

  const ctxDe = (modificables: number[]): Contexto => ({ e, dem, original, modificables: new Set(modificables), ausentes: new Set(diasModificables), ausente })
  const conAusencia = aplicarAusencia(original, e.ausencia, diasAusente)
  const sinCambios = recalcularApoyo(ctxDe(ventana), conAusencia)
  const base0 = conMetricas(conAusencia, dem)
  const violBase = new Set(e.validar(sinCambios).map(claveViolacion))
  // Faltante de mañana al domingo (todos los días que una propuesta puede tocar), igual medida para ambas.
  const faltanteOriginal = ventana.reduce((n, d) => n + faltantePorDia(original, dem)[d], 0)
  const faltanteSinCambios = ventana.reduce((n, d) => n + faltantePorDia(base0, dem)[d], 0)
  const faltanteDiaAviso = fechas.indexOf(hoy) >= 0 ? faltantePorDia(sinCambios, dem)[fechas.indexOf(hoy)] : 0

  const cajeros = original.horarios.filter(h => h.rolGeneral === 'cajero').map(h => h.colaboradorId)
  const valida = (j: JornadaAsignada, original?: JornadaAsignada) => {
    if (j.esFranco) return true
    const ini = aMin(j.turnos[0].inicio), fin = aMin(j.turnos[j.turnos.length - 1].fin)
    const finOrig = original && !original.esFranco ? aMin(original.turnos[original.turnos.length - 1].fin) : 0
    if (ini < inicioMin || fin > Math.max(finMax, finOrig) || fin > 23 * 60) return false
    return true
  }
  const descansoDomingo = (id: string, j: JornadaAsignada) => {
    const sig = e.inicioLunesSiguiente?.[id]
    if (j.esFranco || sig === undefined || sig === null) return true
    return 24 * 60 - aMin(j.turnos[j.turnos.length - 1].fin) + aMin(sig) >= 12 * 60
  }

  function buscar(opcion: Propuesta['opcion']): Propuesta {
    const dias = opcion === 'menor_impacto' ? diasModificables : ventana
    const c = ctxDe(ventana)
    let actual = recalcularApoyo(c, conAusencia)
    let m = medir(c, actual)
    // «Menor impacto» cambia a alguien solo si baja el faltante; «mejor cobertura» también si lo reparte mejor.
    const mejoraCobertura = (a: Medida, b: Medida) => a.faltante < b.faltante || (opcion === 'mejor_cobertura' && a.faltante === b.faltante && a.concentracion < b.concentracion)
    const peorCobertura = (a: Medida, b: Medida) => a.faltante > b.faltante || (opcion === 'mejor_cobertura' && a.faltante === b.faltante && a.concentracion > b.concentracion)
    const orden = (x: Medida) => opcion === 'mejor_cobertura' ? [x.faltante, x.concentracion, ...puntaje(x).slice(1)] : puntaje(x)
    const tabu = new Set<string>()
    const aceptable = (r: ResultadoAsignacion) => e.validar(r).every(v => violBase.has(claveViolacion(v)))
    const candidatos = (r: ResultadoAsignacion, porDia: number[]): Array<{ clave: string; r: ResultadoAsignacion }> => {
      const out: Array<{ clave: string; r: ResultadoAsignacion }> = []
      // Solo se busca cubrir los días de la ausencia; otros días cambian únicamente al intercambiar con ellos.
      const conFaltante = diasModificables.filter(d => porDia[d] > 0)
      const cob = cobertura(r)
      const ayuda = (d: number, j: JornadaAsignada) => !j.esFranco && slotsDeTurnos(j.turnos).some(s => cob[d][s] < dem[d][s])
      for (const id of cajeros) {
        const h = r.horarios.find(x => x.colaboradorId === id)!
        const orig = original.horarios.find(x => x.colaboradorId === id)!
        for (const d of conFaltante) {
          if (ausente(id, d)) continue
          const j = h.jornadas.find(x => x.dia === d)!
          const jo = orig.jornadas.find(x => x.dia === d)
          if (!j.esFranco) for (const delta of [-4, -3, -2, -1, 1, 2, 3, 4]) {
            const variantes = j.turnos.length > 1 ? [undefined, 0, 1] : [undefined]
            for (const tramo of variantes) {
              const nj = desplazar(j, delta, tramo)
              if (!valida(nj, jo) || (d === 6 && !descansoDomingo(id, nj)) || !ayuda(d, nj)) continue
              if (nj.turnos.some((t, i) => i > 0 && aMin(t.inicio) - aMin(nj.turnos[i - 1].fin) < 4 * 60)) continue
              out.push({ clave: `${id}|${d}|${delta}|${tramo ?? 'a'}|${JSON.stringify(nj.turnos)}`, r: conJornada(r, id, d, nj) })
            }
          }
          // Franco y medio franco en días seguidos: se trasladan juntos a otro par de días seguidos.
          if (opcion === 'mejor_cobertura' && j.esFranco && (e.operativa.francoMedioCorridos ?? false)) {
            const medio = [d - 1, d + 1].find(x => dias.includes(x) && !ausente(id, x) && h.jornadas.find(y => y.dia === x)!.rol === 'franco_medio')
            if (medio !== undefined) for (const x of dias) {
              const y = x + (medio - d)
              if ([x, y].some(z => z === d || z === medio || !dias.includes(z) || ausente(id, z))) continue
              const jx = h.jornadas.find(z => z.dia === x)!, jy = h.jornadas.find(z => z.dia === y)!
              if (jx.esFranco || jy.esFranco) continue
              let r2 = conJornada(r, id, d, { ...jx, dia: d })
              r2 = conJornada(r2, id, medio, { ...jy, dia: medio })
              r2 = conJornada(r2, id, x, { ...j, dia: x })
              r2 = conJornada(r2, id, y, { ...h.jornadas.find(z => z.dia === medio)!, dia: y })
              const nuevos = [d, medio, x, y].map(z => r2.horarios.find(hh => hh.colaboradorId === id)!.jornadas.find(jj => jj.dia === z)!)
              if (nuevos.some(jj => !valida(jj)) || [d, medio, x, y].some((z, i) => z === 6 && !descansoDomingo(id, nuevos[i]))) continue
              out.push({ clave: `${id}|par${d}${medio}>${x}${y}`, r: r2 })
            }
          }
          if (opcion === 'mejor_cobertura') for (const d2 of dias) {
            if (d2 === d || ausente(id, d2)) continue
            const j2 = h.jornadas.find(x => x.dia === d2)!
            if (mismaJornada(j, j2) || j2.esFranco || !ayuda(d, j2)) continue
            const a = { ...j2, dia: d }, b = { ...j, dia: d2 }
            if (!valida(a) || !valida(b) || (d === 6 && !descansoDomingo(id, a)) || (d2 === 6 && !descansoDomingo(id, b))) continue
            out.push({ clave: `${id}|${d}<>${d2}|${JSON.stringify(a.turnos)}`, r: conJornada(conJornada(r, id, d, a), id, d2, b) })
          }
        }
      }
      return out
    }

    // Ascenso: se acepta el mejor movimiento válido que BAJA el faltante (a igual faltante no se cambia a nadie).
    while ((m.faltante > 0 || m.concentracion > 0) && Date.now() - inicio < presupuesto) {
      const opciones = candidatos(actual, m.porDia)
        .filter(x => !tabu.has(x.clave))
        .map(x => { const r = recalcularApoyo(c, x.r); return { ...x, r, m: medir(c, r) } })
        .filter(x => mejoraCobertura(x.m, m))
        .sort((a, b) => mejor(orden(a.m), orden(b.m)) ? -1 : mejor(orden(b.m), orden(a.m)) ? 1 : 0)
      let aceptado = false
      for (const x of opciones) {
        if (Date.now() - inicio >= presupuesto) break
        if (!aceptable(x.r)) { tabu.add(x.clave); continue }
        actual = x.r; m = x.m; aceptado = true
        break
      }
      if (!aceptado) break
    }

    // Poda: se deshace cada cambio de cajero que no aporta cobertura (menos personas tocadas). Un intercambio de
    // días se deshace entero (deshacer una sola mitad dejaría la semana con otra composición).
    const duracion = (j: JornadaAsignada) => j.esFranco ? 0 : j.turnos.reduce((n, t) => n + aMin(t.fin) - aMin(t.inicio), 0)
    const probar = (r0: ResultadoAsignacion) => {
      const r = recalcularApoyo(c, r0), mm = medir(c, r)
      if (!peorCobertura(mm, m) && !mejor(orden(m), orden(mm)) && aceptable(r)) { actual = r; m = mm; return true }
      return false
    }
    for (const id of cajeros) {
      const orig = original.horarios.find(x => x.colaboradorId === id)!
      const cambiados = () => dias.filter(d => !ausente(id, d) && !mismaJornada(orig.jornadas.find(x => x.dia === d), actual.horarios.find(x => x.colaboradorId === id)!.jornadas.find(x => x.dia === d)))
      if (!cambiados().length) continue
      if (probar(cambiados().reduce((r, d) => conJornada(r, id, d, orig.jornadas.find(x => x.dia === d)!), actual))) continue
      for (const d of cambiados()) {
        const jo = orig.jornadas.find(x => x.dia === d)!, ja = actual.horarios.find(x => x.colaboradorId === id)!.jornadas.find(x => x.dia === d)!
        if (jo.esFranco === ja.esFranco && duracion(jo) === duracion(ja)) probar(conJornada(actual, id, d, jo))
      }
    }

    const violaciones = e.validar(actual)
    return { opcion, plan: actual, cambios: m.cambios, faltante: m.faltante, faltantePorDia: m.porDia, personas: m.personas,
      jornadas: m.jornadas, francosMovidos: m.francosMovidos, franjasDobles: m.franjasDobles, violaciones }
  }

  const menorImpacto = buscar('menor_impacto')
  const mejorCobertura = buscar('mejor_cobertura')
  const coinciden = mejorCobertura.cambios.length === menorImpacto.cambios.length &&
    JSON.stringify(mejorCobertura.cambios) === JSON.stringify(menorImpacto.cambios)
  return {
    hoy, diasAusente, diasModificables, faltanteOriginal, faltanteSinCambios, faltanteDiaAviso, sinCambios,
    menorImpacto, mejorCobertura: coinciden ? { ...menorImpacto, opcion: 'mejor_cobertura' } : mejorCobertura, coinciden,
  }
}

/** Horario de cada día de la semana, para mostrar «antes → después». */
export const horarioDelDia = (h: HorarioColaborador | undefined, d: number) => textoTurnos(h?.jornadas.find(j => j.dia === d))
