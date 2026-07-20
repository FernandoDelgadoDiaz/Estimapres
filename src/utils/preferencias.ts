// src/utils/preferencias.ts
// Motor de dominio (funciones puras) para las tres capacidades configurables:
//   1. Reglas configurables → excepciones del algoritmo + demanda mínima + cap de francos
//   2. Rotación → sesgo blando por turno a partir del historial de semanas
//   3. Aprendizaje → sesgo blando derivado de las correcciones manuales
// Los sesgos son SIEMPRE blandos: el algoritmo los suma como puntos de utilidad
// pequeños que ceden ante la demanda real del PDF y las reglas duras.

import type {
  ReglaConfigurable,
  SemanaHistorial,
  CorreccionManual,
  AprendizajeDerivado,
  DireccionAprendizaje,
  ExcepcionSemanal,
  HorarioColaborador,
  JornadaResumida,
  ResumenTurnos,
  Colaborador,
  Turno,
} from '../types'
import { DIAS_SEMANA } from '../types'

// Sesgo por turno, keyed por NOMBRE de colaborador (la UI trabaja con nombres;
// el adapter los normaliza a ids del algoritmo v2).
// `porDia` es el aprendizaje/rotación fino: sesgos que sólo aplican a un día
// concreto de la semana (0=Lun..6=Dom). `franco` empuja hacia franco ese día.
export interface SesgoColaborador {
  manana?: number
  tarde?: number
  cierre?: number
  porDia?: Record<number, { manana?: number; tarde?: number; cierre?: number; franco?: number }>
}
export type SesgosPorNombre = Record<string, SesgoColaborador>

export interface MinimoFranja {
  dia: number // -1 = todos los días
  slotDesde: number
  slotHasta: number // exclusivo
  cantidad: number
}

// ==================== HELPERS DE HORA/TURNO (formato UI) ====================

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function horaASlotUI(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return (h - 8) * 2 + ((m || 0) >= 30 ? 1 : 0)
}

export type TurnoClasificado = 'manana' | 'tarde' | 'cierre' | 'franco'

// Misma semántica que el algoritmo v2 (sesgoDeJornada):
// cierre = termina 22:00+; mañana = corrida que entra 09:00-11:00; tarde = resto.
export function clasificarJornadaUI(j: JornadaResumida): TurnoClasificado {
  if (j.esFranco || j.turnos.length === 0) return 'franco'
  const fin = horaAMinutos(j.turnos[j.turnos.length - 1].fin)
  if (fin >= 22 * 60) return 'cierre'
  const inicio = horaAMinutos(j.turnos[0].inicio)
  if (j.turnos.length === 1 && inicio >= 9 * 60 && inicio <= 11 * 60) return 'manana'
  return 'tarde'
}

// ==================== CAPACIDAD 2: ROTACIÓN ====================

export function resumirTurnos(
  horarios: HorarioColaborador[],
  nombrePorId: Record<string, string>
): Record<string, ResumenTurnos> {
  const resumen: Record<string, ResumenTurnos> = {}
  for (const h of horarios) {
    const nombre = nombrePorId[h.colaboradorId]
    if (!nombre) continue
    const r: ResumenTurnos = { mananas: 0, tardes: 0, cierres: 0, francos: 0, francosDias: [], findeTrabajado: false }
    let trabajoSab = false
    let trabajoDom = false
    for (const j of h.jornadas) {
      const t = clasificarJornadaUI({ esFranco: j.esFranco, turnos: j.turnos })
      if (t === 'franco') { r.francos++; r.francosDias!.push(j.dia) }
      else if (t === 'manana') r.mananas++
      else if (t === 'cierre') r.cierres++
      else r.tardes++
      if (t !== 'franco' && j.dia === 5) trabajoSab = true
      if (t !== 'franco' && j.dia === 6) trabajoDom = true
    }
    r.findeTrabajado = trabajoSab && trabajoDom
    resumen[nombre] = r
  }
  return resumen
}

const SEMANAS_ROTACION = 3   // cuántas semanas recientes pesan en la rotación
const UMBRAL_ROTACION = 2    // desbalance mínimo (cierres vs mañanas) para actuar
const SESGO_ROTACION_MAX = 6
const UMBRAL_FINDE = 2       // fines de semana seguidos trabajados antes de empujar franco

/**
 * Rotación completa a partir del historial reciente:
 *  - Balance cierre ↔ mañana: quien acumuló muchos cierres se empuja a la mañana.
 *  - Fines de semana: quien trabajó los últimos findes seguidos recibe un empuje
 *    suave a franco de fin de semana (día 5/6) vía preferencia de esos días.
 *  - Preferencia por día concreto: se propaga a `porDia` para que la generación
 *    ubique francos/turnos rotando también días específicos, no solo el genérico.
 * Sólo usa la ÚLTIMA versión de cada lunes (versionado) para no contar doble.
 */
