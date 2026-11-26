import { describe, expect, it } from 'vitest'
import { francosFijosPorDia, necesidadPorDia, supervisoresDeFrancoPorDia, topesFrancosPorDia } from '../topesFrancos'

// Forma de la semana del 30/11 en una sucursal de 9 cajeros + 2 supervisores (datos sintéticos).
// Días más tranquilos: lunes, martes, miércoles y domingo. Supervisores de franco: miércoles, jueves y domingo.
// Un cajero tiene franco fijo el jueves.
const base = {
  necesidadPorDia: [60, 62, 64, 70, 80, 90, 50],
  cajeros: 9,
  supervisores: 2,
  supervisoresDeFranco: [0, 0, 1, 1, 0, 0, 1],
  francosFijosCajeros: [0, 0, 0, 1, 0, 0, 0],
}

describe('AH2-066 · topes de francos por día', () => {
  it('sin máximo configurado: dotación / 7 con el franco extra en los días de menos necesidad', () => {
    const t = topesFrancosPorDia(base)
    expect(t.origen).toBe('calculado')
    // 11 personas → 2 en los 4 días más tranquilos y 1 en el resto; el jueves sube a 2 por el franco fijo + supervisor.
    expect(t.personasPorDia).toEqual([2, 2, 2, 2, 1, 1, 2])
    // Para los cajeros se descuentan los supervisores de franco ese día.
    expect(t.cajerosPorDia).toEqual([2, 2, 1, 1, 1, 1, 1])
    expect(t.cajerosPorDia.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(base.cajeros)
  })

  it('con máximo configurado: es el tope de personas por día, supervisores incluidos', () => {
    const t = topesFrancosPorDia({ ...base, maximoConfigurado: 2 })
    expect(t.origen).toBe('configurado')
    expect(t.personasPorDia).toEqual([2, 2, 2, 2, 2, 2, 2])
    expect(t.cajerosPorDia).toEqual([2, 2, 1, 1, 2, 2, 1])
  })

  it('los francos fijos siempre entran aunque superen el tope', () => {
    const t = topesFrancosPorDia({ ...base, maximoConfigurado: 1, francosFijosCajeros: [0, 0, 0, 2, 0, 0, 0] })
    expect(t.personasPorDia[3]).toBe(3)
    expect(t.cajerosPorDia[3]).toBe(2)
  })

  it('si los topes no alcanzan para el franco de cada cajero, se abre lugar en los días de menos necesidad', () => {
    const t = topesFrancosPorDia({ ...base, maximoConfigurado: 1, supervisoresDeFranco: [1, 1, 1, 1, 1, 1, 1] })
    expect(t.cajerosPorDia.reduce((a, b) => a + b, 0)).toBe(9)
    // El primero en recibir lugar es el domingo (el de menos necesidad).
    expect(t.cajerosPorDia[6]).toBeGreaterThanOrEqual(t.cajerosPorDia[5])
  })

  it('ayudantes: necesidad por día, supervisores de franco y francos fijos sin duplicar', () => {
    expect(necesidadPorDia([{ necesidad: [2, 0, 0, 0, 0, 0, 4] }, { necesidad: [2, 0, 0, 0, 0, 0, 0] }])).toEqual([2, 0, 0, 0, 0, 0, 2])
    expect(supervisoresDeFrancoPorDia([{ horarioSemanal: ['08:00-16:00', '', ' ', 'x', 'x', 'x', 'x'] }])).toEqual([0, 1, 1, 0, 0, 0, 0])
    expect(francosFijosPorDia([
      { tipo: 'franco_dia', valor: '3', colaboradorNombre: 'Ana' },
      { tipo: 'franco_dia', valor: '3', colaboradorNombre: 'Ana' },
      { tipo: 'franco_dia', valor: '3', colaboradorNombre: 'Supervisor' },
      { tipo: 'no_antes_de', valor: '10:00', colaboradorNombre: 'Ana' },
    ], ['Ana', 'Beto'])).toEqual([0, 0, 0, 1, 0, 0, 0])
  })
})
