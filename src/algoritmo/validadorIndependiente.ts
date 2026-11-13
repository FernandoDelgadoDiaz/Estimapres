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

// ======================= PERFIL =======================

export interface ReglasContrato {
  horasSemanaMax: number
  /** Si se define, las horas semanales deben ser exactamente este valor (D1). */
  horasSemanaExactas?: number
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
  contratos: { FULL: ReglasContrato; PART: ReglasContrato }
}

export const PERFIL_MOTOR_ACTUAL: PerfilNormativo = {
  id: 'motor-actual-2026-07',
  nombre: 'Reglas implementadas por el motor actual',
  estado: 'PROPUESTO',
  fuente: 'src/algoritmo/reglas.ts y catalogos.ts (H-F1..H-F7, H-P1..H-P5, H-D1). Sin validación jurídica (AH2-004, D1–D3).',
  descansoEntreJornadasHoras: 12,
  contratos: {
    FULL: {
      horasSemanaMax: 48, horasSemanaExactas: 48, francosSemana: 1, maxBloquesDia: 2, corteMinHoras: 4,
      composicionHorasDia: [9, 9, 9, 8, 8, 5], jornadasCortadasExactas: 2,
    },
    PART: { horasSemanaMax: 31, francosSemana: 1, maxBloquesDia: 1, corteMinHoras: 4, horasDiaMin: 4, horasDiaMax: 6 },
  },
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
  horarios: HorarioColaborador[]
  /** Contrato y nombre de cada persona (por id de UI). */
  roster: Array<{ id: string; nombre: string; contrato: Contrato }>
  perfil: PerfilNormativo
  /** Excepciones/reglas por colaborador vigentes (mismo formato que usa el motor; franco_dia con índice 0..6). */
  excepciones?: ExcepcionSemanal[]
  /** Tope de francos FULL+PART por día. */
  maxFrancosDia?: number
  /** Demanda POM (31 filas 07:00–22:00) para métricas y mínimos. */
  necesidad?: Franja[]
  /** Mínimo de personas en caja por franja (regla operativa). slotDesde/Hasta: slots de 30 min desde 08:00. */
  minimosCajeros?: Array<{ dia: number; slotDesde: number; slotHasta: number; cantidad: number }>
  cajaAux?: AsignacionCajaColaborador[]
  cajaEventual?: AsignacionCajaColaborador[]
  /** Horarios de la semana anterior (para 12 h domingo → lunes). */
  semanaAnterior?: HorarioColaborador[]
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

  for (const h of e.horarios) {
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
      validarContrato(v, h.colaboradorId, nombre, dias, e.perfil.contratos[persona.contrato], persona.contrato)
      validarDescanso(v, h.colaboradorId, nombre, dias, e.perfil.descansoEntreJornadasHoras, e.semanaAnterior)
      validarExcepciones(v, h.colaboradorId, nombre, dias, (e.excepciones ?? []).filter(x => x.colaboradorNombre === nombre))
    }
  }

  // Tope de francos simultáneos (FULL + PART)
  if (e.maxFrancosDia !== undefined) {
    for (let d = 0; d < 7; d++) {
      const n = e.horarios.filter(h => {
        const c = porId.get(h.colaboradorId)?.contrato
        return (c === 'FULL' || c === 'PART') && h.jornadas.some(j => j.dia === d && j.esFranco)
      }).length
      if (n > e.maxFrancosDia) {
        v.push({ codigo: 'OP_MAX_FRANCOS_DIA', nivel: 'OPERATIVA', dia: d, detalle: `${n} francos el ${DIAS[d]} (máximo ${e.maxFrancosDia}).` })
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

  const bloqueantes = v.length
  return { ok: bloqueantes === 0, publicable: bloqueantes === 0, violaciones: v, metricas }
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
) {
  // Fin del domingo anterior, si existe
  let finPrevio: number | null = null
  const prev = semanaAnterior?.find(h => h.colaboradorId === id)
  if (prev) {
    const dom = jornadasPorDia(prev)[6]
    if (dom && dom.length) finPrevio = dom[dom.length - 1].fin - 1440 // relativo al lunes 00:00
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
      if (!b) return
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
