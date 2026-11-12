// src/utils/pomContrato.ts
// POM-01 (#8) — Contrato de entrada POM v2 (puro, sin pdf.js: testeable con texto).
//
// Responsabilidades:
//   1. Detectar la SEMANA del documento (encabezado / nombre de archivo), no la
//      semana del reloj.
//   2. Extraer la tabla «Estimado de cajas necesarias» (única fuente de demanda;
//      «Diferencia de cajas necesarias» NO es demanda) con validación estricta.
//
// Convención de grilla (MASTER §2): filas cada 30 min de 07:00 a 22:00
// (HORAS_FRANJAS). La fila HH:MM representa la demanda de [HH:MM, HH:MM+30).
// La última fila 22:00 = 22:00–22:30. No se inventa demanda fuera de la grilla.

import { HORAS_FRANJAS, type Franja } from '../types'

// ======================= SEMANA =======================

export interface SemanaPOM {
  /** Lunes de la semana, yyyy-MM-dd */
  lunes: string
  /** Domingo de la semana, yyyy-MM-dd */
  domingo: string
  /** De dónde se obtuvo */
  fuente: 'texto' | 'archivo'
}

export type ResultadoSemana =
  | { ok: true; semana: SemanaPOM }
  | { ok: false; motivo: 'no_encontrada' | 'ambigua'; candidatas: string[] }

const MS_DIA = 86_400_000

function fechaUTC(y: number, m: number, d: number): Date | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const f = new Date(Date.UTC(y, m - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f : null
}

const iso = (f: Date) => f.toISOString().slice(0, 10)

/** Extrae fechas completas (dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy o yyyy-mm-dd) en orden de aparición. */
export function extraerFechas(texto: string): Date[] {
  const re = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g
  const out: Date[] = []
  for (const m of texto.matchAll(re)) {
    const f = m[1] ? fechaUTC(+m[1], +m[2], +m[3]) : fechaUTC(+m[6], +m[5], +m[4])
    if (f) out.push(f)
  }
  return out
}

/** Semanas (lunes ISO) para las que el texto contiene lunes y domingo de la misma semana. */
function semanasCandidatas(fechas: Date[]): string[] {
  const set = new Set(fechas.map(f => f.getTime()))
  const lunes = new Set<string>()
  for (const f of fechas) {
    if (f.getUTCDay() !== 1) continue // 1 = lunes
    if (set.has(f.getTime() + 6 * MS_DIA)) lunes.add(iso(f))
  }
  return [...lunes].sort()
}

/**
 * Detecta la semana del POM. Requiere que aparezcan el lunes y el domingo de la
 * misma semana (p. ej. «2026-11-16 - 2026-11-22» o «16/11/2026 al 22/11/2026»).
 * Primero en el texto; si no hay, en el nombre del archivo. Más de una semana
 * posible en la misma fuente = ambigua (error explícito, no se adivina).
 */
export function detectarSemanaPOM(texto: string, nombreArchivo = ''): ResultadoSemana {
  for (const [fuente, src] of [['texto', texto], ['archivo', nombreArchivo]] as const) {
    const cand = semanasCandidatas(extraerFechas(src))
    if (cand.length === 1) {
      const l = new Date(cand[0] + 'T00:00:00Z')
      return { ok: true, semana: { lunes: cand[0], domingo: iso(new Date(l.getTime() + 6 * MS_DIA)), fuente } }
    }
    if (cand.length > 1) return { ok: false, motivo: 'ambigua', candidatas: cand }
  }
  return { ok: false, motivo: 'no_encontrada', candidatas: [] }
}

/** Fechas lunes→domingo (yyyy-MM-dd) a partir del lunes. */
export function fechasDeSemana(lunes: string): string[] {
  const l = new Date(lunes + 'T00:00:00Z').getTime()
  return Array.from({ length: 7 }, (_, i) => iso(new Date(l + i * MS_DIA)))
}

export function esLunesISO(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false
  const [y, m, d] = fecha.split('-').map(Number)
  const f = fechaUTC(y, m, d)
  return !!f && f.getUTCDay() === 1
}

// ======================= TABLA ESTIMADO =======================

export class ErrorContratoPOM extends Error {
  constructor(public readonly errores: string[]) {
    super(`PDF POM inválido:\n- ${errores.join('\n- ')}`)
    this.name = 'ErrorContratoPOM'
  }
}

export interface ResultadoTablaPOM {
  /** Alineadas a HORAS_FRANJAS (31 filas × 7 días). */
  franjas: Franja[]
  /** Filas tal como se leyeron (sin alinear). */
  filasLeidas: Franja[]
  /** Observaciones no bloqueantes (filas de borde faltantes rellenadas con 0, etc.). */
  avisos: string[]
  /** Σ celdas / 2 (cada celda = N cajas durante 30 min). */
  horasCaja: number
}

const TITULOS_TABLAS = [
  /estimado\s+de\s+cajas\s+necesarias/gi,
  /diferencia\s+de\s+cajas\s+necesarias/gi,
  /programaci[oó]n\s+de(l)?\s+personal/gi,
  /personal\s+programado/gi,
]

interface FilaCruda { hora: string; valores: string[] }

const esHora = (t: string) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t)
const normHora = (t: string) => {
  const [h, m] = t.split(':')
  return `${h.padStart(2, '0')}:${m}`
}

