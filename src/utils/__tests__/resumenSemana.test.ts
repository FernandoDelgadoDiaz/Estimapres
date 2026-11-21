import { describe, expect, it } from 'vitest'
import { HORAS_FRANJAS, type SemanaHistorial } from '../../types'
import { fechaCorta, necesidadDeSemana, proximoLunes, rangoSemana, resumirCobertura, semanasParaConsultar } from '../resumenSemana'

const grid = (v = 0) => HORAS_FRANJAS.map(() => Array(7).fill(v))
const fi = (h: string) => HORAS_FRANJAS.indexOf(h)

describe('resumen de la semana para el supervisor', () => {
  it('calcula cobertura, horas sin cubrir y agrupa los faltantes en tramos, del más grave al más leve', () => {
    const nec = grid(), cob = grid()
    nec[fi('09:00')][2] = 2; nec[fi('09:30')][2] = 2; cob[fi('09:00')][2] = 1; cob[fi('09:30')][2] = 1 // Mié 09:00–10:00, falta 1
    nec[fi('21:00')][6] = 5; cob[fi('21:00')][6] = 1 // Dom 21:00–21:30, faltan 4
    nec[fi('12:00')][0] = 3; cob[fi('12:00')][0] = 4 // sobra: no cuenta como cubierto de más
    const r = resumirCobertura(nec, cob)
    expect(r.horasNecesarias).toBe(6)
    expect(r.horasSinCubrir).toBe(3)
    expect(r.coberturaPct).toBeCloseTo(50)
    expect(r.faltantes).toEqual([
      { dia: 6, diaNombre: 'Dom', desde: '21:00', hasta: '21:30', cajas: 4, horas: 2 },
      { dia: 2, diaNombre: 'Mié', desde: '09:00', hasta: '10:00', cajas: 1, horas: 1 },
    ])
  })
  it('sin necesidad la cobertura es 100 % y no hay faltantes', () => {
    expect(resumirCobertura(grid(), grid())).toMatchObject({ coberturaPct: 100, horasSinCubrir: 0, faltantes: [] })
  })
  it('elige la última versión de cada semana, la más reciente primero, y reconstruye la necesidad de semanas viejas', () => {
    const s = (fechaLunes: string, version: number, extra: Partial<SemanaHistorial> = {}) =>
      ({ id: `${fechaLunes}-${version}`, fechaLunes, version, generadoEl: `2026-11-0${version}T00:00:00Z`, horarios: [], descripcion: '', resumenPorColaborador: {}, editadoManualmente: false, ...extra }) as SemanaHistorial
    expect(semanasParaConsultar([s('2026-11-16', 1), s('2026-11-23', 1), s('2026-11-23', 2)]).map(x => x.id)).toEqual(['2026-11-23-2', '2026-11-16-1'])
    const vieja = s('2026-11-09', 1, { coberturaFranjas: grid(1), faltantesFranjas: grid(1) })
    expect(necesidadDeSemana(vieja)).toMatchObject({ aproximada: true })
    expect(necesidadDeSemana(vieja)!.necesidad[0][0]).toBe(2)
    expect(necesidadDeSemana(s('2026-11-02', 1))).toBeNull()
  })
  it('fechas en lenguaje del supervisor', () => {
    expect(fechaCorta('2026-11-23')).toBe('23/11')
    expect(rangoSemana('2026-11-30')).toBe('Semana del 30/11 al 06/12')
    expect(proximoLunes(new Date(2026, 10, 21))).toBe('2026-11-23') // sábado → lunes siguiente
    expect(proximoLunes(new Date(2026, 10, 23))).toBe('2026-11-30') // lunes → el próximo
  })
})
