import { reglasDeTurno } from './turnos'
import { aperturaAuxUnicoAutorizada, erroresDatosRecursos, excepcionAperturaAuxUnico } from './politicaRecursos'
import { ausenciasConTurnos, horariosAcreditados, type AusenciaValidacion } from '../contingencias/ausencias'
import type { PoliticaRecursos } from './politicaRecursos'
// src/algoritmo/validadorIndependiente.ts
// VAL-01 (#10) — Validador independiente del motor.
//
// Valida un horario en formato UI (el que se muestra, se edita a mano y se
// publica), sin depender de cómo se generó: motor actual, CP-SAT o edición manual.
// Trabaja con horas reales (minutos), no con slots del motor.
//
// Los valores normativos NO están en el código: llegan en un PerfilNormativo.
// PERFIL_MOTOR_ACTUAL reproduce lo que hoy implementa el motor; su carácter legal
// está pendiente de validación (MASTER §3.A, decisiones D1–D3). No es una decisión.

import type { ExcepcionSemanal, Franja, HorarioColaborador, AsignacionCajaColaborador } from '../types'
import { PERFIL_HORAS_VIGENTE, PERFIL_HORAS_HISTORICO_31, perfilHorasDeSemana, type PerfilHorasContrato } from './contratos'

import { esMaxBloquesCajaEventual, slotLimiteCajaEventual } from './reglasCajaEventual'

// ======================= PERFIL =======================

export interface ReglasContrato {
  horasSemanaMax: number
  /** Si se define, las horas semanales deben ser exactamente este valor (D1). */
  horasSemanaExactas?: number
  /** AH2-071: mínimo semanal (horas adicionales «hasta»: no menos que la ficha). */
  horasSemanaMin?: number
  /** Cantidad exacta de días de franco completos. */
  francosSemana: number
  /** Bloques máximos por día (1 = solo corrida). */
  maxBloquesDia: number
  /** Separación mínima entre bloques de una jornada cortada, en horas. */
  corteMinHoras: number
  horasDiaMin?: number
  horasDiaMax?: number
  /** Multiconjunto exacto de horas por día trabajado (p. ej. FULL 3×9 + 2×8 + 1×5) (D1). */
  composicionHorasDia?: number[]
  /** Cantidad exacta de jornadas cortadas en la semana. */
  jornadasCortadasExactas?: number
}

export interface PerfilNormativo {
  id: string
  nombre: string
  estado: 'PROPUESTO' | 'VALIDADO'
  fuente: string
  descansoEntreJornadasHoras: number
  /** Perfil de horas por contrato del que deriva (contratos.ts). */
  perfilHorasId?: string
  contratos: { FULL: ReglasContrato; PART: ReglasContrato }
}

/**
 * Perfil normativo a partir de un perfil de horas por contrato (#7): el máximo
 * semanal FULL/PART sale de la MISMA definición que usa el motor (contratos.ts).
 */
export function perfilNormativoDesdeHoras(horas: PerfilHorasContrato): PerfilNormativo {
  return {
    id: `motor-${horas.id}`,
    nombre: `Reglas del motor · ${horas.nombre}`,
    estado: 'PROPUESTO',
    fuente: `src/algoritmo/reglas.ts, catalogos.ts y contratos.ts (${horas.id}). Sin validación jurídica (AH2-004, D1–D3).`,
    descansoEntreJornadasHoras: 12,
    perfilHorasId: horas.id,
    contratos: {
      FULL: {
        horasSemanaMax: horas.maximoHoras.FULL, horasSemanaExactas: 48, francosSemana: 1, maxBloquesDia: 2, corteMinHoras: 4,
        composicionHorasDia: [9, 9, 9, 8, 8, 5], jornadasCortadasExactas: 2,
      },
      PART: { horasSemanaMax: horas.maximoHoras.PART, francosSemana: 1, maxBloquesDia: 1, corteMinHoras: 4, horasDiaMin: 4, horasDiaMax: 6 },
    },
  }
}

/** Perfil vigente del motor (PART ≤ 32 h, requisito de producto AH2-004/AH2-014). */
export const PERFIL_MOTOR_ACTUAL: PerfilNormativo = perfilNormativoDesdeHoras(PERFIL_HORAS_VIGENTE)
/** Perfil con el que se generaron las semanas anteriores a #7 (PART ≤ 31 h). */
export const PERFIL_MOTOR_HISTORICO_31: PerfilNormativo = perfilNormativoDesdeHoras(PERFIL_HORAS_HISTORICO_31)

/** Perfil normativo de una semana guardada según el perfil de horas que registró (o el histórico). */
export function perfilNormativoDeSemana(perfilHorasId?: string): PerfilNormativo {
  return perfilNormativoDesdeHoras(perfilHorasDeSemana(perfilHorasId))
}

// ======================= ENTRADA / SALIDA =======================

export type Contrato = 'FULL' | 'PART' | 'AUX' | 'EVENTUAL'
export type NivelViolacion = 'NORMATIVA' | 'OPERATIVA' | 'DATOS'

export interface Violacion {
  codigo: string
  nivel: NivelViolacion
  colaboradorId?: string
  dia?: number
  franja?: string
  detalle: string
}