export function calcularSesgoRotacion(historial: SemanaHistorial[]): SesgosPorNombre {
  const recientes = ultimasVersiones(historial)
    .sort((a, b) => b.fechaLunes.localeCompare(a.fechaLunes))
    .slice(0, SEMANAS_ROTACION)

  const acumulado: Record<string, { mananas: number; cierres: number; findes: number }> = {}
  for (const semana of recientes) {
    for (const [nombre, r] of Object.entries(semana.resumenPorColaborador)) {
      const acc = (acumulado[nombre] ??= { mananas: 0, cierres: 0, findes: 0 })
      acc.mananas += r.mananas
      acc.cierres += r.cierres
      if (r.findeTrabajado) acc.findes++
    }
  }

  const sesgos: SesgosPorNombre = {}
  for (const [nombre, acc] of Object.entries(acumulado)) {
    const s: SesgosPorNombre[string] = {}
    const desbalance = acc.cierres - acc.mananas
    if (Math.abs(desbalance) >= UMBRAL_ROTACION) {
      const fuerza = Math.max(-SESGO_ROTACION_MAX, Math.min(SESGO_ROTACION_MAX, desbalance * 1.5))
      s.manana = fuerza      // muchos cierres → preferir mañana
      s.cierre = -fuerza     //                → evitar cierre
    }
    if (acc.findes >= UMBRAL_FINDE) {
      // trabajó varios findes seguidos → preferir franco fin de semana
      s.porDia = { 5: { franco: 4 }, 6: { franco: 4 } }
    }
    if (Object.keys(s).length > 0) sesgos[nombre] = s
  }
  return sesgos
}

/** Conserva sólo la versión más alta de cada (lunes) — clave del versionado. */
export function ultimasVersiones(historial: SemanaHistorial[]): SemanaHistorial[] {
  const porLunes = new Map<string, SemanaHistorial>()
  for (const s of historial) {
    const prev = porLunes.get(s.fechaLunes)
    if (!prev || s.version > prev.version) porLunes.set(s.fechaLunes, s)
  }
  return [...porLunes.values()]
}

// ==================== CAPACIDAD 3: APRENDIZAJE DE CORRECCIONES ====================

function direccionDeCorreccion(c: CorreccionManual): DireccionAprendizaje | null {
  const antes = clasificarJornadaUI(c.antes)
  const despues = clasificarJornadaUI(c.despues)
  if (antes === 'franco' || despues === 'franco' || antes === despues) return null
  if (despues === 'manana') return 'prefiere_manana'
  if (despues === 'cierre') return 'prefiere_cierre'
  if (antes === 'cierre') return 'evita_cierre'
  return 'prefiere_tarde'
}

// Redacción de PATRÓN (hecho observado), no de preferencia personal: una
// corrección puede deberse a necesidades de cobertura, no a gustos.
const DESCRIPCION_DIRECCION: Record<DireccionAprendizaje, string> = {
  prefiere_manana: 'fue movido/a a turnos de mañana',
  prefiere_tarde: 'fue movido/a a turnos de tarde',
  prefiere_cierre: 'fue movido/a a turnos de cierre',
  evita_cierre: 'fue sacado/a de turnos de cierre',
  hora_preferida: 'fue movido/a a entrar a la misma hora',
}

// Un patrón exige repetición REAL: 3+ correcciones en la misma dirección y en
// SEMANAS DISTINTAS. Correcciones múltiples de la misma semana suelen ser
// ajustes de cobertura puntuales, no un patrón del colaborador.
const EVIDENCIAS_MINIMAS = 3
const SEMANAS_DISTINTAS_MINIMAS = 3

/** Clave de semana para agrupar evidencias: semanaId, o la fecha si falta. */
function claveSemana(c: CorreccionManual): string {
  return c.semanaId || c.fecha.slice(0, 10)
}

/**
 * Deriva PATRONES de las correcciones manuales en tres granularidades:
 *  - GLOBAL: el colaborador fue movido repetidamente hacia/desde un tipo de turno.
 *  - FINO por día: el mismo patrón repetido en un día concreto de la semana.
 *  - HORA: fue movido repetidamente a entrar a la misma hora un día dado.
 * Solo se reporta un patrón con 3+ correcciones en 3+ semanas distintas.
 */
export function derivarAprendizajes(correcciones: CorreccionManual[]): AprendizajeDerivado[] {
  interface Bucket { nombre: string; direccion: DireccionAprendizaje; dia?: number; hora?: string; ids: string[]; semanas: Set<string> }
  const globales = new Map<string, Bucket>()
  const porDia = new Map<string, Bucket>()
  const horas = new Map<string, Bucket>()

  for (const c of correcciones) {
    const semana = claveSemana(c)
    const dir = direccionDeCorreccion(c)
    if (dir) {
      const cg = `${c.colaboradorNombre}::${dir}`
      const g = globales.get(cg) ?? { nombre: c.colaboradorNombre, direccion: dir, ids: [], semanas: new Set<string>() }
      g.ids.push(c.id)
      g.semanas.add(semana)
      globales.set(cg, g)

      const cd = `${c.colaboradorNombre}::${dir}::${c.dia}`
      const d = porDia.get(cd) ?? { nombre: c.colaboradorNombre, direccion: dir, dia: c.dia, ids: [], semanas: new Set<string>() }
      d.ids.push(c.id)
      d.semanas.add(semana)
      porDia.set(cd, d)
    }
    // Hora repetida: entrada del turno corregido (si no es franco)
    if (!c.despues.esFranco && c.despues.turnos.length > 0) {
      const hora = c.despues.turnos[0].inicio
      const ch = `${c.colaboradorNombre}::${c.dia}::${hora}`
      const h = horas.get(ch) ?? { nombre: c.colaboradorNombre, direccion: 'hora_preferida' as const, dia: c.dia, hora, ids: [], semanas: new Set<string>() }
      h.ids.push(c.id)
      h.semanas.add(semana)
      horas.set(ch, h)
    }
  }

  const esPatron = (b: Bucket) =>
    b.ids.length >= EVIDENCIAS_MINIMAS && b.semanas.size >= SEMANAS_DISTINTAS_MINIMAS

  const aprendizajes: AprendizajeDerivado[] = []

  for (const g of globales.values()) {
    if (!esPatron(g)) continue
    aprendizajes.push({
      colaboradorNombre: g.nombre,
      direccion: g.direccion,
      evidencias: g.ids.length,
      correccionIds: g.ids,
      descripcion: `Patrón detectado: ${g.nombre} ${DESCRIPCION_DIRECCION[g.direccion]} en ${g.semanas.size} semanas distintas (${g.ids.length} correcciones)`,
    })
  }

  for (const d of porDia.values()) {
    if (!esPatron(d)) continue
    aprendizajes.push({
      colaboradorNombre: d.nombre,
      direccion: d.direccion,
      dia: d.dia,
      evidencias: d.ids.length,
      correccionIds: d.ids,
      descripcion: `Patrón detectado: ${d.nombre}, los ${DIAS_SEMANA[d.dia!]}, ${DESCRIPCION_DIRECCION[d.direccion]} en ${d.semanas.size} semanas distintas (${d.ids.length} correcciones)`,
    })
  }

  for (const h of horas.values()) {
    if (!esPatron(h)) continue
    aprendizajes.push({
      colaboradorNombre: h.nombre,
      direccion: 'hora_preferida',
      dia: h.dia,
      valor: h.hora,
      evidencias: h.ids.length,
      correccionIds: h.ids,
      descripcion: `Patrón detectado: ${h.nombre}, los ${DIAS_SEMANA[h.dia!]}, fue movido/a a entrar ${h.hora} en ${h.semanas.size} semanas distintas (${h.ids.length} correcciones)`,
    })
  }

  return aprendizajes.sort((a, b) => b.evidencias - a.evidencias)
}

