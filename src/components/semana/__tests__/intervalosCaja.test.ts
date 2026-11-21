import { describe, expect, it } from 'vitest'
import { intervalosCaja } from '../TablaHorarios'

describe('AH2-048: horas en caja del supervisor en la tabla', () => {
  it('agrupa las franjas de media hora en intervalos', () => {
    const s = Array(30).fill(false)
    s[2] = s[3] = true; s[20] = true; s[28] = s[29] = true
    expect(intervalosCaja(s)).toEqual([{ inicio: '9:00', fin: '10:00' }, { inicio: '18:00', fin: '18:30' }, { inicio: '22:00', fin: '23:00' }])
    expect(intervalosCaja(Array(30).fill(false))).toEqual([])
    expect(intervalosCaja(undefined)).toEqual([])
  })
})