export interface EntradaValidacion {
  condicionesSupervisor?: import('./condicionesTipos').AuditoriaCondiciones
  horarios: HorarioColaborador[]
  /** Contrato y nombre de cada persona (por id de UI). */
  roster: Array<{ id: string; nombre: string; contrato: Contrato; horarioSemanal?: string[] }>
  perfil: PerfilNormativo
  /** Excepciones/reglas por colaborador vigentes (mismo formato que usa el motor; franco_dia con índice 0..6). */
  excepciones?: ExcepcionSemanal[]
  /** AH2-071: horas adicionales PART por nombre (sigue siendo PART: hasta 8 h por día y cortada con corte ≥ 4 h). */
  horasAdicionales?: Record<string, { modo: 'exacto' | 'hasta'; horas: number; fichaHoras?: number }>
  /** Tope de francos FULL+PART por día. */
  maxFrancosDia?: number
  maxFrancosPorDia?: number[]
  /** Demanda POM (31 filas 07:00–22:00) para métricas y mínimos. */
  necesidad?: Franja[]
  /** Mínimo de personas en caja por franja (regla operativa). slotDesde/Hasta: slots de 30 min desde 08:00. */
  minimosCajeros?: Array<{ dia: number; slotDesde: number; slotHasta: number; cantidad: number }>
  cajaAux?: AsignacionCajaColaborador[]
  cajaEventual?: AsignacionCajaColaborador[]
  /** Horarios de la semana anterior (para 12 h domingo → lunes). */
  semanaAnterior?: HorarioColaborador[]
  /** Salida efectiva del domingo anterior, importada sin usar simulaciones. null = franco. */
  finDomingoAnteriorPorId?: Record<string, string | null>
  /**
   * #38 — Estado EFECTIVO de las reglas operativas de la sucursal con el que se
   * generó/edita la semana. Si se informa, se validan como reglas obligatorias:
   * composición de la apertura, categoría de quien está en caja, AUX en caja solo
   * dentro de su presencia, eventuales solo dentro de su disponibilidad, ≥1 AUX
   * parado supervisando 09:00–22:00, sin AUX en caja al cierre y sin cobertura
   * duplicada indebida (AUX/eventual en caja donde la demanda ya está cubierta).
   */
  operativa?: OperativaValidacion
  /**
   * AH2-057 · Ausencias sobre jornadas comunicadas (además de las marcadas en `horarios[].jornadas[].ausencia`).
   * El contrato y el descanso se validan con la jornada comunicada; la cobertura, con la visible (vacía).
   */
  ausencias?: AusenciaValidacion[]
}

export interface OperativaValidacion extends PoliticaRecursos {
  maxBloquesCajaEventualDia?: number
  /** AH2-070: tramos de caja por día de cada supervisor. */
  maxBloquesCajaAuxDia?: number
  eventualesCajaHoraLimite?: string
  aperturaSoloAux: boolean
  sinAuxCierre?: boolean
  supervisorJornadaCompleta?: boolean
}

export interface MetricasValidacion {
  /** [franja][dia] personas en caja (franjas de HORAS de `necesidad`). */
  cobertura: number[][]
  faltantes: number[][]
  sobrantes: number[][]
  horasCajaFaltantes: number
  horasCajaSobrantes: number
}

export interface ResultadoValidacion {
  ok: boolean
  /** true si no hay violaciones NORMATIVA ni OPERATIVA ni DATOS. */
  publicable: boolean
  violaciones: Violacion[]
  advertencias?: string[]
  /** #38: datos que faltaron para validar todo (p. ej. semanas históricas). Impiden VALIDADO. */
  limitaciones?: string[]
  metricas?: MetricasValidacion
}

// ======================= HELPERS =======================

const min = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const eq = (a: number, b: number) => Math.abs(a - b) < 0.01

interface Bloque { ini: number; fin: number }

/** Bloques de una jornada en minutos desde 00:00 (fin puede ser 24:00 = 1440). */
function bloquesDe(turnos: { inicio: string; fin: string }[]): Bloque[] {
  return turnos.map(t => ({ ini: min(t.inicio), fin: min(t.fin) })).sort((a, b) => a.ini - b.ini)
}

function jornadasPorDia(h: HorarioColaborador): (Bloque[] | null)[] {
  const out: (Bloque[] | null)[] = Array(7).fill(null)
  for (const j of h.jornadas) out[j.dia] = j.esFranco ? [] : bloquesDe(j.turnos)
  return out
}

// ======================= VALIDACIÓN =======================

