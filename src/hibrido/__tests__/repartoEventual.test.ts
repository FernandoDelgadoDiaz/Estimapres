import { describe, expect, it } from 'vitest'
import { costeRepartoEventual, repartirEventuales } from '../repartoEventual'
import type { InputAlgoritmo, ResultadoSemanal, AsignacionEv } from '../../algoritmo/types'

// Franja 12 = 14:00. Dos eventuales disponibles 14:00–23:00 todos los días.
const disp = () => Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => (s >= 12 ? 'NO_USADO' : 'NO_DISPONIBLE') as AsignacionEv))
const conCaja = (porDia: Record<number, [number, number][]>) => {
  const m = disp()
  for (const [d, tramos] of Object.entries(porDia)) for (const [a, b] of tramos) for (let s = a; s < b; s++) m[Number(d)][s] = 'CAJA'
  return m
}
const input = { disponibilidad_eventual: { azu: disp(), mon: disp() }, max_bloques_caja_eventual_dia: 3 } as unknown as InputAlgoritmo
const porSlot = (r: ResultadoSemanal) => Array.from({ length: 7 }, (_, d) => Array.from({ length: 30 }, (_, s) =>
  Object.values(r.asignacion_eventual).filter(m => m[d][s] === 'CAJA').length))
const horasDia = (m: AsignacionEv[][]) => m.map(row => row.filter(v => v === 'CAJA').length / 2)

describe('AH2-054: reparto parejo de horas de caja de eventuales', () => {
  it('un lunes sobrecargado se reparte con otro eventual sin cambiar cobertura ni totales', () => {
    // Azucena: lunes 14:00–18:30 y 19:00–21:00 (6,5 h) + martes 1 h. Mónica: lunes 1 h + martes a sábado 1,5 h.
    const r = {
      asignacion_eventual: {
        azu: conCaja({ 0: [[12, 21], [22, 26]], 1: [[16, 18]] }),
        mon: conCaja({ 0: [[22, 24]], 1: [[12, 15]], 2: [[12, 15]], 3: [[12, 15]], 4: [[12, 15]], 5: [[12, 15]] }),
      },
    } as unknown as ResultadoSemanal
    const out = repartirEventuales(input, r)
    expect(porSlot(out)).toEqual(porSlot(r))                                   // misma cobertura franja a franja
    for (const id of ['azu', 'mon']) expect(horasDia(out.asignacion_eventual[id]).reduce((a, b) => a + b)).toBe(horasDia(r.asignacion_eventual[id]).reduce((a, b) => a + b))
    expect(Math.max(...horasDia(out.asignacion_eventual.azu))).toBeLessThan(6.5)
    expect(costeRepartoEventual(out)).toBeLessThan(costeRepartoEventual(r))
    for (const id of ['azu', 'mon']) for (const row of out.asignacion_eventual[id]) {
      expect(row.reduce((n, v, s) => n + (v === 'CAJA' && row[s - 1] !== 'CAJA' ? 1 : 0), 0)).toBeLessThanOrEqual(3)
    }
  })
  it('no asigna caja fuera de la disponibilidad ni después de la hora límite', () => {
    const soloLunes = disp().map((row, d) => row.map(v => (d === 0 ? v : 'NO_DISPONIBLE' as AsignacionEv)))
    const r = { asignacion_eventual: { azu: conCaja({ 0: [[12, 20]], 1: [[12, 14]] }), mon: conCaja({ 0: [[20, 22]] }) } } as unknown as ResultadoSemanal
    const out = repartirEventuales({ ...input, disponibilidad_eventual: { azu: disp(), mon: soloLunes }, eventuales_caja_hora_limite: '21:00' } as InputAlgoritmo, r)
    for (let d = 1; d < 7; d++) expect(out.asignacion_eventual.mon[d].every(v => v !== 'CAJA')).toBe(true)
    expect(out.asignacion_eventual.azu.every(row => row.slice(26).every(v => v !== 'CAJA'))).toBe(true)
  })
})
