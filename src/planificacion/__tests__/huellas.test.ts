import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { huellaDe, huellasDe, jsonCanonico, sha256Hex, type EntradasHorario } from '../huellas'
import { prng, semana } from './fixtures'

const entradas = (): EntradasHorario => ({
  horario: semana('2026-11-16').horarios,
  demanda: [[1, 2], [3, 4]],
  reglas: [{ id: 'r1', tipo: 'max_francos_dia', cantidad: 2 }],
  roster: [{ id: 'c1', tipo: 'PART', horas: 32 }],
  contratos: { c1: { objetivo: 64 } },
  configOperativa: { aperturaSoloAux: true },
  ausencias: [],
  perfilNormativoId: 'horas-2026-11-part32',
})

describe('B1 · huellas', () => {
  it('SHA-256 propio coincide con node:crypto (vectores conocidos y texto UTF-8)', () => {
    for (const t of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'ñandú · sucursal 091 · 32 h', 'x'.repeat(1000)]) {
      expect(sha256Hex(t)).toBe(createHash('sha256').update(t, 'utf8').digest('hex'))
    }
  })

  it('JSON canónico: estable ante el orden de claves; omite undefined; rechaza NaN y ciclos', () => {
    expect(jsonCanonico({ b: 1, a: { d: [3, 1], c: undefined } })).toEqual({ ok: true, valor: '{"a":{"d":[3,1]},"b":1}' })
    expect(huellaDe({ x: 1, y: 2 })).toEqual(huellaDe({ y: 2, x: 1 }))
    expect(huellaDe(-0)).toEqual(huellaDe(0))
    expect(huellaDe({ n: NaN }).ok).toBe(false)
    const c: Record<string, unknown> = {}; c.self = c
    const r = huellaDe(c)
    expect(r.ok ? null : r.errores[0].codigo).toBe('VALOR_NO_SERIALIZABLE')
  })

  it('la huella total cambia ante cualquier cambio de celda, regla, roster, contrato, configuración, ausencia o perfil', () => {
    const base = huellasDe(entradas())
    expect(base.ok).toBe(true)
    const total = base.ok ? base.valor.total : ''
    const mutaciones: Array<(e: EntradasHorario) => void> = [
      e => { (e.demanda as number[][])[1][0] = 4 },
      e => { (e.reglas as Array<{ cantidad: number }>)[0].cantidad = 3 },
      e => { (e.roster as Array<{ horas: number }>)[0].horas = 31 },
      e => { (e.contratos as Record<string, { objetivo: number }>).c1.objetivo = 62 },
      e => { (e.configOperativa as Record<string, boolean>).aperturaSoloAux = false },
      e => { e.ausencias = [{ colaboradorId: 'c1', desde: '2026-11-18' }] },
      e => { e.perfilNormativoId = 'horas-2026-07-part31' },
      e => { (e.horario as ReturnType<typeof semana>['horarios'])[0].jornadas[0].turnos[0].inicio = '09:30' },
    ]
    for (const m of mutaciones) {
      const e = entradas(); m(e)
      const h = huellasDe(e)
      expect(h.ok && h.valor.total).not.toBe(total)
    }
    // Mismo contenido con claves reordenadas → misma huella.
    const reordenado = { ...entradas(), configOperativa: { aperturaSoloAux: true } }
    expect(huellasDe(reordenado)).toEqual(base)
  })
})

const h = (v: unknown) => { const r = huellaDe(v); if (!r.ok) throw new Error(JSON.stringify(r.errores)); return r.valor }
const rechazo = (v: unknown) => { const r = huellaDe(v); return r.ok ? null : r.errores[0] }

describe('B1 · huellas: colisiones semánticas', () => {
  it('valores semánticamente distintos nunca comparten huella', () => {
    const casos: unknown[] = [
      undefined, null, 0, '0', false, 'false', true, 'true', 1, '1', '', [], [null], [[]], {}, { a: null },
      [1, 2], [[1, 2]], [2, 1], { a: { b: 1 } }, { 'a.b': 1 }, { a: '"b"' }, { 'a":"b': 1 }, ['a', 'b'], ['ab'],
      '\uD800', '\uFFFD', 'ñ', 'n', ' n', 'N', { a: 1, b: 2 }, { a: 1 }, { b: 2 }, [{}], [{ a: null }],
    ]
    const vistas = new Map<string, unknown>()
    for (const c of casos) {
      const x = h(c)
      expect(vistas.has(x), `colisión entre ${JSON.stringify(vistas.get(x))} y ${JSON.stringify(c)}`).toBe(false)
      vistas.set(x, c)
    }
  })

  it('ausente ≠ nulo ≠ vacío en las entradas de un horario', () => {
    const totales = [undefined, null, []].map(a => { const r = huellasDe({ ...entradas(), ausencias: a }); return r.ok ? r.valor.total : 'error' })
    expect(new Set(totales).size).toBe(3)
    // Mover un valor de una entrada a otra cambia la huella (las partes están nombradas).
    const a = huellasDe({ ...entradas(), demanda: [1], reglas: [] }), b = huellasDe({ ...entradas(), demanda: [], reglas: [1] })
    expect(a.ok && b.ok && a.valor.total !== b.valor.total).toBe(true)
  })

  it('valores semánticamente iguales comparten huella', () => {
    expect(h({ a: 1, b: 2 })).toBe(h({ b: 2, a: 1 }))           // orden de claves
    expect(h({ a: 1, b: undefined })).toBe(h({ a: 1 }))          // propiedad undefined = ausente
    expect(h(-0)).toBe(h(0))
    expect(h('n\u0303andu\u0301')).toBe(h('ñandú'))                // NFD = NFC en valores
    expect(h({ ['n\u0303']: 'Jose\u0301' })).toBe(h({ ['ñ']: 'José' }))  // NFD = NFC en claves y valores
    expect(h(Object.assign(Object.create(null), { a: 1 }))).toBe(h({ a: 1 }))
  })
})