export function validarHorario(e: EntradaValidacion): ResultadoValidacion {
  const v: Violacion[] = []
  const porId = new Map(e.roster.map(r => [r.id, r]))
  const vistos = new Set<string>()
  validarSnapshotCondiciones(e,v)
  // AH2-057: contrato, descanso, reglas por persona y francos se miden con la jornada comunicada de los días ausentes.
  const horariosContrato = horariosAcreditados(e.horarios, e.ausencias)
  for (const a of ausenciasConTurnos(e.horarios)) {
    v.push({ codigo: 'DATOS_AUSENCIA_CON_TURNOS', nivel: 'DATOS', colaboradorId: a.colaboradorId, dia: a.dia, detalle: `${porId.get(a.colaboradorId)?.nombre ?? a.colaboradorId}: figura ausente el ${DIAS[a.dia]} pero tiene turnos cargados.` })
  }

  for (const h of horariosContrato) {
    const persona = porId.get(h.colaboradorId)
    if (!persona) {
      v.push({ codigo: 'DATOS_SIN_ROSTER', nivel: 'DATOS', colaboradorId: h.colaboradorId, detalle: 'El horario no corresponde a ningún colaborador del roster.' })
      continue
    }
    if (vistos.has(h.colaboradorId)) {
      v.push({ codigo: 'DATOS_DUPLICADO', nivel: 'DATOS', colaboradorId: h.colaboradorId, detalle: `${persona.nombre} aparece más de una vez.` })
      continue
    }
    vistos.add(h.colaboradorId)
    const dias = jornadasPorDia(h)
    const nombre = persona.nombre

    // Estructura: 7 días, bloques válidos y sin solaparse
    dias.forEach((b, d) => {
      if (b === null) v.push({ codigo: 'DATOS_DIA_FALTANTE', nivel: 'DATOS', colaboradorId: h.colaboradorId, dia: d, detalle: `${nombre}: falta el ${DIAS[d]}.` })
      b?.forEach((x, i) => {
        if (!(x.fin > x.ini)) v.push({ codigo: 'DATOS_BLOQUE_INVALIDO', nivel: 'DATOS', colaboradorId: h.colaboradorId, dia: d, detalle: `${nombre}: bloque con fin ≤ inicio el ${DIAS[d]}.` })
        if (i > 0 && x.ini < b[i - 1].fin) v.push({ codigo: 'DATOS_SOLAPE', nivel: 'DATOS', colaboradorId: h.colaboradorId, dia: d, detalle: `${nombre}: bloques superpuestos el ${DIAS[d]}.` })
      })
    })

    if (persona.contrato === 'FULL' || persona.contrato === 'PART') {
      // AH2-056: un pedido de turno fija la cantidad de cortadas FULL de la semana ('max' sin resolver: no se exige).
      const reglas = e.perfil.contratos[persona.contrato]
      const pedido = reglasDeTurno(e.excepciones ?? [], h.colaboradorId, nombre)
      const ad = persona.contrato === 'PART' ? e.horasAdicionales?.[nombre] : undefined
      const reglasPersona = persona.contrato === 'FULL' && reglas.jornadasCortadasExactas !== undefined
        ? { ...reglas, jornadasCortadasExactas: pedido.cortadas === 'max' ? undefined : pedido.cortadas }
        : ad
          ? { ...reglas, horasSemanaMax: ad.horas, maxBloquesDia: 2, horasDiaMax: 8, corteMinHoras: 4,
              ...(ad.modo === 'exacto' ? { horasSemanaExactas: ad.horas } : ad.fichaHoras !== undefined ? { horasSemanaMin: ad.fichaHoras } : {}) }
          : reglas
      validarContrato(v, h.colaboradorId, nombre, dias, reglasPersona, persona.contrato)
      validarDescanso(v, h.colaboradorId, nombre, dias, e.perfil.descansoEntreJornadasHoras, e.semanaAnterior, e.finDomingoAnteriorPorId)
      validarExcepciones(v, h.colaboradorId, nombre, dias, (e.excepciones ?? []).filter(x => x.colaboradorId?x.colaboradorId===h.colaboradorId:x.colaboradorNombre === nombre))
    }
  }

  // Tope de francos simultáneos (FULL + PART)
  if (e.maxFrancosDia !== undefined || e.maxFrancosPorDia) {
    for (let d = 0; d < 7; d++) {
      const n = horariosContrato.filter(h => {
        const c = porId.get(h.colaboradorId)?.contrato
        return (c === 'FULL' || c === 'PART') && h.jornadas.some(j => j.dia === d && j.esFranco)
      }).length
      const max = e.maxFrancosPorDia?.[d] ?? e.maxFrancosDia ?? 2
      if (n > max) {
        v.push({ codigo: 'OP_MAX_FRANCOS_DIA', nivel: 'OPERATIVA', dia: d, detalle: `${n} francos de cajeros el ${DIAS[d]} (máximo ${max}).` })
      }
    }
  }

  const metricas = e.necesidad ? calcularMetricas(e, porId) : undefined

  // Mínimo de personas en caja por franja (regla operativa)
  if (e.minimosCajeros?.length && metricas && e.necesidad) {
    const fila = new Map(e.necesidad.map((f, i) => [f.hora, i]))
    for (const m of e.minimosCajeros) {
      for (let d = 0; d < 7; d++) {
        if (m.dia !== -1 && m.dia !== d) continue
        for (let s = m.slotDesde; s < m.slotHasta; s++) {
          const hora = `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`
          const i = fila.get(hora)
          if (i === undefined) continue
          if (metricas.cobertura[i][d] < m.cantidad) {
            v.push({ codigo: 'OP_MIN_CAJEROS', nivel: 'OPERATIVA', dia: d, franja: hora, detalle: `${metricas.cobertura[i][d]} en caja el ${DIAS[d]} ${hora} (mínimo ${m.cantidad}).` })
          }
        }
      }
    }
  }

  if (e.operativa) validarReglasOperativas(v, e, e.operativa, porId)

  const bloqueantes = v.length
  return { ok: bloqueantes === 0, publicable: bloqueantes === 0 && !e.operativa?.politica_recursos_version && !e.condicionesSupervisor, violaciones: v, metricas, ...(e.operativa?.politica_recursos_version?{limitaciones:['Política de recursos v1: alcance AH2-036–038; pendiente homologación de comparabilidad semanal AUX/EVENTUAL AH2-040. No habilita publicación.']}: {}) }
}

