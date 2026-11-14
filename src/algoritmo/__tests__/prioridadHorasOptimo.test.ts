// #7 · AH2-020 — Regresión de la evidencia del benchmark offline (ver benchmark/prioridadHoras.bench.test.ts).
// Escenarios sintéticos válidos: NINGUNA persona infactible y ambas soluciones validables.
import { describe, expect, it } from 'vitest'
import { convertirInputAV2, convertirOutputDeV2 } from '../adapter'
import { ejecutarAlgoritmo } from '../orquestador'
import type { InputAlgoritmo, Jornada, ResultadoSemanal } from '../types'
import { validarResultadoSemana } from '../../utils/validacionSemana'
import { escenarioSintetico, type Escenario } from './fixtures/escenariosSinteticos'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'
import { NECESIDAD_S47 } from './fixtures/aperturaHelpers'

const entrada = (e: Escenario): InputAlgoritmo => convertirInputAV2(e.necesidad, e.cajeros, AUX_S47, EVENTUALES_S47, e.excepciones, { ...OPERATIVA_S47 })
const sinPrioridad = (i: InputAlgoritmo): InputAlgoritmo => ({
  ...i, contratos: Object.fromEntries(Object.entries(i.contratos ?? {}).map(([k, c]) => [k, { ...c, objetivoSlots: null }])),
})
const horasPart = (r: ResultadoSemanal) => Object.values(r.jornadas_part).map(w => w.reduce((n, j) => n + j.bloques.reduce((m, b) => m + b.slot_fin - b.slot_inicio, 0), 0) / 2)
const violaciones = (e: Escenario, r: ResultadoSemanal) => validarResultadoSemana(
  convertirOutputDeV2(r, e.cajeros, AUX_S47, EVENTUALES_S47), e.cajeros, AUX_S47, EVENTUALES_S47,
  { necesidad: e.necesidad, excepciones: e.excepciones, operativa: OPERATIVA_S47 },
).violaciones

describe('AH2-020 · la pérdida de cobertura del motor actual es un óptimo local, no un conflicto horas↔cobertura', () => {
  const e = escenarioSintetico(121)
  const inp = entrada(e)
  const a0 = ejecutarAlgoritmo(sinPrioridad(inp))
  const h1000 = ejecutarAlgoritmo(inp)
  const semillas: Record<string, Jornada[]> = { ...a0.jornadas_full, ...a0.jornadas_part }
  const ms = ejecutarAlgoritmo({ ...inp, semillas })

  it('escenario 121 es concluyente: sin personas infactibles y ambas soluciones validan sin violaciones', () => {
    expect(e.excepciones.every(x => x.descripcion !== 'sintética restrictiva')).toBe(true)
    expect(violaciones(e, a0)).toEqual([])
    expect(violaciones(e, h1000)).toEqual([])
  })

  it('el motor actual cumple las 32 h pero queda bajo el 95 %; sin prioridad de horas se supera el 95 % sin cumplir horas', () => {
    expect(horasPart(h1000).every(h => h === 32)).toBe(true)
    expect(h1000.metricas.cobertura_total_pct).toBeLessThan(95)
    expect(a0.metricas.cobertura_total_pct).toBeGreaterThanOrEqual(95)
    expect(horasPart(a0).some(h => h < 32)).toBe(true) // A0 no es aceptable: reduce horas exigibles
  })

  it('arrancando desde A0 (multi-arranque) se mantienen las 32 h Y se alcanza la cobertura de A0: solución factible encontrada', () => {
    expect(horasPart(ms).every(h => h === 32)).toBe(true)
    expect(ms.metricas.cobertura_total_pct).toBeGreaterThanOrEqual(a0.metricas.cobertura_total_pct - 1e-9)
    expect(ms.metricas.cobertura_total_pct).toBeGreaterThanOrEqual(95)
    expect(violaciones(e, ms)).toEqual([])
  })
})

describe('AH2-020 · magnitud de la penalización por hora faltante', () => {
  const inp = convertirInputAV2(NECESIDAD_S47, CAJEROS_S47, AUX_S47, EVENTUALES_S47, [], { ...OPERATIVA_S47 })
  const firma = (r: ResultadoSemanal) => JSON.stringify([r.jornadas_full, r.jornadas_part, r.metricas.cobertura_total_pct])

  it('10 y 50 dan exactamente el mismo resultado que 1000: la penalización fija no es la causa de la suboptimalidad', () => {
    const h1000 = ejecutarAlgoritmo(inp)
    for (const pen of [10, 50]) expect(firma(ejecutarAlgoritmo({ ...inp, experimental: { penalizacionHoraFaltante: pen } }))).toBe(firma(h1000))
  })

  it('una penalización baja (2) deja de cumplir horas exigibles: no es una alternativa admisible', () => {
    // Escenario 2: sin reglas restrictivas (32 h factibles); con penalización 1000 se cumplen, con 2 no.
    const e = escenarioSintetico(2)
    expect(horasPart(ejecutarAlgoritmo(entrada(e))).every(h => h === 32)).toBe(true)
    const i = entrada(e)
    const h2 = ejecutarAlgoritmo({ ...i, experimental: { penalizacionHoraFaltante: 2 } })
    expect(horasPart(h2).some(h => h < 32)).toBe(true)
  })

  it('sin parámetros experimentales el motor produce lo mismo que antes (comportamiento productivo intacto)', () => {
    expect(firma(ejecutarAlgoritmo({ ...inp, experimental: undefined }))).toBe(firma(ejecutarAlgoritmo(inp)))
  })
})