// ==================== CRITERIOS DE COBERTURA (aprendizaje de planificación) ====================
// A diferencia de los patrones por persona, esto aprende QUÉ FRANJAS HORARIAS
// prioriza el supervisor cuando corrige un horario: si sus ediciones suman
// cobertura en una banda (aunque resignen otra) en semanas distintas, es un
// criterio de planificación. Detectado en 1 semana = "en observación";
// en 2+ semanas = "activo" → la próxima generación (la tercera semana) ya
// pondera esas franjas en el score de cobertura (pesos_franja).

export type BandaHoraria = 'apertura' | 'mediodia' | 'tarde' | 'cierre'

export const BANDAS_HORARIAS: Record<BandaHoraria, { desde: number; hasta: number; etiqueta: string }> = {
  apertura: { desde: 0, hasta: 6, etiqueta: 'apertura (08:00-11:00)' },
  mediodia: { desde: 6, hasta: 12, etiqueta: 'mediodía (11:00-14:00)' },
  tarde: { desde: 12, hasta: 22, etiqueta: 'tarde (14:00-19:00)' },
  cierre: { desde: 22, hasta: 30, etiqueta: 'cierre (19:00-23:00)' },
}

export interface CriterioCobertura {
  banda: BandaHoraria
  /** Banda que el supervisor resigna con más frecuencia al priorizar `banda` */
  bandaResignada?: BandaHoraria
  semanas: number
  evidencias: number
  estado: 'activo' | 'observacion'
  /**
   * Score acumulativo con decay temporal: cada semana con señal aporta
   * 0.5^(edadSemanas/8) — reciente ≈ 1.0, hace 4 semanas ≈ 0.7, hace 8 ≈ 0.5.
   * El sistema aprende de TODA la historia: las semanas viejas pesan menos
   * pero nunca se olvidan de golpe.
   */
  score: number
  /** estable = con señal en las últimas 4 semanas; declive = sin señal reciente (el peso baja gradualmente) */
  tendencia: 'estable' | 'declive'
  /** Fecha (YYYY-MM-DD) de la primera y última semana con señal */
  primeraSenal: string
  ultimaSenal: string
  descripcion: string
}

/** Slots (0..29) cubiertos por una jornada en formato UI. */
function slotsDeJornada(j: JornadaResumida): Set<number> {
  const slots = new Set<number>()
  if (j.esFranco) return slots
  for (const t of j.turnos) {
    const desde = Math.max(0, horaASlotUI(t.inicio))
    const hasta = Math.min(30, horaASlotUI(t.fin))
    for (let s = desde; s < hasta; s++) slots.add(s)
  }
  return slots
}

/** Delta de slots por banda que produjo una corrección (después − antes). */
export function deltaPorBanda(c: CorreccionManual): Record<BandaHoraria, number> {
  const antes = slotsDeJornada(c.antes)
  const despues = slotsDeJornada(c.despues)
  const delta: Record<BandaHoraria, number> = { apertura: 0, mediodia: 0, tarde: 0, cierre: 0 }
  for (const [banda, b] of Object.entries(BANDAS_HORARIAS) as Array<[BandaHoraria, { desde: number; hasta: number }]>) {
    for (let s = b.desde; s < b.hasta; s++) {
      if (despues.has(s) && !antes.has(s)) delta[banda]++
      if (antes.has(s) && !despues.has(s)) delta[banda]--
    }
  }
  return delta
}

function claveSemanaDeCorreccion(c: CorreccionManual): string {
  return c.semanaId || c.fecha.slice(0, 10)
}

// Score mínimo para que un criterio se active. Dos semanas recientes con
// señal (~1.0 + ~0.9) lo superan; una sola nunca (≤ 1.0).
const SCORE_ACTIVACION = 1.5
// Ventana de "señal reciente" para la tendencia estable/declive (en semanas).
const VENTANA_TENDENCIA_SEMANAS = 4
const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000

/** Peso temporal de una señal: reciente = 1.0, 4 semanas = ~0.7, 8 = 0.5, 16 = 0.25. */
export function pesoTemporal(edadSemanas: number): number {
  return Math.pow(0.5, Math.max(0, edadSemanas) / 8)
}

