import { describe, expect, it } from 'vitest'
import { validarEdicionManual } from '../preferencias'
import type { JornadaResumida } from '../../types'

const libre = (): JornadaResumida[] => Array.from({ length: 7 }, () => ({ esFranco: true, turnos: [] }))
const dos = { esFranco: false, turnos: [{ inicio: '09:00', fin: '09:30' }, { inicio: '10:00', fin: '11:00' }] }

describe('edición manual en la tabla', () => {
  it('EVENTUAL: dos intervalos de caja el mismo día no son una jornada cortada', () => {
    expect(validarEdicionManual(dos, libre(), 2, 'EVENTUAL')).toEqual([])
    const tres = { esFranco: false, turnos: [...dos.turnos, { inicio: '19:00', fin: '20:00' }] }
    expect(validarEdicionManual(tres, libre(), 2, 'EVENTUAL').filter(a => a.severidad === 'error')).toEqual([])
  })
  it('EVENTUAL: no se le exige el descanso de 12 h de los cajeros, pero sí el horario de operación', () => {
    const semana = libre(); semana[1] = { esFranco: false, turnos: [{ inicio: '21:30', fin: '22:00' }] }
    expect(validarEdicionManual({ esFranco: false, turnos: [{ inicio: '08:00', fin: '09:00' }] }, semana, 2, 'EVENTUAL')).toEqual([])
    expect(validarEdicionManual({ esFranco: false, turnos: [{ inicio: '07:00', fin: '09:00' }] }, libre(), 2, 'EVENTUAL').some(a => a.severidad === 'error')).toBe(true)
  })
  it('FULL: la cortada sigue exigiendo 4 h entre bloques y el descanso de 12 h', () => {
    expect(validarEdicionManual(dos, libre(), 2, 'FULL').some(a => a.mensaje.includes('H-F7'))).toBe(true)
    const semana = libre(); semana[1] = { esFranco: false, turnos: [{ inicio: '14:00', fin: '22:00' }] }
    expect(validarEdicionManual({ esFranco: false, turnos: [{ inicio: '09:00', fin: '17:00' }] }, semana, 2, 'FULL').some(a => a.mensaje.includes('H-D1'))).toBe(true)
  })
})
