// AH2-064 · Las preferencias sumadas nunca salen del rango que acepta el motor CP-SAT (−12…+12).
import { describe, expect, it } from 'vitest'
import { convertirInputAV2, limitarPreferencia } from '../adapter'
import { combinarSesgos } from '../../utils/preferencias'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47 } from './fixtures/semana47Anonimizada'
import { NECESIDAD_S47 } from './fixtures/aperturaHelpers'

describe('AH2-064 · límite de preferencias', () => {
  it('rotación + domingos + aprendizaje sumados quedan dentro de ±12', () => {
    const nombre = CAJEROS_S47[0].nombre
    const sumadas = combinarSesgos(
      { [nombre]: { manana: -6, porDia: { 0: { manana: 5 }, 6: { franco: 8 } } } },
      { [nombre]: { manana: -9, porDia: { 0: { manana: 9 }, 6: { franco: 7 } } } },
    )
    const input = convertirInputAV2(NECESIDAD_S47, CAJEROS_S47, AUX_S47, EVENTUALES_S47, [], { preferenciasPorNombre: sumadas })
    const p = Object.values(input.preferencias_turno ?? {})[0]
    const valores = [p.manana, p.tarde, p.cierre, ...Object.values(p.porDia ?? {}).flatMap(d => Object.values(d))].filter(v => v !== undefined) as number[]
    expect(valores.length).toBeGreaterThan(0)
    for (const v of valores) expect(Math.abs(v)).toBeLessThanOrEqual(12)
    expect(p.manana).toBe(-12)
    expect(p.porDia![6].franco).toBe(12)
  })
  it('descarta claves que el motor CP-SAT no entiende y los ceros', () => {
    expect(limitarPreferencia({ manana: 0, porDia: { 2: { franco: 3, trabajo: 4, patron: [] } as never } })).toEqual({ porDia: { 2: { franco: 3 } } })
  })
})