export interface OpcionesCriterios {
  /** Historial: permite fechar cada semana de corrección por su lunes real */
  semanas?: SemanaHistorial[]
  /** Inyectable para tests; default: hoy */
  ahora?: Date
}

/**
 * Deriva los criterios de cobertura del supervisor a partir de TODAS sus
 * correcciones históricas (aprendizaje acumulativo). Una banda es "señal" de
 * una semana si las correcciones de esa semana le sumaron cobertura neta.
 * Cada señal aporta un peso con decay temporal (semana reciente ≈ 1.0, hace
 * 8 semanas 0.5): las semanas viejas pesan menos pero nunca se descartan, y
 * un criterio que deja de confirmarse pierde peso GRADUALMENTE (declive), no
 * de golpe. Activo cuando el score acumulado supera el umbral.
 */
export function derivarCriteriosCobertura(
  correcciones: CorreccionManual[],
  opciones?: OpcionesCriterios
): CriterioCobertura[] {
  const ahora = opciones?.ahora ?? new Date()
  const fechaPorSemanaId = new Map<string, string>()
  for (const s of opciones?.semanas ?? []) fechaPorSemanaId.set(s.id, s.fechaLunes)

  // Fecha representativa (YYYY-MM-DD) de la clave de semana de una corrección
  const fechaDeClave = (clave: string, c: CorreccionManual): string =>
    fechaPorSemanaId.get(clave) ?? c.fecha.slice(0, 10)

  // Acumular deltas por semana
  const porSemana = new Map<string, { fecha: string; delta: Record<BandaHoraria, number>; correcciones: number }>()
  for (const c of correcciones) {
    const clave = claveSemanaDeCorreccion(c)
    const acc = porSemana.get(clave) ?? {
      fecha: fechaDeClave(clave, c),
      delta: { apertura: 0, mediodia: 0, tarde: 0, cierre: 0 },
      correcciones: 0,
    }
    const d = deltaPorBanda(c)
    let toca = false
    for (const banda of Object.keys(d) as BandaHoraria[]) {
      acc.delta[banda] += d[banda]
      if (d[banda] !== 0) toca = true
    }
    if (toca) acc.correcciones++
    porSemana.set(clave, acc)
  }

  const edadSemanasDe = (fecha: string): number =>
    (ahora.getTime() - new Date(`${fecha}T00:00:00`).getTime()) / MS_POR_SEMANA

  // Señales por banda a través de las semanas, con peso temporal
  const bandas = Object.keys(BANDAS_HORARIAS) as BandaHoraria[]
  const señales = new Map<BandaHoraria, {
    semanas: number; evidencias: number; score: number
    resignadas: BandaHoraria[]; fechas: string[]
  }>()
  for (const { fecha, delta, correcciones: n } of porSemana.values()) {
    const peso = pesoTemporal(edadSemanasDe(fecha))
    for (const banda of bandas) {
      if (delta[banda] <= 0) continue
      const s = señales.get(banda) ?? { semanas: 0, evidencias: 0, score: 0, resignadas: [], fechas: [] }
      s.semanas++
      s.evidencias += n
      s.score += peso
      s.fechas.push(fecha)
      // ¿Qué banda resignó esa semana? La de delta más negativo (si hay)
      let peor: BandaHoraria | null = null
      for (const otra of bandas) {
        if (delta[otra] < (peor ? delta[peor] : 0)) peor = otra
      }
      if (peor) s.resignadas.push(peor)
      señales.set(banda, s)
    }
  }

  const criterios: CriterioCobertura[] = []
  for (const [banda, s] of señales) {
    // Resignada más frecuente (si alguna)
    let resignada: BandaHoraria | undefined
    let maxCount = 0
    for (const r of new Set(s.resignadas)) {
      const count = s.resignadas.filter(x => x === r).length
      if (count > maxCount) { maxCount = count; resignada = r }
    }
    const fechasOrdenadas = [...s.fechas].sort()
    const primeraSenal = fechasOrdenadas[0]
    const ultimaSenal = fechasOrdenadas[fechasOrdenadas.length - 1]
    const estado: CriterioCobertura['estado'] = s.score >= SCORE_ACTIVACION ? 'activo' : 'observacion'
    const tendencia: CriterioCobertura['tendencia'] =
      edadSemanasDe(ultimaSenal) <= VENTANA_TENDENCIA_SEMANAS ? 'estable' : 'declive'
    const etiqueta = BANDAS_HORARIAS[banda].etiqueta
    const sufijo = resignada ? `, aun resignando ${BANDAS_HORARIAS[resignada].etiqueta}` : ''
    criterios.push({
      banda,
      bandaResignada: resignada,
      semanas: s.semanas,
      evidencias: s.evidencias,
      score: s.score,
      tendencia,
      primeraSenal,
      ultimaSenal,
      estado,
      descripcion: estado === 'activo'
        ? `Priorizás la cobertura de ${etiqueta}${sufijo} — visto en ${s.semanas} semana${s.semanas === 1 ? '' : 's'}${tendencia === 'declive' ? ' (sin confirmarse últimamente: su peso baja gradualmente)' : ''}. El algoritmo ya lo incorpora.`
        : `Posible criterio: priorizar ${etiqueta}${sufijo} — señal débil todavía. Se incorpora si se repite.`,
    })
  }

  return criterios.sort((a, b) => b.score - a.score || b.evidencias - a.evidencias)
}

// Boost proporcional al score (con tope): 2 semanas recientes ≈ ×1.29,
// criterio consolidado de meses ≈ ×1.5. En declive baja solo, porque el
// score decae con el tiempo.
const BOOST_MAX = 0.5
const BOOST_POR_SCORE = 0.15

