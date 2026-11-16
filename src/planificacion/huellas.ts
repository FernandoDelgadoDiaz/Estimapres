// AH2 · Tramo B1 — Huellas de las entradas de un horario (reproducibilidad, caducidad de la
// validación técnica). SHA-256 síncrono y puro sobre un JSON canónico: el mismo resultado en
// el navegador, en Node y (en P2) en la Netlify Function. Sin dependencias.
import { type Resultado, falla, ok } from './errores'

/**
 * JSON canónico para huellas. Política explícita (todo lo no listado se RECHAZA con la ruta del
 * valor, nunca se convierte en silencio):
 *  - Datos admitidos: null, booleanos, números finitos (−0 se normaliza a 0), cadenas, arreglos y
 *    objetos planos (prototipo Object.prototype o null).
 *  - Cadenas y claves se normalizan a Unicode NFC (la misma palabra escrita con caracteres
 *    combinados o precompuestos da la misma huella). Dos claves que coinciden tras normalizar se
 *    rechazan (serían ambiguas).
 *  - Claves de objetos ordenadas por código UTF-16 (orden de JS, estable entre Node y navegadores).
 *  - AUSENTE ≠ NULO:
 *      · una propiedad con valor `undefined` equivale a una propiedad ausente (como en JSON y en
 *        el jsonb de Supabase), y se distingue de `null`;
 *      · en la raíz, `undefined` se codifica con el token `undefined` (que ningún JSON puede
 *        producir), distinto de `null`;
 *      · en arreglos, `undefined` y los huecos se rechazan: JSON los convertiría en `null` y
 *        colisionarían con un `null` explícito.
 *  - Rechazados: NaN, ±Infinity, bigint, símbolos, funciones, Date, Map, Set, RegExp, arreglos
 *    tipados, ArrayBuffer, primitivos envueltos (new String…), instancias de clases y objetos con
 *    claves símbolo o getters. Quien tenga fechas debe pasarlas como texto (YYYY-MM-DD o ISO).
 */
export function jsonCanonico(valor: unknown): Resultado<string> {
  if (valor === undefined) return ok('undefined')
  const vistos = new Set<object>()
  let problema: string | null = null
  const fallar = (ruta: string, motivo: string) => { if (!problema) problema = `${ruta}: ${motivo}`; return '' }
  const cadena = (x: string) => JSON.stringify(x.normalize('NFC'))
  const enc = (v: unknown, ruta: string): string => {
    if (problema) return ''
    if (v === null) return 'null'
    switch (typeof v) {
      case 'string': return cadena(v)
      case 'boolean': return v ? 'true' : 'false'
      case 'number':
        if (!Number.isFinite(v)) return fallar(ruta, `número no finito (${v})`)
        return JSON.stringify(Object.is(v, -0) ? 0 : v)
      case 'undefined': return fallar(ruta, 'undefined fuera de una propiedad de objeto')
      case 'bigint': return fallar(ruta, 'bigint no admitido')
      case 'symbol': return fallar(ruta, 'símbolo no admitido')
      case 'function': return fallar(ruta, 'función no admitida')
    }
    const o = v as object
    if (vistos.has(o)) return fallar(ruta, 'referencia circular')
    if (Array.isArray(o)) {
      if (Object.getPrototypeOf(o) !== Array.prototype) return fallar(ruta, 'subclase de Array no admitida')
      vistos.add(o)
      const partes: string[] = []
      for (let k = 0; k < o.length; k++) {
        if (!(k in o)) return fallar(`${ruta}[${k}]`, 'hueco en el arreglo')
        if (o[k] === undefined) return fallar(`${ruta}[${k}]`, 'undefined en un arreglo (ambiguo con null)')
        partes.push(enc(o[k], `${ruta}[${k}]`))
      }
      vistos.delete(o)
      return `[${partes.join(',')}]`
    }
    const proto = Object.getPrototypeOf(o)
    if (proto !== Object.prototype && proto !== null) {
      const nombre = (proto && proto.constructor && proto.constructor.name) || 'desconocido'
      return fallar(ruta, `objeto no plano (${nombre}) no admitido`)
    }
    if (Object.getOwnPropertySymbols(o).length) return fallar(ruta, 'claves símbolo no admitidas')
    vistos.add(o)
    const porClave = new Map<string, string>()
    for (const k of Object.keys(o)) {
      const desc = Object.getOwnPropertyDescriptor(o, k)!
      if (!('value' in desc)) return fallar(`${ruta}.${k}`, 'propiedad con getter no admitida')
      if (desc.value === undefined) continue // ausente
      const kn = k.normalize('NFC')
      if (porClave.has(kn)) return fallar(`${ruta}.${k}`, 'dos claves iguales tras normalizar Unicode')
      porClave.set(kn, enc(desc.value, `${ruta}.${k}`))
    }
    vistos.delete(o)
    const claves = [...porClave.keys()].sort()
    return `{${claves.map(k => `${cadena(k)}:${porClave.get(k)}`).join(',')}}`
  }
  const s = enc(valor, '$')
  if (problema) return falla('VALOR_NO_SERIALIZABLE', `No se puede calcular la huella: ${problema}.`, { motivo: problema })
  return ok(s)
}

// ---------- SHA-256 (FIPS 180-4) ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256Hex(texto: string): string {
  const datos = new TextEncoder().encode(texto)
  const largoBits = datos.length * 8
  const total = Math.ceil((datos.length + 9) / 64) * 64
  const m = new Uint8Array(total)
  m.set(datos)
  m[datos.length] = 0x80
  const dv = new DataView(m.buffer)
  dv.setUint32(total - 8, Math.floor(largoBits / 0x1_0000_0000))
  dv.setUint32(total - 4, largoBits >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0
  }
  return Array.from(h, x => x.toString(16).padStart(8, '0')).join('')
}

/** Huella de cualquier valor serializable: `sha256:<hex>` del JSON canónico. */
export function huellaDe(valor: unknown): Resultado<string> {
  const j = jsonCanonico(valor)
  return j.ok ? ok(`sha256:${sha256Hex(j.valor)}`) : j
}

/**
 * Entradas que determinan un horario y su validez técnica. Cambiar CUALQUIERA hace caducar
 * la validación (§5.2 del diseño v3). `perfilNormativoId` identifica el perfil técnico
 * contra el que se validó; su estado jurídico es independiente (AH2-033).
 */
export interface EntradasHorario {
  horario: unknown
  demanda: unknown
  reglas: unknown
  roster: unknown
  contratos: unknown
  configOperativa: unknown
  ausencias: unknown
  perfilNormativoId: string
  versionAlgoritmo?: string
}

export interface HuellasHorario {
  /** Huella combinada: la única que se compara para la caducidad. */
  total: string
  partes: Record<keyof Omit<EntradasHorario, 'perfilNormativoId' | 'versionAlgoritmo'>, string> & { perfilNormativoId: string; versionAlgoritmo?: string }
}

export function huellasDe(e: EntradasHorario): Resultado<HuellasHorario> {
  const claves = ['horario', 'demanda', 'reglas', 'roster', 'contratos', 'configOperativa', 'ausencias'] as const
  const partes: Record<string, string> = {}
  for (const k of claves) {
    const h = huellaDe(e[k])
    if (!h.ok) return h
    partes[k] = h.valor
  }
  const base = { ...partes, perfilNormativoId: e.perfilNormativoId, ...(e.versionAlgoritmo ? { versionAlgoritmo: e.versionAlgoritmo } : {}) }
  const total = huellaDe(base)
  if (!total.ok) return total
  return ok({ total: total.valor, partes: base as HuellasHorario['partes'] })
}
