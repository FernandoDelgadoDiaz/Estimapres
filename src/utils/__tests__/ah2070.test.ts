// AH2-070 · Domingos parejos como criterio del motor y tope de tramos de caja por día de cada supervisor.
import { describe, expect, it } from 'vitest'
import { domingoFrancoEvitar, rotacionMensual } from '../rotacionMensual'
import { configOperativaDeReglas, MAX_BLOQUES_CAJA_AUX_POR_DEFECTO } from '../preferencias'
import { reemplazoDeReglas } from '../reglasReemplazo'
import { ejecutarPasada2 } from '../../algoritmo/pasada2-auxiliares'
import { balancearIdentidadAux } from '../../algoritmo/ah2040'
import type { ResultadoSemanal } from '../../algoritmo/types'
import type { InputAlgoritmo } from '../../algoritmo/types'
import type { HorarioColaborador, ReglaConfigurable, SemanaHistorial } from '../../types'

const semana = (fechaLunes: string, horarios: HorarioColaborador[]): SemanaHistorial =>
  ({ id: fechaLunes, fechaLunes, version: 1, descripcion: '', generadoEl: `${fechaLunes}T00:00:00Z`, editadoManualmente: false, horarios, resumenPorColaborador: {} })
const j = (dia: number) => ({ dia, turnos: [{ inicio: '09:00', fin: '17:00' }], horas: 8, esFranco: false, rol: 'cajero' as const })
const f = (dia: number) => ({ dia, turnos: [], horas: 0, esFranco: true, rol: 'franco' as const })
const fila = (id: string, franco: number): HorarioColaborador => ({ colaboradorId: id, rolGeneral: 'cajero', errores: [], totalHoras: 48,
  jornadas: Array.from({ length: 7 }, (_, d) => d === franco ? f(d) : j(d)) })
const cajeros = ['a', 'b', 'c', 'd'].map(id => ({ id, nombre: id.toUpperCase() }))

describe('AH2-070 · domingos parejos', () => {
  it('caso 091: Rosa (16/11) y Claudia (23/11) ya tuvieron domingo; para el 30/11 ninguna de las dos repite', () => {
    const hist = [semana('2026-11-16', [fila('a', 6), fila('b', 1), fila('c', 2), fila('d', 3)]), semana('2026-11-23', [fila('a', 1), fila('b', 6), fila('c', 2), fila('d', 3)])]
    expect(domingoFrancoEvitar(hist, '2026-11-30', { cajeros })).toEqual(['A', 'B'])
    const r = rotacionMensual(hist, '2026-11-30', { cajeros })
    expect(r.evitarDomingo).toEqual(['A', 'B'])
    expect(r.sesgos.B.porDia?.[6]?.franco).toBeLessThanOrEqual(-8)
    expect(r.explicacion.frases.join(' ')).toContain('no repiten franco A, B')
  })
  it('quien tuvo franco el domingo pasado no repite aunque los conteos estén empatados', () => {
    const hist = [semana('2026-11-23', [fila('a', 6), fila('b', 1), fila('c', 2), fila('d', 3)])]
    expect(domingoFrancoEvitar(hist, '2026-11-30', { cajeros })).toEqual(['A'])
  })
  it('sin historia no fuerza nada; si quedarían todos, tampoco', () => {
    expect(domingoFrancoEvitar([], '2026-11-30', { cajeros })).toEqual([])
    const todos = [semana('2026-11-23', cajeros.map(c => fila(c.id, 6)))]
    expect(domingoFrancoEvitar(todos, '2026-11-30', { cajeros })).toEqual([])
  })
})

const regla = (x: Partial<ReglaConfigurable>): ReglaConfigurable => ({ id: Math.random().toString(36).slice(2), ambito: 'local', tipo: 'max_bloques_caja_aux_dia', activa: true, descripcion: '', creadaEl: '2026-11-27T00:00:00Z', ...x } as ReglaConfigurable)