/**
 * Pesos por slot (30 valores) para el score de cobertura del algoritmo,
 * derivados de los criterios ACTIVOS (boost proporcional a su score con
 * decay temporal). undefined si no hay ninguno activo (comportamiento
 * neutro, idéntico al de siempre).
 */
export function pesosFranjaDeCriterios(criterios: CriterioCobertura[]): number[] | undefined {
  const activos = criterios.filter(c => c.estado === 'activo')
  if (activos.length === 0) return undefined
  const pesos = new Array<number>(30).fill(1)
  for (const c of activos) {
    const boost = 1 + Math.min(BOOST_MAX, BOOST_POR_SCORE * c.score)
    const b = BANDAS_HORARIAS[c.banda]
    for (let s = b.desde; s < b.hasta; s++) pesos[s] = Math.max(pesos[s], boost)
  }
  return pesos
}

export function calcularSesgoAprendizaje(aprendizajes: AprendizajeDerivado[]): SesgosPorNombre {
  const sesgos: SesgosPorNombre = {}
  for (const a of aprendizajes) {
    const fuerza = Math.min(a.evidencias, 4) * 2.5 // 5..10
    const s = (sesgos[a.colaboradorNombre] ??= {})

    if (a.dia !== undefined) {
      // Aprendizaje fino: aplica sólo a ese día de la semana
      s.porDia ??= {}
      const d = (s.porDia[a.dia] ??= {})
      aplicarDireccion(d, a.direccion, fuerza)
    } else {
      aplicarDireccion(s, a.direccion, fuerza)
    }
  }
  return sesgos
}

function aplicarDireccion(
  destino: { manana?: number; tarde?: number; cierre?: number },
  direccion: DireccionAprendizaje,
  fuerza: number
): void {
  switch (direccion) {
    case 'prefiere_manana':
      destino.manana = (destino.manana ?? 0) + fuerza
      destino.cierre = (destino.cierre ?? 0) - fuerza / 2
      break
    case 'prefiere_cierre':
      destino.cierre = (destino.cierre ?? 0) + fuerza
      destino.manana = (destino.manana ?? 0) - fuerza / 2
      break
    case 'evita_cierre':
      destino.cierre = (destino.cierre ?? 0) - fuerza
      break
    case 'prefiere_tarde':
      destino.tarde = (destino.tarde ?? 0) + fuerza
      break
    case 'hora_preferida':
      // La hora preferida es una señal suave hacia la mañana si es temprana;
      // el sesgo por turno la aproxima sin forzar el slot exacto.
      break
  }
}

export function combinarSesgos(...fuentes: SesgosPorNombre[]): SesgosPorNombre {
  const total: SesgosPorNombre = {}
  for (const fuente of fuentes) {
    for (const [nombre, s] of Object.entries(fuente)) {
      const acc = (total[nombre] ??= {})
      if (s.manana) acc.manana = (acc.manana ?? 0) + s.manana
      if (s.tarde) acc.tarde = (acc.tarde ?? 0) + s.tarde
      if (s.cierre) acc.cierre = (acc.cierre ?? 0) + s.cierre
      if (s.porDia) {
        acc.porDia ??= {}
        for (const [diaStr, sd] of Object.entries(s.porDia)) {
          const dia = Number(diaStr)
          const accd = (acc.porDia[dia] ??= {})
          if (sd.manana) accd.manana = (accd.manana ?? 0) + sd.manana
          if (sd.tarde) accd.tarde = (accd.tarde ?? 0) + sd.tarde
          if (sd.cierre) accd.cierre = (accd.cierre ?? 0) + sd.cierre
          if (sd.franco) accd.franco = (accd.franco ?? 0) + sd.franco
        }
      }
    }
  }
  return total
}

/** Explicaciones legibles para mostrar al supervisor antes de generar. */
export function explicarSesgos(sesgos: SesgosPorNombre): string[] {
  const frases: string[] = []
  for (const [nombre, s] of Object.entries(sesgos)) {
    const partes: string[] = []
    if ((s.manana ?? 0) >= 3) partes.push('se preferirá mañana')
    if ((s.manana ?? 0) <= -3) partes.push('se evitará mañana')
    if ((s.cierre ?? 0) >= 3) partes.push('se preferirá cierre')
    if ((s.cierre ?? 0) <= -3) partes.push('se evitará cierre')
    if ((s.tarde ?? 0) >= 3) partes.push('se preferirá tarde')
    for (const [diaStr, sd] of Object.entries(s.porDia ?? {})) {
      const dia = DIAS_SEMANA[Number(diaStr)]
      if ((sd.franco ?? 0) >= 3) partes.push(`franco tendencia ${dia}`)
      if ((sd.manana ?? 0) >= 3) partes.push(`mañana los ${dia}`)
      if ((sd.cierre ?? 0) >= 3) partes.push(`cierre los ${dia}`)
      if ((sd.tarde ?? 0) >= 3) partes.push(`tarde los ${dia}`)
    }
    if (partes.length > 0) frases.push(`${nombre}: ${partes.join(', ')}`)
  }
  return frases
}

// ==================== CAPACIDAD 1: REGLAS CONFIGURABLES ====================

export function reglaVigenteEnSemana(regla: ReglaConfigurable, fechaLunes: string): boolean {
  if (!regla.activa) return false
  if (!regla.vigenciaDesde && !regla.vigenciaHasta) return true
  const lunes = fechaLunes
  const domingo = sumarDias(fechaLunes, 6)
  if (regla.vigenciaDesde && regla.vigenciaDesde > domingo) return false
  if (regla.vigenciaHasta && regla.vigenciaHasta < lunes) return false
  return true
}

