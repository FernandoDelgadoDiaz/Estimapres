import { describe, expect, it } from 'vitest'
import { capacidadSemana } from '../capacidadSemana'

const nec = (v = 1) => Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => (s >= 2 && s < 28 ? v : 0)))

describe('AH2-050: horas de caja disponibles por grupo', () => {
  it('suma cajeros, eventuales (con tope) y supervisores solo con otro de pie', () => {
    const r = capacidadSemana({
      necesidad: nec(2), horasCajeros: 320,
      eventuales: [{ horarioSemanal: Array(7).fill('14:00-23:00'), topeHoras: 6 }, { horarioSemanal: ['', '09:00-10:00', '', '', '', '', ''] }],
      auxiliares: [{ horarioSemanal: Array(7).fill('08:00-16:00') }, { horarioSemanal: Array(7).fill('14:00-23:00') }],
      franjasAuxSolo: [{ dia: 0, desde: '08:00', hasta: '09:00' }],
    })
    expect(r.cajeros).toBe(320)
    expect(r.eventuales).toBe(6 + 1) // tope de ficha 6 h + 1 h de presencia del segundo
    expect(r.supervisores).toBe(7 * 2) // se superponen 14–16 cada día (2 h); 08–09 del lunes no tiene necesidad
    expect(r.total).toBe(320 + 7 + 14)
  })
  it('un supervisor solo cubre caja únicamente en las franjas autorizadas con necesidad', () => {
    const n = nec(1); n[0][0] = 1; n[0][1] = 1
    const r = capacidadSemana({ necesidad: n, horasCajeros: 0, eventuales: [], auxiliares: [{ horarioSemanal: Array(7).fill('08:00-16:00') }], franjasAuxSolo: [{ dia: 0, desde: '08:00', hasta: '09:00' }] })
    expect(r.supervisores).toBe(1)
  })
})
