import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { huellaDe, huellasDe, jsonCanonico, sha256Hex, type EntradasHorario } from '../huellas'
import { semana } from './fixtures'

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
