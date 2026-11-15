// AH2 · Tramo B1 — Vigencia por intervalos efectivos de días (AH2-030, invariantes I1, I3, I4).
//
// La vigencia NO es un atributo de la versión: la forman tramos [desde, hasta] creados por cada
// publicación. Reemplazar desde una fecha F RECORTA los tramos anteriores (hastaEfectivo = F−1)
// mediante datos nuevos; nunca reescribe la versión ni los días anteriores a F. Si un tramo
// anterior seguía después del nuevo intervalo, ese resto continúa en un tramo de continuación
// de la misma versión.
//
// Concurrencia: el estado de vigencia de una sucursal tiene una `revision`. Publicar exige la
// revisión que se leyó (control optimista): si otra publicación ganó antes, se devuelve
// CONFLICTO_CONCURRENCIA. En P2 lo mismo se garantiza en la base con un bloqueo por sucursal
// y una restricción de exclusión; este módulo es la especificación ejecutable de esas reglas.
import { type ErrorPlanificacion, type Resultado, falla, fallas, ok } from './errores'
import { type Fecha, esFechaValida, maxFecha, seSolapan, sumarDias } from './fechas'

export interface TramoVigencia {
  id: string
  sucursalId: string
  publicacionId: string
  versionId: string
  desde: Fecha
  hasta: Fecha
  /** = hasta mientras no se recorte; F−1 tras un reemplazo; null si se anuló antes de empezar. */
  hastaEfectivo: Fecha | null
  /** Publicación que lo recortó o anuló (el tramo nunca se borra). */
  recortadoPor?: string
  /** Tramo del que es continuación (resto posterior a un reemplazo parcial). */
  continuaDe?: string
}

export interface EstadoVigencia {
  sucursalId: string
  revision: number
  tramos: TramoVigencia[]
}

export interface SolicitudPublicacion {
  publicacionId: string
  sucursalId: string
  /** Revisión del estado leída antes de publicar (control optimista). */
  revisionEsperada: number
  /** Hoy en la zona horaria de la sucursal. Ningún tramo nuevo puede empezar antes de mañana (I4, D14). */
  hoy: Fecha
  tramos: Array<{ versionId: string; desde: Fecha; hasta: Fecha }>
}

export interface Recorte {
  tramoId: string
  versionId: string
  hastaEfectivoAnterior: Fecha
  hastaEfectivoNuevo: Fecha | null
}

export interface ResultadoPublicacion {
  estado: EstadoVigencia
  creados: TramoVigencia[]
  recortes: Recorte[]
  /** Versiones que ya no rigen ningún día (todos sus tramos anulados): pasan a REEMPLAZADO_TOTAL. */
  versionesSinVigencia: string[]
}

/** ¿El tramo rige algún día? */
export const tramoActivo = (t: TramoVigencia) => t.hastaEfectivo !== null && t.hastaEfectivo >= t.desde

/** Tramo efectivo en una fecha para la sucursal (o null). Con I1 hay a lo sumo uno. */
export function tramoEfectivoEn(tramos: readonly TramoVigencia[], sucursalId: string, fecha: Fecha): TramoVigencia | null {
  return tramos.find(t => t.sucursalId === sucursalId && tramoActivo(t) && t.desde <= fecha && fecha <= t.hastaEfectivo!) ?? null
}

/** I1: ningún par de tramos efectivos de una misma sucursal se solapa. */
export function verificarSinSolapamientos(tramos: readonly TramoVigencia[]): Resultado<true> {
  const activos = tramos.filter(tramoActivo)
  const errores: ErrorPlanificacion[] = []
  for (let i = 0; i < activos.length; i++) {
    for (let j = i + 1; j < activos.length; j++) {
      const a = activos[i], b = activos[j]
      if (a.sucursalId === b.sucursalId && seSolapan(a.desde, a.hastaEfectivo!, b.desde, b.hastaEfectivo!)) {
        errores.push({ codigo: 'SOLAPAMIENTO_VIGENCIA', mensaje: `Los tramos ${a.id} y ${b.id} rigen días en común.`, detalle: { tramos: [a.id, b.id] } })
      }
    }
  }
  return errores.length ? fallas(errores) : ok(true)
}

/**
 * Aplica una publicación sobre el estado de vigencia de una sucursal. Pura: devuelve el estado
 * nuevo (revisión + 1) sin modificar el recibido.
 */