function validarContrato(
  v: Violacion[], id: string, nombre: string, dias: (Bloque[] | null)[], r: ReglasContrato, contrato: 'FULL' | 'PART',
) {
  const horasDia = dias.map(b => (b ?? []).reduce((s, x) => s + (x.fin - x.ini) / 60, 0))
  const total = horasDia.reduce((a, b) => a + b, 0)
  const push = (codigo: string, detalle: string, dia?: number) =>
    v.push({ codigo, nivel: 'NORMATIVA', colaboradorId: id, dia, detalle: `${nombre} (${contrato}): ${detalle}` })

  if (total > r.horasSemanaMax + 0.01) push('NORM_HORAS_MAX', `${total} h semanales (máximo ${r.horasSemanaMax}).`)
  if (r.horasSemanaExactas !== undefined && !eq(total, r.horasSemanaExactas)) push('NORM_HORAS_EXACTAS', `${total} h semanales (deben ser ${r.horasSemanaExactas}).`)
  if (r.horasSemanaMin !== undefined && total < r.horasSemanaMin - 0.01) push('NORM_HORAS_MIN', `${total} h semanales (mínimo ${r.horasSemanaMin}).`)

  const francos = dias.filter(b => b !== null && b.length === 0).length
  if (francos !== r.francosSemana) push('NORM_FRANCOS', `${francos} francos (deben ser ${r.francosSemana}).`)

  let cortadas = 0
  dias.forEach((b, d) => {
    if (!b || b.length === 0) return
    if (b.length > r.maxBloquesDia) push('NORM_BLOQUES_DIA', `${b.length} bloques el ${DIAS[d]} (máximo ${r.maxBloquesDia}).`, d)
    if (b.length > 1) {
      cortadas++
      for (let i = 1; i < b.length; i++) {
        const corte = (b[i].ini - b[i - 1].fin) / 60
        if (corte < r.corteMinHoras - 0.01) push('NORM_CORTE_MIN', `corte de ${corte} h el ${DIAS[d]} (mínimo ${r.corteMinHoras} h).`, d)
      }
    }
    if (r.horasDiaMin !== undefined && horasDia[d] < r.horasDiaMin - 0.01) push('NORM_HORAS_DIA_MIN', `${horasDia[d]} h el ${DIAS[d]} (mínimo ${r.horasDiaMin}).`, d)
    if (r.horasDiaMax !== undefined && horasDia[d] > r.horasDiaMax + 0.01) push('NORM_HORAS_DIA_MAX', `${horasDia[d]} h el ${DIAS[d]} (máximo ${r.horasDiaMax}).`, d)
  })
  if (r.jornadasCortadasExactas !== undefined && cortadas !== r.jornadasCortadasExactas) {
    push('NORM_CORTADAS', `${cortadas} jornadas cortadas (deben ser ${r.jornadasCortadasExactas}).`)
  }
  if (r.composicionHorasDia) {
    const real = horasDia.filter(x => x > 0).sort((a, b) => a - b)
    const esperada = [...r.composicionHorasDia].sort((a, b) => a - b)
    if (real.length !== esperada.length || real.some((x, i) => !eq(x, esperada[i]))) {
      push('NORM_COMPOSICION', `jornadas de ${real.join('+')} h (composición esperada ${esperada.join('+')} h).`)
    }
  }
}

function validarDescanso(
  v: Violacion[], id: string, nombre: string, dias: (Bloque[] | null)[], horas: number, semanaAnterior?: HorarioColaborador[],
  finDomingoAnteriorPorId?: Record<string, string | null>,
) {
  // Fin del domingo anterior, si existe
  let finPrevio: number | null = null
  if (finDomingoAnteriorPorId && Object.prototype.hasOwnProperty.call(finDomingoAnteriorPorId, id)) {
    const fin = finDomingoAnteriorPorId[id]
    if (fin !== null) finPrevio = min(fin) - 1440 // relativo al lunes 00:00
  } else {
    const prev = semanaAnterior?.find(h => h.colaboradorId === id)
    if (prev) {
      const dom = jornadasPorDia(prev)[6]
      if (dom && dom.length) finPrevio = dom[dom.length - 1].fin - 1440
    }
  }
  for (let d = 0; d < 7; d++) {
    const b = dias[d]
    if (!b || b.length === 0) { finPrevio = null; continue }
    const inicio = d * 1440 + b[0].ini
    if (finPrevio !== null) {
      const descanso = (inicio - finPrevio) / 60
      if (descanso < horas - 0.01) {
        v.push({
          codigo: 'NORM_DESCANSO', nivel: 'NORMATIVA', colaboradorId: id, dia: d,
          detalle: `${nombre}: ${descanso} h de descanso antes del ${DIAS[d]}${d === 0 ? ' (desde el domingo anterior)' : ''} (mínimo ${horas} h).`,
        })
      }
    }
    finPrevio = d * 1440 + b[b.length - 1].fin
  }
}

function validarExcepciones(v: Violacion[], id: string, nombre: string, dias: (Bloque[] | null)[], exc: ExcepcionSemanal[]) {
  for (const x of exc) {
    dias.forEach((b, d) => {
      if (!b || (x.dias && !x.dias.includes(d))) return
      const franco = b.length === 0
      const push = (detalle: string) =>
        v.push({ codigo: `OP_${x.tipo.toUpperCase()}`, nivel: 'OPERATIVA', colaboradorId: id, dia: d, detalle: `${nombre}: ${detalle} (${x.descripcion || x.tipo}).` })
      switch (x.tipo) {
        case 'franco_dia': {
          const fd = parseInt(x.valor ?? '-1')
          if (d === fd && !franco) push(`trabaja el ${DIAS[d]} con franco fijo`)
          if (d !== fd && franco) push(`franco el ${DIAS[d]} en lugar del ${DIAS[fd] ?? '?'}`)
          break
        }
        case 'no_antes_de':
          if (!franco && x.valor && b[0].ini < min(x.valor)) push(`entra antes de ${x.valor} el ${DIAS[d]}`)
          break
        case 'inicio_no_despues_de':
          if(!franco&&x.valor&&b[0].ini>min(x.valor))push(`entra después del máximo de inicio ${x.valor}`)
          break
        case 'no_despues_de':
          if (!franco && x.valor && b[b.length - 1].fin > min(x.valor)) push(`sale después de ${x.valor} el ${DIAS[d]}`)
          break
        case 'solo_matutino':
          if (!franco && b[0].ini > min('10:00')) push(`turno no matutino el ${DIAS[d]}`)
          break
        case 'solo_nocturno':
          if (!franco && b[0].ini < min('17:00')) push(`turno no nocturno el ${DIAS[d]}`)
          break
        case 'siempre_cierre': {
          const mananaCorrida = b.length === 1 && b[0].ini <= min('11:00')
          if (!franco && !mananaCorrida && b[b.length - 1].fin < min('22:00')) push(`no cierra el ${DIAS[d]}`)
          break
        }
      }
    })
  }
}