function sumarDias(fechaISO: string, dias: number): string {
  const f = new Date(`${fechaISO}T00:00:00`)
  f.setDate(f.getDate() + dias)
  return f.toISOString().split('T')[0]
}

/** Traduce las reglas por colaborador vigentes al formato ExcepcionSemanal del algoritmo. */
export function reglasAExcepciones(
  reglas: ReglaConfigurable[],
  fechaLunes: string
): ExcepcionSemanal[] {
  const excepciones: ExcepcionSemanal[] = []
  for (const r of reglas) {
    if (r.ambito !== 'colaborador' || !r.colaboradorNombre) continue
    if (!reglaVigenteEnSemana(r, fechaLunes)) continue
    const base = { id: `regla_${r.id}`, colaboradorNombre: r.colaboradorNombre, descripcion: r.descripcion }
    switch (r.tipo) {
      case 'franco_fijo':
        if (r.dia !== undefined && r.dia >= 0) {
          excepciones.push({ ...base, tipo: 'franco_dia', valor: String(r.dia) })
        }
        break
      case 'no_antes_de':
        if (r.hora) excepciones.push({ ...base, tipo: 'no_antes_de', valor: r.hora })
        break
      case 'no_despues_de':
        if (r.hora) excepciones.push({ ...base, tipo: 'no_despues_de', valor: r.hora })
        break
      case 'siempre_cierre':
        excepciones.push({ ...base, tipo: 'siempre_cierre' })
        break
      case 'siempre_manana':
        excepciones.push({ ...base, tipo: 'solo_matutino' })
        break
    }
  }
  return excepciones
}

/**
 * Las excepciones creadas desde la UI usan el día como texto ('Lun'..'Dom'),
 * pero el algoritmo espera el índice numérico como string ('0'..'6').
 */
export function normalizarExcepciones(excepciones: ExcepcionSemanal[]): ExcepcionSemanal[] {
  return excepciones.map(e => {
    if (e.tipo !== 'franco_dia' || !e.valor || /^\d+$/.test(e.valor)) return e
    const idx = DIAS_SEMANA.indexOf(e.valor as (typeof DIAS_SEMANA)[number])
    return idx >= 0 ? { ...e, valor: String(idx) } : e
  })
}

/** Mínimos de cajeros por franja, en slots del algoritmo v2. */
export function demandaMinimaDeReglas(
  reglas: ReglaConfigurable[],
  fechaLunes: string
): MinimoFranja[] {
  const minimos: MinimoFranja[] = []
  for (const r of reglas) {
    if (r.tipo !== 'min_cajeros_franja' || !reglaVigenteEnSemana(r, fechaLunes)) continue
    if (!r.horaDesde || !r.horaHasta || !r.cantidad) continue
    const slotDesde = Math.max(0, horaASlotUI(r.horaDesde))
    const slotHasta = Math.min(30, horaASlotUI(r.horaHasta))
    if (slotHasta <= slotDesde) continue
    minimos.push({ dia: r.dia ?? -1, slotDesde, slotHasta, cantidad: r.cantidad })
  }
  return minimos
}

/**
 * Tope de francos por día según reglas del local (default 2 en el algoritmo si
 * no hay regla). Es una regla operativa, no laboral: el supervisor puede
 * subirla o bajarla según su dotación. Si hay varias, gana la más restrictiva.
 */
export function capFrancosDeReglas(
  reglas: ReglaConfigurable[],
  fechaLunes: string
): number | undefined {
  let cap: number | undefined
  for (const r of reglas) {
    if (r.tipo !== 'max_francos_dia' || !reglaVigenteEnSemana(r, fechaLunes)) continue
    if (r.cantidad === undefined) continue
    const valor = Math.max(1, r.cantidad)
    cap = cap === undefined ? valor : Math.min(cap, valor)
  }
  return cap
}

// ==================== REGLAS OPERATIVAS (toggles) ====================
// Son reglas del negocio de la sucursal, NO leyes laborales. Cada una es un
// booleano con un default; el supervisor las activa/desactiva desde Reglas.
// El default se aplica cuando NO existe una regla de ese tipo.

export type TipoReglaOperativa =
  | 'apertura_solo_aux'
  | 'sin_aux_cierre'
  | 'supervisor_jornada_completa'
  | 'franco_medio_corridos'

export const DEFAULTS_OPERATIVOS: Record<TipoReglaOperativa, boolean> = {
  apertura_solo_aux: true,
  sin_aux_cierre: true,
  supervisor_jornada_completa: false,
  franco_medio_corridos: true,
}

export const ETIQUETAS_OPERATIVAS: Record<TipoReglaOperativa, { titulo: string; descripcion: string }> = {
  apertura_solo_aux: {
    titulo: 'Apertura con supervisor',
    descripcion: 'De 08:00 a 09:00 no se asignan cajeros: la apertura la cubre sólo el supervisor (AUX).',
  },
  sin_aux_cierre: {
    titulo: 'Sin supervisor en caja después de las 22:00',
    descripcion: 'Los supervisores no se sientan en caja en la última media hora (22:00-22:30).',
  },
  supervisor_jornada_completa: {
    titulo: 'Supervisor de jornada completa',
    descripcion: 'Si hay 2 o más supervisores presentes a la vez, el de mayor presencia queda parado toda la jornada, sin sentarse en caja.',
  },
  franco_medio_corridos: {
    titulo: 'Franco y medio franco corridos',
    descripcion: 'El día de medio franco (5h) de cada FULL cae pegado a su franco completo, formando 36h de descanso corridas.',
  },
}

