// AH2 · Tramo B1 — Ciclos de planificación explícitos (AH2-016, D2 autorizada: lunes a domingo).
// El cambio de ciclo surge SOLO del calendario declarado por la sucursal, nunca del día 1
// del mes (invariante I6).
import { type Fecha, diferenciaDias, esDomingo, esFechaValida, esLunes, fechasEntre, sumarDias } from './fechas'
import { type ErrorPlanificacion, type Resultado, falla, fallas, ok } from './errores'

export type Modalidad = 'semanal' | 'mensual'

export interface CicloPlanificacion {
  id: string
  sucursalId: string
  nombre: string
  modalidad: Modalidad
  /** Lunes de inicio (incluido). */
  inicio: Fecha
  /** Domingo de fin (incluido). */
  fin: Fecha
  estado: 'planificado' | 'abierto' | 'cerrado'
  origen: 'sucursal' | 'calendario-empresa'
}

/** Semanas permitidas por modalidad: semanal = 1; mensual = 4 o 5 según la vigencia real. */
export const SEMANAS_PERMITIDAS: Record<Modalidad, readonly number[]> = { semanal: [1], mensual: [4, 5] }

export function semanasDe(ciclo: Pick<CicloPlanificacion, 'inicio' | 'fin'>): number {
  return (diferenciaDias(ciclo.inicio, ciclo.fin) + 1) / 7
}

/** Errores de un ciclo aislado (fechas, lunes a domingo, duración por modalidad). */
export function validarCiclo(c: CicloPlanificacion): ErrorPlanificacion[] {
  const e: ErrorPlanificacion[] = []
  const d = { cicloId: c.id }
  if (!esFechaValida(c.inicio) || !esFechaValida(c.fin)) {
    return [{ codigo: 'FECHA_INVALIDA', mensaje: `El ciclo «${c.nombre}» tiene una fecha inválida.`, detalle: d }]
  }
  if (c.fin < c.inicio) e.push({ codigo: 'CICLO_INVERTIDO', mensaje: `El ciclo «${c.nombre}» termina antes de empezar.`, detalle: d })
  if (!esLunes(c.inicio)) e.push({ codigo: 'INICIO_NO_LUNES', mensaje: `El ciclo «${c.nombre}» debe empezar un lunes (${c.inicio}).`, detalle: d })
  if (!esDomingo(c.fin)) e.push({ codigo: 'FIN_NO_DOMINGO', mensaje: `El ciclo «${c.nombre}» debe terminar un domingo (${c.fin}).`, detalle: d })
  if (e.length === 0 && !SEMANAS_PERMITIDAS[c.modalidad].includes(semanasDe(c))) {
    e.push({
      codigo: 'DURACION_INVALIDA',
      mensaje: `El ciclo ${c.modalidad} «${c.nombre}» dura ${semanasDe(c)} semana(s); se admiten ${SEMANAS_PERMITIDAS[c.modalidad].join(' o ')}.`,
      detalle: d,
    })
  }
  return e
}

/**
 * Valida el calendario de UNA sucursal: cada ciclo, ids únicos, sin superposiciones y sin
 * huecos entre ciclos consecutivos. Devuelve todos los errores, no solo el primero.
 */
export function validarCalendario(ciclos: readonly CicloPlanificacion[]): Resultado<CicloPlanificacion[]> {
  const errores: ErrorPlanificacion[] = []
  const sucursales = new Set(ciclos.map(c => c.sucursalId))
  if (sucursales.size > 1) {
    errores.push({ codigo: 'SUCURSAL_DISTINTA', mensaje: 'Un calendario debe pertenecer a una sola sucursal.', detalle: { sucursales: [...sucursales] } })
  }
  const vistos = new Set<string>()
  for (const c of ciclos) {
    if (vistos.has(c.id)) errores.push({ codigo: 'ID_DUPLICADO', mensaje: `El identificador de ciclo «${c.id}» está repetido.`, detalle: { cicloId: c.id } })
    vistos.add(c.id)
    errores.push(...validarCiclo(c))
  }
  if (errores.length) return fallas(errores)
  const orden = [...ciclos].sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))
  for (let i = 1; i < orden.length; i++) {
    const prev = orden[i - 1], act = orden[i]
    if (act.inicio <= prev.fin) {
      errores.push({ codigo: 'SUPERPOSICION_CICLOS', mensaje: `Los ciclos «${prev.nombre}» y «${act.nombre}» se superponen.`, detalle: { ciclos: [prev.id, act.id] } })
    } else if (act.inicio !== sumarDias(prev.fin, 1)) {
      errores.push({
        codigo: 'HUECO_ENTRE_CICLOS',
        mensaje: `Entre «${prev.nombre}» (fin ${prev.fin}) y «${act.nombre}» (inicio ${act.inicio}) quedan semanas sin ciclo.`,
        detalle: { ciclos: [prev.id, act.id] },
      })
    }
  }
  return errores.length ? fallas(errores) : ok(orden)
}

/** Ciclo que contiene la fecha (o null). Supone un calendario ya validado. */
export function cicloDe(ciclos: readonly CicloPlanificacion[], fecha: Fecha): CicloPlanificacion | null {
  return ciclos.find(c => c.inicio <= fecha && fecha <= c.fin) ?? null
}

/**
 * ¿La semana que empieza en `lunes` es la primera de su ciclo? Solo el calendario lo decide:
 * una semana que cruza fin de mes sin un ciclo nuevo NO es primera semana (#44 (e)).
 */
export function esPrimeraSemanaDelCiclo(ciclos: readonly CicloPlanificacion[], lunes: Fecha): Resultado<boolean> {
  if (!esFechaValida(lunes)) return falla('FECHA_INVALIDA', `Fecha inválida: ${lunes}.`)
  if (!esLunes(lunes)) return falla('INICIO_NO_LUNES', `La semana se identifica por su lunes (${lunes} no lo es).`)
  const c = cicloDe(ciclos, lunes)
  return ok(c !== null && c.inicio === lunes)
}

/** Lunes de cada semana del ciclo (1, 4 o 5). */
export function semanasDelCiclo(ciclo: CicloPlanificacion): Fecha[] {
  return fechasEntre(ciclo.inicio, ciclo.fin).filter(esLunes)
}