function calcularMetricas(e: EntradaValidacion, porId: Map<string, { contrato: Contrato }>): MetricasValidacion {
  const nec = e.necesidad!
  const cobertura = nec.map(() => Array(7).fill(0))
  const filaDeMin = (m: number) => nec.findIndex(f => min(f.hora) === m)
  // Cajeros FULL/PART: un bloque cubre cada franja de 30 min cuyo inicio cae dentro.
  for (const h of e.horarios) {
    const c = porId.get(h.colaboradorId)?.contrato
    if (c !== 'FULL' && c !== 'PART') continue
    for (const j of h.jornadas) {
      if (j.esFranco) continue
      for (const b of bloquesDe(j.turnos)) {
        for (let t = b.ini; t < b.fin; t += 30) {
          const i = filaDeMin(t)
          if (i >= 0) cobertura[i][j.dia]++
        }
      }
    }
  }
  // AUX y EVENTUAL en caja: slots desde 08:00
  for (const a of [...(e.cajaAux ?? []), ...(e.cajaEventual ?? [])]) {
    a.slotsCajaPorDia.forEach((fila, d) => fila.forEach((enCaja, s) => {
      if (!enCaja) return
      const i = filaDeMin(8 * 60 + s * 30)
      if (i >= 0) cobertura[i][d]++
    }))
  }
  const faltantes = nec.map((f, i) => f.necesidad.map((dem, d) => Math.max(0, dem - cobertura[i][d])))
  const sobrantes = nec.map((f, i) => f.necesidad.map((dem, d) => Math.max(0, cobertura[i][d] - dem)))
  const suma = (m: number[][]) => m.flat().reduce((a, b) => a + b, 0) / 2
  return { cobertura, faltantes, sobrantes, horasCajaFaltantes: suma(faltantes), horasCajaSobrantes: suma(sobrantes) }
}

// ======================= REGLAS OPERATIVAS (#38) =======================

const SLOTS = 30
const horaDeSlot = (s: number) => `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`

/** Matriz 7×30 de presencia a partir de bloques "HH:MM-HH:MM|…" por día. */
function matrizDeHorarioSemanal(hs: string[]): boolean[][] {
  return Array.from({ length: 7 }, (_, d) => {
    const fila = Array(SLOTS).fill(false)
    for (const r of (hs[d] ?? '').split('|').map(x => x.trim()).filter(Boolean)) {
      const [a, b] = r.split('-')
      if (!a || !b) continue
      for (let t = min(a); t < min(b); t += 30) {
        const s = (t - 8 * 60) / 30
        if (s >= 0 && s < SLOTS && Number.isInteger(s)) fila[s] = true
      }
    }
    return fila
  })
}

/** Matriz 7×30 de presencia a partir de las jornadas UI (filas AUX = presencia). */
function matrizDeJornadas(h: HorarioColaborador): boolean[][] {
  const m = Array.from({ length: 7 }, () => Array(SLOTS).fill(false))
  for (const j of h.jornadas) {
    if (j.esFranco) continue
    for (const b of bloquesDe(j.turnos)) for (let t = b.ini; t < b.fin; t += 30) {
      const s = Math.floor((t - 8 * 60) / 30)
      if (s >= 0 && s < SLOTS) m[j.dia][s] = true
    }
  }
  return m
}