export interface ConfigOperativa {
  aperturaSoloAux: boolean
  sinAuxCierre: boolean
  supervisorJornadaCompleta: boolean
  francoMedioCorridos: boolean
}

/** Estado efectivo de un toggle operativo: la regla si existe (y está vigente), o su default. */
export function valorReglaOperativa(
  reglas: ReglaConfigurable[],
  tipo: TipoReglaOperativa,
  fechaLunes: string
): boolean {
  const regla = reglas.find(r => r.ambito === 'local' && r.tipo === tipo)
  if (!regla) return DEFAULTS_OPERATIVOS[tipo]
  // Vigencia temporal opcional: fuera de vigencia, vuelve al default.
  if ((regla.vigenciaDesde || regla.vigenciaHasta) && !reglaVigenteEnSemana({ ...regla, activa: true }, fechaLunes)) {
    return DEFAULTS_OPERATIVOS[tipo]
  }
  return regla.activa
}

/** Configuración operativa efectiva para pasar al algoritmo. */
export function configOperativaDeReglas(reglas: ReglaConfigurable[], fechaLunes: string): ConfigOperativa {
  return {
    aperturaSoloAux: valorReglaOperativa(reglas, 'apertura_solo_aux', fechaLunes),
    sinAuxCierre: valorReglaOperativa(reglas, 'sin_aux_cierre', fechaLunes),
    supervisorJornadaCompleta: valorReglaOperativa(reglas, 'supervisor_jornada_completa', fechaLunes),
    francoMedioCorridos: valorReglaOperativa(reglas, 'franco_medio_corridos', fechaLunes),
  }
}

/**
 * Detecta conflictos entre reglas configurables y las reglas laborales duras.
 * El sistema informa pero nunca permite violar las duras: cuando hay conflicto,
 * la regla se aplica recortada (o se ignora) y acá se explica por qué.
 */
export function validarConflictosReglas(
  reglas: ReglaConfigurable[],
  colaboradores: Colaborador[]
): string[] {
  const avisos: string[] = []
  const activas = reglas.filter(r => r.activa)
  const cajeros = colaboradores.filter(c => c.activo && (c.tipo === 'FULL' || c.tipo === 'PART'))
  const tipoDe = (nombre?: string) => colaboradores.find(c => c.nombre === nombre)?.tipo

  for (const r of activas) {
    if (r.tipo === 'max_francos_dia' && r.cantidad !== undefined) {
      const cap = Math.max(1, r.cantidad)
      if (cap * 7 < cajeros.length) {
        avisos.push(
          `"${r.descripcion}": con ${cajeros.length} cajeros que necesitan franco semanal, un tope de ${cap} por día no alcanza (máximo ${cap * 7} francos/semana). Algunos quedarán sin asignar.`
        )
      }
    }
    if (r.tipo === 'no_antes_de' && r.hora && r.hora >= '10:00' && tipoDe(r.colaboradorNombre) === 'FULL') {
      avisos.push(
        `"${r.descripcion}": los FULL necesitan jornadas cortadas que cubren la apertura (entrada hasta 09:30). Con esta regla ${r.colaboradorNombre} quedará sin horario asignable.`
      )
    }
    if (r.tipo === 'min_cajeros_franja' && r.cantidad !== undefined && r.cantidad > cajeros.length) {
      avisos.push(
        `"${r.descripcion}": pide ${r.cantidad} cajeros pero solo hay ${cajeros.length} FULL/PART activos. Se cubrirá lo posible con auxiliares y eventuales.`
      )
    }
  }

  // siempre_manana + siempre_cierre sobre la misma persona son incompatibles
  const porColaborador = new Map<string, Set<string>>()
  for (const r of activas) {
    if (r.ambito !== 'colaborador' || !r.colaboradorNombre) continue
    const set = porColaborador.get(r.colaboradorNombre) ?? new Set()
    set.add(r.tipo)
    porColaborador.set(r.colaboradorNombre, set)
  }
  for (const [nombre, tipos] of porColaborador) {
    if (tipos.has('siempre_manana') && tipos.has('siempre_cierre')) {
      avisos.push(
        `${nombre} tiene "siempre mañana" y "siempre cierre" a la vez: son incompatibles y quedará sin horario asignable. Desactivá una de las dos.`
      )
    }
  }

  // franco_fijo: más colaboradores con franco fijo el mismo día que el tope permitido
  const francosFijosPorDia = new Map<number, string[]>()
  for (const r of activas) {
    if (r.tipo === 'franco_fijo' && r.dia !== undefined && r.dia >= 0 && r.colaboradorNombre) {
      const lista = francosFijosPorDia.get(r.dia) ?? []
      lista.push(r.colaboradorNombre)
      francosFijosPorDia.set(r.dia, lista)
    }
  }
  for (const [dia, nombres] of francosFijosPorDia) {
    if (nombres.length > 2) {
      avisos.push(
        `Hay ${nombres.length} colaboradores con franco fijo el ${DIAS_SEMANA[dia]} (${nombres.join(', ')}), pero la regla dura permite máximo 2 francos por día.`
      )
    }
  }

  return avisos
}

// ==================== CONSTRUCCIÓN DE TURNOS (edición manual) ====================

export function turnosDesdeHoras(inicio: string, fin: string): Turno[] {
  return [{ inicio, fin }]
}

// ==================== VALIDACIÓN DE EDICIONES MANUALES (reglas duras) ====================

export type Severidad = 'error' | 'aviso'
export interface AvisoValidacion {
  severidad: Severidad
  mensaje: string
}

