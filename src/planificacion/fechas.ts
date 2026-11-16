// AH2 · Tramo B1 — Aritmética de fechas calendario (YYYY-MM-DD), pura y sin zona horaria.
// Una `Fecha` es un día civil de la sucursal: quien la construye ya resolvió la zona
// horaria. Aquí se opera en UTC solo como calendario, nunca con la hora del reloj.

export type Fecha = string

const RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function esFechaValida(f: unknown): f is Fecha {
  if (typeof f !== 'string') return false
  const m = RE.exec(f)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

const aUTC = (f: Fecha) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d) }
const deUTC = (ms: number): Fecha => new Date(ms).toISOString().slice(0, 10)
const DIA_MS = 86_400_000

export function sumarDias(f: Fecha, n: number): Fecha { return deUTC(aUTC(f) + n * DIA_MS) }

/** Días de `a` a `b` (b − a). */
export function diferenciaDias(a: Fecha, b: Fecha): number { return Math.round((aUTC(b) - aUTC(a)) / DIA_MS) }

/** 0 = lunes … 6 = domingo (convención del motor y de la UI). */
export function diaSemana(f: Fecha): number { return (new Date(aUTC(f)).getUTCDay() + 6) % 7 }

export const esLunes = (f: Fecha) => diaSemana(f) === 0
export const esDomingo = (f: Fecha) => diaSemana(f) === 6
export const lunesDe = (f: Fecha): Fecha => sumarDias(f, -diaSemana(f))

/** Comparación lexicográfica válida para YYYY-MM-DD. */
export const compararFechas = (a: Fecha, b: Fecha) => (a < b ? -1 : a > b ? 1 : 0)
export const minFecha = (a: Fecha, b: Fecha) => (a <= b ? a : b)
export const maxFecha = (a: Fecha, b: Fecha) => (a >= b ? a : b)

/** Fechas del intervalo cerrado [desde, hasta]; vacío si desde > hasta. */
export function fechasEntre(desde: Fecha, hasta: Fecha): Fecha[] {
  const n = diferenciaDias(desde, hasta)
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => sumarDias(desde, i))
}

/** ¿Se solapan los intervalos cerrados [a1, a2] y [b1, b2]? */
export const seSolapan = (a1: Fecha, a2: Fecha, b1: Fecha, b2: Fecha) => a1 <= b2 && b1 <= a2
