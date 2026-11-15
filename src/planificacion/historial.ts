// AH2 · Tramo B1 — Historial efectivo POR FECHA (AH2-031, invariante I5).
//
// Para cada fecha transcurrida, la jornada de cada colaborador según la versión cuyo tramo
// estaba efectivo ESE día, incluidas versiones reemplazadas después (sus días anteriores al
// reemplazo siguen contando). Nunca cuentan: borradores, validados o aprobados sin publicar,
// prueba local, descartados, fechas de hoy en adelante ni tramos anulados.
//
// Es lo PLANIFICADO Y VIGENTE en cada fecha, no la asistencia real (fuera de alcance, #44):
// nunca se presenta como trabajo efectivamente realizado. Las ausencias se descuentan mediante
// el predicado `ausente` (el módulo de ausencias es B2; aquí solo se recibe la consulta).
import type { JornadaAsignada } from '../types'
import { type ErrorPlanificacion, type Resultado, falla, fallas, ok } from './errores'
import { type Fecha, esFechaValida, fechasEntre, lunesDe, minFecha, sumarDias } from './fechas'
import type { VersionPlan } from './estados'
import { type SemanaPlan, jornadasPorFecha } from './semana'
import { type TramoVigencia, tramoEfectivoEn } from './vigencia'

export interface VersionConHorario { version: VersionPlan; semana: SemanaPlan }

export interface DiaEfectivo {
  fecha: Fecha
  fuente: 'oficial' | 'legado-presunto'
  versionId: string
  tramoId: string | null
  jornadas: Array<{ colaboradorId: string; jornada: JornadaAsignada }>
  /** Colaboradores con ausencia registrada ese día: no suman a la equidad. */
  ausentes: string[]
}

export interface ConsultaHistorial {
  sucursalId: string
  desde: Fecha
  hasta: Fecha
  /** Hoy en la zona horaria de la sucursal: solo cuentan fechas anteriores. */
  hoy: Fecha
  tramos: readonly TramoVigencia[]
  versiones: readonly VersionConHorario[]
  ausente?: (colaboradorId: string, fecha: Fecha) => boolean
  /**
   * D4 (transitorio, opt-in): para fechas sin vigencia oficial, usar la última versión legada de
   * esa semana, etiquetada «legado-presunto». Nunca se declara publicada.
   */
  legadoPresunto?: readonly VersionConHorario[]
}

const ESTADOS_OFICIALES = new Set(['PUBLICADO', 'REEMPLAZADO_TOTAL'])

export function historialEfectivo(q: ConsultaHistorial): Resultado<DiaEfectivo[]> {
  if (!esFechaValida(q.desde) || !esFechaValida(q.hasta) || !esFechaValida(q.hoy)) return falla('FECHA_INVALIDA', 'Rango o fecha de hoy inválidos.')
  const ultimo = minFecha(q.hasta, sumarDias(q.hoy, -1))
  const porId = new Map<string, VersionConHorario>()
  for (const v of [...q.versiones, ...(q.legadoPresunto ?? [])]) {
    if (porId.has(v.version.id)) return falla('ID_DUPLICADO', `La versión «${v.version.id}» aparece repetida en la consulta del historial.`, { versionId: v.version.id })
    porId.set(v.version.id, v)
  }
  for (const l of q.legadoPresunto ?? []) porId.delete(l.version.id) // el legado solo se usa como presunto
  const indices = new Map<string, ReturnType<typeof jornadasPorFecha>>()
  const legado = new Map<Fecha, VersionConHorario>()
  for (const l of q.legadoPresunto ?? []) {
    if (!l.version.legado || l.version.sucursalId !== q.sucursalId) continue
    const prev = legado.get(l.version.fechaLunes)
    if (!prev || l.version.numero > prev.version.numero) legado.set(l.version.fechaLunes, l)
  }
  const errores: ErrorPlanificacion[] = []
  const dias: DiaEfectivo[] = []
  for (const fecha of fechasEntre(q.desde, ultimo)) {
    const tramo = tramoEfectivoEn(q.tramos, q.sucursalId, fecha)
    let fuente: DiaEfectivo['fuente'] = 'oficial'
    let vh: VersionConHorario | undefined
    if (tramo) {
      vh = porId.get(tramo.versionId)
      const v = vh?.version
      if (!vh || !v || v.ambito !== 'servidor' || !ESTADOS_OFICIALES.has(v.estado) || v.sucursalId !== q.sucursalId || v.legado) {
        errores.push({ codigo: 'TRAMO_SIN_VERSION_PUBLICADA', mensaje: `El tramo ${tramo.id} apunta a una versión que no es oficial y publicada.`, detalle: { tramoId: tramo.id, versionId: tramo.versionId, fecha } })
        continue
      }
      if (lunesDe(fecha) !== v.fechaLunes) {
        errores.push({ codigo: 'TRAMO_SIN_VERSION_PUBLICADA', mensaje: `El tramo ${tramo.id} rige ${fecha}, fuera de la semana de su versión (${v.fechaLunes}).`, detalle: { tramoId: tramo.id, fecha } })
        continue
      }
    } else {
      vh = legado.get(lunesDe(fecha))
      if (!vh) continue
      fuente = 'legado-presunto'
    }
    if (!vh) continue
    let idx = indices.get(vh.version.id)
    if (!idx) { idx = jornadasPorFecha(vh.semana); indices.set(vh.version.id, idx) }
    const jornadas: DiaEfectivo['jornadas'] = []
    const ausentes: string[] = []
    for (const [colaboradorId, porFecha] of idx) {
      const jornada = porFecha.get(fecha)
      if (!jornada) continue
      if (q.ausente?.(colaboradorId, fecha)) { ausentes.push(colaboradorId); continue }
      jornadas.push({ colaboradorId, jornada })
    }
    dias.push({ fecha, fuente, versionId: vh.version.id, tramoId: tramo?.id ?? null, jornadas, ausentes })
  }
  return errores.length ? fallas(errores) : ok(dias)
}