/** Lee filas «HH:MM(:SS) + 7 tokens» de un segmento. No convierte ni corrige valores. */
function leerFilas(segmento: string): FilaCruda[] {
  const mh = /horario/i.exec(segmento)
  const tokens = (mh ? segmento.substring(mh.index) : segmento).split(/\s+/).filter(Boolean)
  const filas: FilaCruda[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (!esHora(tokens[i])) continue
    const valores = tokens.slice(i + 1, i + 8)
    if (valores.length === 7 && valores.every(v => /^-?\d+([.,]\d+)?$/.test(v))) {
      filas.push({ hora: normHora(tokens[i]), valores })
      i += 7
    }
  }
  return filas
}

const puntaje = (filas: FilaCruda[]) =>
  filas.length * 10 - filas.reduce((n, f) => n + f.valores.filter(v => v.startsWith('-')).length, 0) * 25

/**
 * Extrae y valida la tabla «Estimado de cajas necesarias» del texto del PDF.
 * Lanza ErrorContratoPOM con TODOS los problemas detectados (no corrige en silencio).
 */
export function parsearTablaEstimado(texto: string): ResultadoTablaPOM {
  const ocurrencias = [...texto.matchAll(/estimado\s+de\s+cajas\s+necesarias/gi)]
  if (ocurrencias.length === 0) {
    throw new ErrorContratoPOM(['No se encontró la tabla «Estimado de cajas necesarias».'])
  }
  const titulos: number[] = []
  for (const re of TITULOS_TABLAS) {
    re.lastIndex = 0
    for (const m of texto.matchAll(re)) if (m.index !== undefined) titulos.push(m.index)
  }
  titulos.sort((a, b) => a - b)

  // Si el título aparece más de una vez, elegir el segmento con más filas y sin
  // negativos (los negativos caracterizan a «Diferencia»).
  let filas: FilaCruda[] = []
  let mejor = -Infinity
  for (const oc of ocurrencias) {
    const desde = (oc.index ?? 0) + oc[0].length
    const hasta = titulos.find(p => p > desde) ?? texto.length
    const f = leerFilas(texto.substring(desde, hasta))
    const p = puntaje(f)
    if (p > mejor) { mejor = p; filas = f }
  }

  const errores: string[] = []
  const avisos: string[] = []
  if (filas.length === 0) {
    throw new ErrorContratoPOM(['La tabla «Estimado de cajas necesarias» no tiene filas legibles (HH:MM + 7 valores).'])
  }

  const grilla = new Map(HORAS_FRANJAS.map((h, i) => [h, i]))
  const vistas = new Map<string, number>()
  const leidas: Franja[] = []
  for (const f of filas) {
    vistas.set(f.hora, (vistas.get(f.hora) ?? 0) + 1)
    const nums: number[] = []
    f.valores.forEach((v, d) => {
      if (!/^\d+$/.test(v)) {
        errores.push(`${f.hora}, día ${d + 1}: valor «${v}» no es un entero ≥ 0.`)
        nums.push(NaN)
      } else nums.push(Number(v))
    })
    if (!grilla.has(f.hora)) {
      if (nums.some(n => n > 0)) {
        errores.push(`${f.hora}: demanda fuera de la grilla 07:00–22:00 (no se descarta en silencio; confirmar horario operativo).`)
      } else avisos.push(`${f.hora}: fila fuera de la grilla con demanda 0, ignorada.`)
      continue
    }
    leidas.push({ hora: f.hora, necesidad: nums })
  }
  for (const [h, n] of vistas) if (n > 1) errores.push(`${h}: fila duplicada (${n} veces).`)

  // Orden y huecos
  const idx = leidas.map(f => grilla.get(f.hora)!)
  for (let k = 1; k < idx.length; k++) {
    if (idx[k] <= idx[k - 1] && leidas[k].hora !== leidas[k - 1].hora) {
      errores.push(`Filas fuera de orden: ${leidas[k - 1].hora} antes de ${leidas[k].hora}.`)
    }
  }
  if (idx.length) {
    const min = Math.min(...idx), max = Math.max(...idx)
    const presentes = new Set(idx)
    for (let i = min; i <= max; i++) {
      if (!presentes.has(i)) errores.push(`Falta la franja ${HORAS_FRANJAS[i]} dentro de la tabla.`)
    }
    if (min > 0) avisos.push(`La tabla empieza en ${HORAS_FRANJAS[min]}; franjas anteriores se toman como 0.`)
    if (max < HORAS_FRANJAS.length - 1) avisos.push(`La tabla termina en ${HORAS_FRANJAS[max]}; franjas posteriores se toman como 0.`)
  }

  if (errores.length) throw new ErrorContratoPOM(errores)

  const mapa = new Map(leidas.map(f => [f.hora, f.necesidad]))
  const franjas = HORAS_FRANJAS.map(hora => ({ hora, necesidad: mapa.get(hora) ?? Array(7).fill(0) }))
  const total = franjas.reduce((s, f) => s + f.necesidad.reduce((a, b) => a + b, 0), 0)
  if (total === 0) {
    throw new ErrorContratoPOM(['La tabla «Estimado de cajas necesarias» no tiene demanda (todos los valores son 0).'])
  }
  return { franjas, filasLeidas: leidas, avisos, horasCaja: total / 2 }
}