function validarReglasOperativas(
  v: Violacion[], e: EntradaValidacion, op: OperativaValidacion, porId: Map<string, { nombre: string; contrato: Contrato; horarioSemanal?: string[] }>,
) {
  const sinAuxCierre = op.sinAuxCierre ?? true
  const nombre = (id: string) => porId.get(id)?.nombre ?? id
  const demanda = (d: number, s: number) => e.necesidad?.find(f => f.hora === horaDeSlot(s))?.necesidad[d] ?? 0

  // Cajeros FULL/PART en caja por día/slot
  const fp = Array.from({ length: 7 }, () => Array(SLOTS).fill(0))
  for (const h of e.horarios) {
    const c = porId.get(h.colaboradorId)?.contrato
    if (c !== 'FULL' && c !== 'PART') continue
    const m = matrizDeJornadas(h)
    m.forEach((fila, d) => fila.forEach((x, s) => { if (x) fp[d][s]++ }))
  }

  // Categoría: en cajaAux solo AUX; en cajaEventual solo EVENTUAL.
  const revisarCategoria = (lista: AsignacionCajaColaborador[] | undefined, esperado: Contrato) => {
    for (const a of lista ?? []) {
      const c = porId.get(a.colaboradorId)?.contrato
      if (c !== esperado && a.slotsCajaPorDia.some(f => f.some(Boolean))) {
        v.push({ codigo: 'OP_CATEGORIA', nivel: 'OPERATIVA', colaboradorId: a.colaboradorId, detalle: `${nombre(a.colaboradorId)} figura en caja como ${esperado} pero su categoría es ${c ?? 'desconocida'}.` })
      }
    }
  }
  revisarCategoria(e.cajaAux, 'AUX')
  revisarCategoria(e.cajaEventual, 'EVENTUAL')

  // Presencia de AUX: fila editada del horario (si existe) o patrón del roster.
  const presencia = new Map<string, boolean[][]>()
  for (const [id, r] of porId) {
    if (r.contrato !== 'AUX') continue
    const fila = e.horarios.find(h => h.colaboradorId === id)
    if (fila) presencia.set(id, matrizDeJornadas(fila))
    else if (r.horarioSemanal) presencia.set(id, matrizDeHorarioSemanal(r.horarioSemanal))
  }
  const auxCaja = new Map((e.cajaAux ?? []).filter(a => porId.get(a.colaboradorId)?.contrato === 'AUX').map(a => [a.colaboradorId, a.slotsCajaPorDia]))
  const evCaja = (e.cajaEventual ?? []).filter(a => porId.get(a.colaboradorId)?.contrato === 'EVENTUAL')
  const enCaja = (m: boolean[][] | undefined, d: number, s: number) => !!m?.[d]?.[s]

  v.push(...erroresDatosRecursos(op,[...porId].filter(([,r])=>r.contrato==='EVENTUAL').map(([id])=>id)).map(detalle=>({codigo:'DATOS_RECURSOS',nivel:'DATOS' as const,detalle})));
  // AH2-036/037: verificación independiente sobre presencia y caja efectivas.
  if (op.politica_recursos_version !== undefined) {
    if (op.politica_recursos_version !== 1) v.push({codigo:'DATOS_POLITICA_RECURSOS',nivel:'DATOS',detalle:'Versión de política no soportada.'})
    for (const [id,r] of porId) if(r.contrato==='EVENTUAL') {
      const cap=op.max_caja_eventual_slots?.[id]
      const m=evCaja.find(x=>x.colaboradorId===id)?.slotsCajaPorDia ?? []
      const count=m.flat().filter(Boolean).length
      if(!Number.isInteger(cap) || cap!<0 || cap!>210) v.push({codigo:'POLITICA_EV_COMPARACION_PENDIENTE',nivel:'DATOS',colaboradorId:id,detalle:'Sin tope explícito o dato inválido: falta homologar la comparación semanal AUX/EV.'})
      else if(count>cap!) v.push({codigo:'OP_EVENTUAL_TOPE_SEMANAL',nivel:'OPERATIVA',colaboradorId:id,detalle:'Supera el máximo semanal individual de caja.'})
      for(let d=0;d<7;d++) for(let slot=0;slot<30;slot++) if(m[d]?.[slot] && op.reservas_sector_eventual?.[id]?.[d]?.[slot]) v.push({codigo:'OP_EVENTUAL_RESERVA_SECTOR',nivel:'OPERATIVA',colaboradorId:id,dia:d,detalle:'Caja dentro de una reserva sectorial.'})
    }
    // Supervisor designado del día (misma regla que el motor: más presencia, desempate por id).
    const designadoDia=(d:number)=>{
      if(!op.supervisorJornadaCompleta)return undefined
      const ids=[...presencia.keys()]
      if(!Array.from({length:30},(_,s)=>ids.filter(id=>presencia.get(id)![d][s]).length).some(x=>x>=2))return undefined
      return [...ids].sort((x,y)=>presencia.get(y)![d].filter(Boolean).length-presencia.get(x)![d].filter(Boolean).length||(x<y?-1:x>y?1:0))[0]
    }
    for(let d=0;d<7;d++) for(let slot=0;slot<30;slot++) {
      const n=[...presencia.values()].filter(m=>m[d][slot]).length
      const a=[...auxCaja.values()].filter(m=>m[d]?.[slot]).length
      const ev=evCaja.filter(m=>m.slotsCajaPorDia[d]?.[slot]).length
      if(n>2) v.push({codigo:'POLITICA_AUX_MULTIPLE',nivel:'DATOS',dia:d,detalle:'Generalización para más de dos AUX pendiente.'})
      if(slot<2 && op.aperturaSoloAux && demanda(d,slot)>0 && n===1 && !aperturaAuxUnicoAutorizada(op,d,slot)) v.push({codigo:'POLITICA_APERTURA_SUPERVISION',nivel:'DATOS',dia:d,detalle:'AUX único de apertura: falta supervisor distinto autorizado o la excepción local AH2-037 para esta franja.'})
      // AH2-070: un AUX en su tope de tramos del día que tendría que abrir uno nuevo no es elegible.
      const topeTramos=(id:string)=>{const cap=op.maxBloquesCajaAuxDia;if(cap===undefined)return false;const f=auxCaja.get(id)?.[d]??[]
        return !f[slot-1]&&!f[slot+1]&&f.filter((x,s)=>x&&!f[s-1]).length>=cap}
      const elegibleAux=op.maxBloquesCajaAuxDia===undefined||[...presencia].some(([id,m])=>m[d][slot]&&!topeTramos(id)&&id!==designadoDia(d))
      if(slot>=2 && slot<=(sinAuxCierre?27:28) && n===2 && demanda(d,slot)>fp[d][slot] && a<1 && elegibleAux) v.push({codigo:'OP_PRIORIDAD_AUX',nivel:'OPERATIVA',dia:d,detalle:`AUX elegible sin caja con demanda residual; eventuales usados: ${ev}.`})
    }
  }
  // AUX en caja fuera de su presencia / al cierre
  for (const [id, m] of auxCaja) {
    const pres = presencia.get(id)
    for (let d = 0; d < 7; d++) {
      const fuera: string[] = []
      const cierre: string[] = []
      for (let s = 0; s < SLOTS; s++) {
        if (!m[d]?.[s]) continue
        if (pres && !pres[d][s]) fuera.push(horaDeSlot(s))
        if (s >= 29 || (sinAuxCierre && s >= 28)) cierre.push(horaDeSlot(s))
      }
      if (fuera.length) v.push({ codigo: 'OP_AUX_FUERA_PRESENCIA', nivel: 'OPERATIVA', colaboradorId: id, dia: d, detalle: `${nombre(id)}: en caja el ${DIAS[d]} fuera de su horario de presencia (${fuera.join(', ')}).` })
      if (cierre.length) v.push({ codigo: 'OP_AUX_CIERRE', nivel: 'OPERATIVA', colaboradorId: id, dia: d, detalle: `${nombre(id)}: supervisor en caja el ${DIAS[d]} después de las 22:00 (${cierre.join(', ')}).` })
    }
  }

  if (op.maxBloquesCajaAuxDia !== undefined) for (const [id, m] of auxCaja) for (let d = 0; d < 7; d++) {
    const fila = m[d] ?? []
    const tramos = fila.filter((enCaja, s) => enCaja && !fila[s - 1]).length
    if (tramos > op.maxBloquesCajaAuxDia) v.push({ codigo: 'OP_AUX_MAX_TRAMOS', nivel: 'OPERATIVA', colaboradorId: id, dia: d, detalle: `${nombre(id)}: ${tramos} tramos de caja el ${DIAS[d]} (máximo ${op.maxBloquesCajaAuxDia}).` })
  }
  const maxBloques = op.maxBloquesCajaEventualDia
  const limite = slotLimiteCajaEventual(op.eventualesCajaHoraLimite)
  if ((maxBloques !== undefined && !esMaxBloquesCajaEventual(maxBloques)) ||
      (op.eventualesCajaHoraLimite !== undefined && limite === undefined)) {
    v.push({ codigo: 'DATOS_REGLA_CAJA_EVENTUAL', nivel: 'DATOS', detalle: 'Los límites configurados para caja de eventuales no son válidos.' })
  }
  for (const a of evCaja) {
    const hs = porId.get(a.colaboradorId)?.horarioSemanal
    const disp = hs ? matrizDeHorarioSemanal(hs) : undefined
    for (let d = 0; d < 7; d++) {
      const fila = a.slotsCajaPorDia[d] ?? []
      const bloques = fila.filter((enCaja, s) => enCaja && !fila[s - 1]).length
      if (esMaxBloquesCajaEventual(maxBloques) && bloques > maxBloques) {
        v.push({ codigo: 'OP_EVENTUAL_MAX_BLOQUES', nivel: 'OPERATIVA', colaboradorId: a.colaboradorId, dia: d, detalle: `${nombre(a.colaboradorId)}: ${bloques} bloques de caja el ${DIAS[d]} (máximo ${maxBloques}).` })
      }
      const cierre = limite === undefined ? [] : fila.flatMap((enCaja, s) => enCaja && s >= limite ? [horaDeSlot(s)] : [])
      if (cierre.length) {
        v.push({ codigo: 'OP_EVENTUAL_CIERRE', nivel: 'OPERATIVA', colaboradorId: a.colaboradorId, dia: d, detalle: `${nombre(a.colaboradorId)}: en caja el ${DIAS[d]} desde el límite ${op.eventualesCajaHoraLimite} (${cierre.join(', ')}).` })
      }
      const fuera = disp ? fila.flatMap((x, s) => x && !disp[d][s] ? [horaDeSlot(s)] : []) : []
      if (fuera.length) v.push({ codigo: 'OP_EVENTUAL_FUERA_DISPONIBILIDAD', nivel: 'OPERATIVA', colaboradorId: a.colaboradorId, dia: d, detalle: `${nombre(a.colaboradorId)}: en caja el ${DIAS[d]} fuera de su disponibilidad (${fuera.join(', ')}).` })
    }
  }

  for (let d = 0; d < 7; d++) {
    const auxEn = (s: number) => [...auxCaja].filter(([, m]) => enCaja(m, d, s)).map(([id]) => id)
    const evEn = (s: number) => evCaja.filter(a => enCaja(a.slotsCajaPorDia, d, s)).map(a => a.colaboradorId)

    // Apertura 08:00–09:00
    const problemas: string[] = []
    for (const s of [0, 1]) {
      const a = auxEn(s), ev = evEn(s), f = fp[d][s]
      const h = horaDeSlot(s)
      if (op.aperturaSoloAux) {
        if (a.length !== (op.politica_recursos_version && demanda(d,s)===0 ? 0 : 1)) problemas.push(`${h}: ${a.length} AUX en caja (debe ser exactamente 1)`)
        if (f > 0) problemas.push(`${h}: ${f} FULL/PART en caja (la apertura es solo AUX)`)
        if (ev.length) problemas.push(`${h}: ${ev.length} eventual(es) en caja`)
      } else {
        if (a.length) problemas.push(`${h}: ${a.length} AUX en caja (la apertura la abre un FULL/PART)`)
        if (ev.length) problemas.push(`${h}: ${ev.length} eventual(es) en caja`)
        if (demanda(d, s) > 0 && f < 1) problemas.push(`${h}: ningún cajero FULL/PART abre dentro de su contrato (no se sustituye por AUX ni eventual)`)
      }
    }
    if (problemas.length) v.push({
      codigo: 'OP_APERTURA_COMPOSICION', nivel: 'OPERATIVA', dia: d, franja: '08:00',
      detalle: `Apertura del ${DIAS[d]} (${op.aperturaSoloAux ? 'regla «apertura solo AUX» activa' : 'regla «apertura solo AUX» desactivada'}): ${problemas.join('; ')}.`,
    })

    // H-A2: ≥1 AUX parado supervisando 09:00–22:00. Obligatoria SIEMPRE, con
    // cualquier valor de «apertura solo AUX» y aunque la sucursal no tenga ningún
    // AUX (cero AUX = sin supervisión = violación), igual que el diagnóstico previo
    // y el motor (validarCobertura0922).
    {
      const sinParado: string[] = []
      for (let s = 2; s <= 27; s++) {
        const parados = [...presencia].filter(([id, p]) => p[d][s] && !enCaja(auxCaja.get(id), d, s)).length
        // Excepción AH2-037/042: franja autorizada por la sucursal con un único AUX presente (puede estar en caja).
        const presentes = [...presencia].filter(([, p]) => p[d][s]).length
        if (parados === 0 && !(presentes === 1 && excepcionAperturaAuxUnico(op, d, s))) sinParado.push(horaDeSlot(s))
      }
      if (sinParado.length) v.push({
        codigo: 'H-A2', nivel: 'OPERATIVA', dia: d,
        detalle: presencia.size
          ? `${DIAS[d]}: ningún supervisor (AUX) parado supervisando en ${rangos(sinParado)}.`
          : `${DIAS[d]}: no hay ningún supervisor (AUX) disponible; la supervisión de 09:00 a 22:00 es obligatoria.`,
      })
    }
    if (presencia.size) {
      // R3: con 2+ AUX simultáneos, uno queda parado toda su jornada (salvo apertura obligatoria)
      if (op.supervisorJornadaCompleta) {
        let max = 0
        for (let s = 0; s < SLOTS; s++) max = Math.max(max, [...presencia.values()].filter(p => p[d][s]).length)
        if (max >= 2) {
          const algunoSupervisa = [...presencia].some(([id, p]) => p[d].some(Boolean) && !(auxCaja.get(id)?.[d] ?? []).some((x, s) => x && s >= 2))
          if (!algunoSupervisa) v.push({ codigo: 'OP_SUPERVISOR_JORNADA', nivel: 'OPERATIVA', dia: d, detalle: `${DIAS[d]}: con «supervisor de jornada completa» activa, ningún AUX queda supervisando toda su jornada.` })
        }
      }
    }

    // Cobertura duplicada indebida: AUX/eventual en caja donde FULL/PART ya cubren la demanda
    if (e.necesidad) {
      const dup: string[] = []
      for (let s = 0; s < SLOTS; s++) {
        const obligatorioApertura = op.aperturaSoloAux && s < 2 ? 1 : 0
        const extra = auxEn(s).length - obligatorioApertura + evEn(s).length
        if (extra <= 0) continue
        const necesarios = Math.max(0, demanda(d, s) - fp[d][s] - obligatorioApertura)
        if (extra > necesarios) dup.push(horaDeSlot(s))
      }
      if (dup.length) v.push({ codigo: 'OP_COBERTURA_DUPLICADA', nivel: 'OPERATIVA', dia: d, detalle: `${DIAS[d]}: AUX/eventual en caja sin déficit real (${rangos(dup)}).` })
    }
  }
}