describe('B1 · huellas: tipos no serializables (rechazo explícito con ruta)', () => {
  class Turno { constructor(public inicio = '09:00') {} }
  const conGetter = Object.defineProperty({}, 'x', { get: () => 1, enumerable: true })
  const casos: Array<[string, unknown, RegExp]> = [
    ['Date', { fecha: new Date('2026-11-16') }, /\$\.fecha: objeto no plano \(Date\)/],
    ['Map', new Map([['a', 1]]), /objeto no plano \(Map\)/],
    ['Set', [new Set([1])], /\$\[0\]: objeto no plano \(Set\)/],
    ['RegExp', /x/, /RegExp/],
    ['Uint8Array', new Uint8Array([1]), /Uint8Array/],
    ['instancia de clase', { t: new Turno() }, /Turno/],
    ['primitivo envuelto', new String('a'), /String/],
    ['clave símbolo', { [Symbol('s')]: 1 }, /claves símbolo/],
    ['getter', conGetter, /getter/],
    ['undefined en arreglo', [1, undefined], /\$\[1\]: undefined en un arreglo/],
    ['hueco', [, 1], /\$\[0\]: hueco/], // eslint-disable-line no-sparse-arrays
    ['bigint', { n: BigInt(1) }, /bigint/],
    ['función', { f: () => 1 }, /función/],
    ['Infinity', [Infinity], /no finito/],
    ['NaN', { n: NaN }, /no finito/],
    ['claves que colisionan tras NFC', { ['ñ']: 1, ['n\u0303']: 2 }, /dos claves iguales/],
  ]
  for (const [nombre, valor, motivo] of casos) {
    it(nombre, () => {
      const e = rechazo(valor)
      expect(e?.codigo).toBe('VALOR_NO_SERIALIZABLE')
      expect(String(e?.detalle?.motivo)).toMatch(motivo)
    })
  }
})

describe('B1 · huellas: compatibilidad con Node y con la ida y vuelta por JSON/jsonb', () => {
  const ordenar = (v: unknown): unknown => Array.isArray(v) ? v.map(ordenar)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordenar((v as Record<string, unknown>)[k])])) : v
  const referencia = (v: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(ordenar(v)), 'utf8').digest('hex')}`
  function aleatorio(r: () => number, prof = 0): unknown {
    const t = Math.floor(r() * (prof > 3 ? 4 : 6))
    if (t === 0) return null
    if (t === 1) return r() < 0.5
    if (t === 2) return Math.round((r() - 0.5) * 1e6) / 100
    if (t === 3) return ['', 'a', 'Sucursal 091', 'ñandú', '09:00-15:00', 'línea\nnueva', '"comillas"'][Math.floor(r() * 7)]
    if (t === 4) return Array.from({ length: Math.floor(r() * 4) }, () => aleatorio(r, prof + 1))
    return Object.fromEntries(Array.from({ length: Math.floor(r() * 4) }, (_, i) => [`k${Math.floor(r() * 9)}_${i}`, aleatorio(r, prof + 1)]))
  }

  it('500 valores aleatorios: misma huella que una referencia con node:crypto, y estable tras JSON.parse(JSON.stringify())', () => {
    const r = prng(47)
    for (let i = 0; i < 500; i++) {
      const v = aleatorio(r)
      expect(h(v)).toBe(referencia(v))
      expect(h(JSON.parse(JSON.stringify(v)))).toBe(h(v))
      const c = jsonCanonico(v)
      expect(c.ok && JSON.parse(c.valor)).toEqual(v)       // el canónico es JSON válido y sin pérdidas
    }
  })

  it('el horario de la app (HorarioColaborador) produce la misma huella antes y después de guardarse como jsonb', () => {
    const horarios = semana('2026-11-16').horarios
    expect(h(JSON.parse(JSON.stringify(horarios)))).toBe(h(horarios))
  })
})