export function aplicarPublicacion(estado: EstadoVigencia, s: SolicitudPublicacion): Resultado<ResultadoPublicacion> {
  if (s.sucursalId !== estado.sucursalId) return falla('SUCURSAL_DISTINTA', 'La publicación pertenece a otra sucursal.', { sucursal: s.sucursalId })
  if (s.revisionEsperada !== estado.revision) {
    return falla('CONFLICTO_CONCURRENCIA', 'Otra publicación cambió la vigencia desde que se leyó: revisá y volvé a publicar.', { revisionEsperada: s.revisionEsperada, revisionActual: estado.revision })
  }
  if (!esFechaValida(s.hoy)) return falla('FECHA_INVALIDA', `Fecha de hoy inválida: ${s.hoy}.`)
  const manana = sumarDias(s.hoy, 1)
  const errores: ErrorPlanificacion[] = []
  for (const t of s.tramos) {
    if (!esFechaValida(t.desde) || !esFechaValida(t.hasta)) { errores.push({ codigo: 'FECHA_INVALIDA', mensaje: `Tramo con fecha inválida (${t.desde}–${t.hasta}).` }); continue }
    if (t.hasta < t.desde) errores.push({ codigo: 'TRAMO_INVERTIDO', mensaje: `El tramo ${t.desde}–${t.hasta} termina antes de empezar.` })
    if (t.desde < manana) {
      errores.push({ codigo: 'FECHA_NO_FUTURA', mensaje: `Un reemplazo empieza como mínimo mañana (${manana}); no puede afectar ${t.desde}.`, detalle: { desde: t.desde, hoy: s.hoy } })
    }
  }
  for (let i = 0; i < s.tramos.length; i++) for (let j = i + 1; j < s.tramos.length; j++) {
    const a = s.tramos[i], b = s.tramos[j]
    if (seSolapan(a.desde, a.hasta, b.desde, b.hasta)) errores.push({ codigo: 'TRAMOS_NUEVOS_SOLAPADOS', mensaje: 'La publicación contiene tramos que se superponen entre sí.' })
  }
  if (s.tramos.length === 0) errores.push({ codigo: 'TRAMO_INVERTIDO', mensaje: 'La publicación no tiene tramos.' })
  if (errores.length) return fallas(errores)

  let tramos = estado.tramos.map(t => ({ ...t }))
  const recortes = new Map<string, Recorte>()
  const continuaciones = new Set<string>()
  const ordenados = [...s.tramos].sort((a, b) => (a.desde < b.desde ? -1 : 1))
  ordenados.forEach((nuevo, k) => {
    const siguiente: TramoVigencia[] = []
    for (const t of tramos) {
      if (!tramoActivo(t) || t.sucursalId !== s.sucursalId || !seSolapan(t.desde, t.hastaEfectivo!, nuevo.desde, nuevo.hasta)) { siguiente.push(t); continue }
      const anterior = t.hastaEfectivo!
      // Parte anterior a F: se conserva tal cual (nunca se reescribe el pasado ni lo previo a F).
      const recortado = nuevo.desde > t.desde ? sumarDias(nuevo.desde, -1) : null
      if (continuaciones.has(t.id)) siguiente.push({ ...t, hastaEfectivo: recortado })
      else {
        const previo = recortes.get(t.id)
        recortes.set(t.id, { tramoId: t.id, versionId: t.versionId, hastaEfectivoAnterior: previo?.hastaEfectivoAnterior ?? anterior, hastaEfectivoNuevo: recortado })
        siguiente.push({ ...t, hastaEfectivo: recortado, recortadoPor: s.publicacionId })
      }
      // Resto posterior al nuevo intervalo: continúa la MISMA versión en un tramo nuevo
      // (visible para los tramos siguientes de esta misma publicación).
      if (anterior > nuevo.hasta) {
        const id = `${s.publicacionId}:cont:${k}:${t.continuaDe ?? t.id}`
        continuaciones.add(id)
        siguiente.push({
          id, sucursalId: t.sucursalId, publicacionId: t.publicacionId, versionId: t.versionId,
          desde: sumarDias(nuevo.hasta, 1), hasta: anterior, hastaEfectivo: anterior, continuaDe: t.continuaDe ?? t.id,
        })
      }
    }
    tramos = siguiente
  })
  const creados: TramoVigencia[] = ordenados.map((t, i) => ({
    id: `${s.publicacionId}:${i}`, sucursalId: s.sucursalId, publicacionId: s.publicacionId, versionId: t.versionId,
    desde: t.desde, hasta: t.hasta, hastaEfectivo: t.hasta,
  }))
  // Una continuación creada y anulada dentro de la misma publicación nunca rigió: no se guarda.
  const final = [...tramos.filter(t => !(continuaciones.has(t.id) && !tramoActivo(t))), ...creados]
  const sinSolapes = verificarSinSolapamientos(final)
  if (!sinSolapes.ok) return sinSolapes
  const versionesAntes = new Set(estado.tramos.filter(tramoActivo).map(t => t.versionId))
  const versionesDespues = new Set(final.filter(tramoActivo).map(t => t.versionId))
  return ok({
    estado: { sucursalId: estado.sucursalId, revision: estado.revision + 1, tramos: final },
    creados: [...creados, ...final.filter(t => continuaciones.has(t.id))],
    recortes: [...recortes.values()],
    versionesSinVigencia: [...versionesAntes].filter(v => !versionesDespues.has(v)),
  })
}

/** Estado inicial (sin publicaciones) de una sucursal. */
export const vigenciaVacia = (sucursalId: string): EstadoVigencia => ({ sucursalId, revision: 0, tramos: [] })

/** Última fecha con vigencia definida (o null). */
export function ultimaFechaVigente(tramos: readonly TramoVigencia[], sucursalId: string): Fecha | null {
  return tramos.filter(t => t.sucursalId === sucursalId && tramoActivo(t)).reduce<Fecha | null>((m, t) => (m ? maxFecha(m, t.hastaEfectivo!) : t.hastaEfectivo), null)
}