function horasDeJornadaUI(j: JornadaResumida): number {
  if (j.esFranco) return 0
  return j.turnos.reduce((sum, t) => sum + (horaAMinutos(t.fin) - horaAMinutos(t.inicio)) / 60, 0)
}

/**
 * Valida en tiempo real una edición manual del horario contra las reglas
 * laborales duras. NO bloquea (el supervisor manda), pero informa qué reglas
 * duras rompería el cambio para que decida con contexto.
 *
 * @param jornadaEditada  la jornada nueva que el supervisor está por guardar
 * @param jornadasSemana  las 7 jornadas actuales del colaborador (para totales y descansos)
 * @param dia             día editado (0..6)
 * @param tipo            'FULL' | 'PART' — define límites de horas
 */
export function validarEdicionManual(
  jornadaEditada: JornadaResumida,
  jornadasSemana: JornadaResumida[],
  dia: number,
  tipo: 'FULL' | 'PART' | string
): AvisoValidacion[] {
  const avisos: AvisoValidacion[] = []

  // Simular la semana con la jornada editada aplicada
  const semana = jornadasSemana.map((j, i) => (i === dia ? jornadaEditada : j))

  // --- Franja de operación 08:00–22:30 ---
  if (!jornadaEditada.esFranco) {
    for (const t of jornadaEditada.turnos) {
      if (horaAMinutos(t.inicio) < 8 * 60 || horaAMinutos(t.fin) > 22.5 * 60) {
        avisos.push({ severidad: 'error', mensaje: `El turno ${t.inicio}-${t.fin} se sale del horario de operación (08:00–22:30).` })
      }
      if (horaAMinutos(t.fin) <= horaAMinutos(t.inicio)) {
        avisos.push({ severidad: 'error', mensaje: `El turno ${t.inicio}-${t.fin} termina antes de empezar.` })
      }
    }
    // Cortado: descanso mínimo 4h entre bloques (H-F7)
    if (jornadaEditada.turnos.length === 2) {
      const gap = horaAMinutos(jornadaEditada.turnos[1].inicio) - horaAMinutos(jornadaEditada.turnos[0].fin)
      if (gap < 4 * 60) {
        avisos.push({ severidad: 'error', mensaje: `Jornada cortada: el descanso entre bloques es de ${(gap / 60).toFixed(1)}h, mínimo 4h (H-F7).` })
      }
    }
    if (jornadaEditada.turnos.length > 2) {
      avisos.push({ severidad: 'error', mensaje: 'Una jornada no puede tener más de 2 bloques (corrida o cortada).' })
    }
  }

  // --- Descanso 12h entre este día y los adyacentes (H-D1) ---
  const chequeoDescanso = (previa: JornadaResumida | undefined, siguiente: JornadaResumida | undefined) => {
    if (!previa || previa.esFranco || jornadaEditada.esFranco) return
    if (siguiente) return
    const finPrev = horaAMinutos(previa.turnos[previa.turnos.length - 1].fin)
    const inicioHoy = horaAMinutos(jornadaEditada.turnos[0].inicio)
    // descanso = resto del día previo + noche (hasta 08:00) + inicio de hoy
    const descanso = (24 * 60 - finPrev) + inicioHoy
    if (descanso < 12 * 60) {
      avisos.push({ severidad: 'error', mensaje: `Descanso menor a 12h respecto al día anterior (${(descanso / 60).toFixed(1)}h, H-D1).` })
    }
  }
  chequeoDescanso(semana[dia - 1], undefined)
  // día siguiente
  if (!jornadaEditada.esFranco && dia < 6 && semana[dia + 1] && !semana[dia + 1].esFranco) {
    const finHoy = horaAMinutos(jornadaEditada.turnos[jornadaEditada.turnos.length - 1].fin)
    const inicioSig = horaAMinutos(semana[dia + 1].turnos[0].inicio)
    const descanso = (24 * 60 - finHoy) + inicioSig
    if (descanso < 12 * 60) {
      avisos.push({ severidad: 'error', mensaje: `Descanso menor a 12h respecto al día siguiente (${(descanso / 60).toFixed(1)}h, H-D1).` })
    }
  }

  // --- Totales de horas semanales ---
  const totalHoras = semana.reduce((sum, j) => sum + horasDeJornadaUI(j), 0)
  const francos = semana.filter(j => j.esFranco).length
  if (tipo === 'FULL') {
    if (Math.abs(totalHoras - 48) > 0.01) {
      avisos.push({ severidad: 'aviso', mensaje: `Total FULL = ${totalHoras.toFixed(1)}h; la regla dura pide exactamente 48h (H-F1).` })
    }
    if (francos !== 1) {
      avisos.push({ severidad: 'aviso', mensaje: `FULL debe tener exactamente 1 franco; ahora tiene ${francos} (H-F3).` })
    }
  } else if (tipo === 'PART') {
    if (totalHoras > 31.01) {
      avisos.push({ severidad: 'aviso', mensaje: `Total PART = ${totalHoras.toFixed(1)}h; el máximo es 31h (H-P1).` })
    }
    if (!jornadaEditada.esFranco && horasDeJornadaUI(jornadaEditada) > 6.01) {
      avisos.push({ severidad: 'error', mensaje: `Jornada PART de ${horasDeJornadaUI(jornadaEditada).toFixed(1)}h; el máximo por jornada es 6h (H-P5).` })
    }
    if (jornadaEditada.turnos.length === 2) {
      avisos.push({ severidad: 'error', mensaje: 'Los PART no pueden tener jornadas cortadas (H-P4).' })
    }
  }

  return avisos
}