describe('AH2-070 · tramos de caja por día de cada supervisor', () => {
  it('sin regla rige 2; con regla, su valor; «sin límite» lo quita', () => {
    expect(configOperativaDeReglas([], '2026-11-30').maxBloquesCajaAuxDia).toBe(MAX_BLOQUES_CAJA_AUX_POR_DEFECTO)
    expect(configOperativaDeReglas([regla({ cantidad: 3 })], '2026-11-30').maxBloquesCajaAuxDia).toBe(3)
    expect(configOperativaDeReglas([regla({ activa: false })], '2026-11-30').maxBloquesCajaAuxDia).toBeUndefined()
  })
  it('la regla nueva pisa a la anterior (AH2-068)', () => {
    const vieja = regla({ cantidad: 3 })
    expect(reemplazoDeReglas([vieja], { ambito: 'local', tipo: 'max_bloques_caja_aux_dia', cantidad: 2, descripcion: '' }, '2026-11-27').borrar).toEqual([vieja])
  })
  it('motor A: un supervisor no abre más tramos que el tope; otro cubre o queda faltante', () => {
    // Dos AUX presentes 08–16; demanda de apoyo en 3 franjas separadas.
    const dem = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => (s < 2 || [4, 8, 12].includes(s) ? 1 : 0)))
    const pres = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => (s < 16 ? 'PARADO' : 'NO_PRESENTE')))
    const input = { demanda: dem, colaboradores: [{ id: 'x', nombre: 'X', rol: 'AUX' }, { id: 'y', nombre: 'Y', rol: 'AUX' }],
      presencia_aux: { x: structuredClone(pres), y: structuredClone(pres) }, disponibilidad_eventual: {}, max_bloques_caja_aux_dia: 1 } as unknown as InputAlgoritmo
    const p1 = { jornadas_full: {}, jornadas_part: {}, cobertura_1: dem.map(r => r.map(() => 0)), deficit_1: dem.map(r => [...r]), violaciones: [], infactibles: [] }
    const r = ejecutarPasada2(input, p1 as never)
    for (const id of ['x', 'y']) for (const fila of r.asignacion_aux[id]) {
      expect(fila.filter((v, s) => v === 'CAJA' && fila[s - 1] !== 'CAJA').length).toBeLessThanOrEqual(1)
    }
  })
})

describe('AH2-070 · auditoría 2: tope de tramos sin falsos bloqueos ni excesos', () => {
  const tramosDe = (fila: string[]) => fila.filter((v, s) => v === 'CAJA' && fila[s - 1] !== 'CAJA').length
  it('pasada 2: dos tramos sueltos que luego se unen no bloquean un tramo nuevo', () => {
    // y (más presencia) es el designado; x es el único que se sienta. Orden por déficit: 10, 12 (2 c/u), 5, 11.
    const dem = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => ([10, 12].includes(s) ? 2 : [5, 11].includes(s) ? 1 : 0)))
    const px = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => (s >= 2 && s <= 20 ? 'PARADO' : 'NO_PRESENTE')))
    const py = Array.from({ length: 7 }, () => Array.from({ length: 30 }, () => 'PARADO'))
    const input = { demanda: dem, colaboradores: [{ id: 'x', nombre: 'X', rol: 'AUX' }, { id: 'y', nombre: 'Y', rol: 'AUX' }],
      presencia_aux: { x: px, y: py }, disponibilidad_eventual: {}, supervisor_jornada_completa: true, max_bloques_caja_aux_dia: 2 } as unknown as InputAlgoritmo
    const p1 = { jornadas_full: {}, jornadas_part: {}, cobertura_1: dem.map(r => r.map(() => 0)), deficit_1: dem.map(r => [...r]), violaciones: [], infactibles: [] }
    const r = ejecutarPasada2(input, p1 as never)
    const fila = r.asignacion_aux.x[0]
    expect([5, 10, 11, 12].every(s => fila[s] === 'CAJA')).toBe(true)
    expect(tramosDe(fila)).toBe(2)
  })
  it('equilibrio AH2-040: el intercambio de identidad no deja a un AUX por encima del tope', () => {
    const dem = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => ([4, 8].includes(s) ? 1 : 0)))
    const pres = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => (s >= 2 && s <= 20 ? 'PARADO' : 'NO_PRESENTE')))
    const input = { demanda: dem, colaboradores: [], presencia_aux: { x: structuredClone(pres), y: structuredClone(pres) }, disponibilidad_eventual: {}, max_bloques_caja_aux_dia: 1 } as unknown as InputAlgoritmo
    const aux: Record<string, string[][]> = { x: structuredClone(pres), y: structuredClone(pres) }
    for (const d of [0, 1, 2, 3, 4, 5, 6]) { aux.x[d][4] = 'CAJA'; aux.y[d][8] = 'CAJA' }
    const r = { jornadas_full: {}, jornadas_part: {}, asignacion_aux: aux, asignacion_eventual: {} } as unknown as ResultadoSemanal
    // x es el único comparable: sin tope recibiría los dos tramos; con tope 1, el segundo queda en y.
    const b = balancearIdentidadAux(input, r, new Set(['x']))
    for (const id of ['x', 'y']) for (const f of b.asignacion_aux[id]) expect(tramosDe(f)).toBeLessThanOrEqual(1)
    expect(b.asignacion_aux.x[0][4]).toBe('CAJA')
    expect(b.asignacion_aux.y[0][8]).toBe('CAJA')
  })
})
