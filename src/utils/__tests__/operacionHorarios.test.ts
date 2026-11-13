import { describe, expect, it } from 'vitest'
import { interpretarHorario, mostrarHorario, opcionesHorarioMotor } from '../timeUtils'
import { minutosAsignados, resumenHoras } from '../horasSemanales'
import { validarHorasAsignadas } from '../validacionSemana'
import type { HorarioColaborador } from '../../types'

describe('intervalos de entrada', () => {
  it.each(['12 a 22','12 horas a 22 horas','12hs a 22hs','12:00 - 22:00hs','12:00 a 22:00','12-22','12.00 a 22.00',' 12 H. A 22 HRS. '])('normaliza %s', entrada => {
    const resultado = interpretarHorario(entrada, opcionesHorarioMotor)
    expect(resultado).toMatchObject({ ok: true, normalizado: '12:00-22:00' })
    expect(mostrarHorario('12:00-22:00')).toBe('12:00 - 22:00')
  })
  it('conserva turnos partidos y minutos válidos', () => {
    expect(interpretarHorario('8.15 a 11:55 Y 17:10–22:00')).toMatchObject({
      ok: true, normalizado: '08:15-11:55|17:10-22:00',
    })
    expect(interpretarHorario('22 a 02', { permiteMedianoche: true }).ok).toBe(true)
  })
  it.each(['22 a 12','12 a','12 a 24','12:60 a 22','12:15 a 22','12 a 12','12-22|','10 a 14 y 13 a 16','18 a 21 y 8 a 12'])('rechaza %s en la grilla de medias horas', entrada => {
    expect(interpretarHorario(entrada, opcionesHorarioMotor)).toMatchObject({ ok: false, error: expect.any(String) })
  })
})

describe('control de horas semanales', () => {
  it('suma bloques, excluye francos y excluye la pausa entre bloques', () => {
    const turnos = [{ inicio: '08:00', fin: '12:00' }, { inicio: '16:00', fin: '19:30' }]
    expect(minutosAsignados([{ turnos, esFranco: false }, { turnos, esFranco: true }])).toBe(450)
    expect(resumenHoras(1500, 'PART', 30).diferencia).toBe(-300)
    expect(resumenHoras(3000, 'FULL', 48)).toMatchObject({ exceso: true, diferencia: 120 })
  })
  it('distingue máximo configurado de aviso preventivo de eventual', () => {
    const horario: HorarioColaborador = {
      colaboradorId: 'e1', rolGeneral: 'eventual_sector', errores: [], totalHoras: 0,
      jornadas: Array.from({ length: 7 }, (_, dia) => ({
        dia, turnos: [{ inicio: '08:00', fin: '16:00' }], horas: 8, rol: 'eventual_sector', esFranco: false,
      })),
    }
    const eventual = { id: 'e1', nombre: 'Persona de prueba', sector: 'Prueba', horarioSemanal: [], activo: true }
    expect(validarHorasAsignadas([horario], [], [eventual])).toMatchObject({
      violaciones: [], advertencias: [expect.stringContaining('Supera 48 h')],
    })
    expect(validarHorasAsignadas([horario], [], [{ ...eventual, maxHorasSemanales: 50 }]).violaciones).toMatchObject([
      { codigo: 'OP_HORAS_FICHA', detalle: expect.stringContaining('56 h') },
    ])
  })
})