function rangos(horas: string[]): string {
  return horas.length > 4 ? `${horas[0]}…${horas[horas.length - 1]} (${horas.length} medias horas)` : horas.join(', ')
}

/** Relectura independiente del snapshot, sin llamar al compilador ni al optimizador. */
function validarSnapshotCondiciones(e:EntradaValidacion,v:Violacion[]){
 const snap=e.condicionesSupervisor;if(!snap)return
 for(const c of snap.aplicadas){if(c.modo!=='DEBE')continue
  const push=(dia:number|undefined,detalle:string)=>v.push({codigo:'OP_CONDICION_SUPERVISOR',nivel:'OPERATIVA',dia,colaboradorId:c.colaboradorId,detalle:`${c.id}: ${detalle}`})
  const h=e.horarios.find(h=>h.colaboradorId===c.colaboradorId)
  if(c.tipo==='exclusion_manual'){if(h)push(undefined,'persona gestionada manualmente incluida en cálculo automático');continue}
  if(c.tipo==='max_francos'){
   for(const d of c.dias){const n=e.horarios.filter(h=>['FULL','PART'].includes(e.roster.find(p=>p.id===h.colaboradorId)?.contrato??'')&&h.jornadas.find(j=>j.dia===d)?.esFranco).length;if(n>Number(c.valor))push(d,`francos ${n} superan ${c.valor}`)}
   continue
  }
  if(!h){push(undefined,'falta horario bajo condición obligatoria');continue}
  const dias=jornadasPorDia(h)
  for(const d of c.dias){const b=dias[d];if(!b){push(d,'falta jornada');continue}
   if(c.tipo==='franco'&&b.length)push(d,'trabaja con franco obligatorio')
   if(c.tipo==='turno'&&b.length){const w=c.ventana;if(!w||b[0].ini<480+w.min*30||b[0].ini>480+w.max*30||b[b.length-1].fin>480+w.fin*30)push(d,'turno fuera de ventana obligatoria')}
  }
 }
}
