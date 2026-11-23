// AH2-059 · La barra avanza con el tiempo y los pasos, y nunca marca 100 % antes de terminar.
import { describe, expect, it } from 'vitest'
import { porcentajeAvance } from '../ProgresoGeneracion'

describe('AH2-059 · barra de progreso de la generación', () => {
  const a = { paso: 2, inicio: 0, esperadoMs: 140_000 }
  it('avanza con el tiempo transcurrido', () => {
    expect(porcentajeAvance(a, 14_000)).toBeLessThan(porcentajeAvance(a, 70_000))
    expect(porcentajeAvance(a, 70_000)).toBe(48)
  })
  it('no llega a 100 % aunque tarde más de lo esperado', () => {
    expect(porcentajeAvance(a, 600_000)).toBeLessThanOrEqual(91)
  })
  it('cada paso tiene un mínimo y validar salta casi al final', () => {
    expect(porcentajeAvance({ ...a, paso: 1 }, 0)).toBe(8)
    expect(porcentajeAvance({ ...a, paso: 3 }, 1_000)).toBe(97)
  })
})
