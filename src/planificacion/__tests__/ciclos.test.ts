import { describe, expect, it } from 'vitest'
import { cicloDe, esPrimeraSemanaDelCiclo, semanasDe, semanasDelCiclo, validarCalendario } from '../ciclos'
import { diaSemana, esFechaValida, fechasEntre, sumarDias } from '../fechas'
import { ciclo } from './fixtures'

const codigos = (r: ReturnType<typeof validarCalendario>) => (r.ok ? [] : r.errores.map(e => e.codigo))

describe('B1 · fechas calendario', () => {
  it('lunes = 0 … domingo = 6; fechas inválidas rechazadas; años bisiestos', () => {
    expect(diaSemana('2026-11-16')).toBe(0)
    expect(diaSemana('2026-11-22')).toBe(6)
    expect(esFechaValida('2026-02-29')).toBe(false)
    expect(esFechaValida('2028-02-29')).toBe(true)
    expect(esFechaValida('2026-13-01')).toBe(false)
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04')
    expect(fechasEntre('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
  })
})

describe('B1 · ciclos de 1, 4 y 5 semanas (lunes a domingo)', () => {
  it('semanal de 1 semana, mensual de 4 y de 5: válidos, con sus lunes', () => {
    const sem = ciclo('s', '2026-11-16', '2026-11-22', 'semanal')
    const m4 = ciclo('m4', '2026-11-23', '2026-12-20')
    const m5 = ciclo('m5', '2026-12-21', '2027-01-24')
    expect(validarCalendario([sem, m4, m5]).ok).toBe(true)
    expect(semanasDe(sem)).toBe(1)
    expect(semanasDelCiclo(m4)).toEqual(['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'])
    expect(semanasDelCiclo(m5)).toHaveLength(5)
  })

  it('rechaza inicio que no es lunes, fin que no es domingo y duraciones no permitidas', () => {
    expect(codigos(validarCalendario([ciclo('a', '2026-11-17', '2026-11-22', 'semanal')]))).toContain('INICIO_NO_LUNES')
    expect(codigos(validarCalendario([ciclo('a', '2026-11-16', '2026-11-21', 'semanal')]))).toContain('FIN_NO_DOMINGO')
    expect(codigos(validarCalendario([ciclo('a', '2026-11-16', '2026-11-29', 'semanal')]))).toEqual(['DURACION_INVALIDA'])
    expect(codigos(validarCalendario([ciclo('a', '2026-11-16', '2026-12-06')]))).toEqual(['DURACION_INVALIDA']) // mensual de 3
    expect(codigos(validarCalendario([ciclo('a', '2026-11-16', '2026-12-27')]))).toEqual(['DURACION_INVALIDA']) // mensual de 6
    expect(codigos(validarCalendario([ciclo('a', '2026-11-30', '2026-11-29', 'semanal')]))).toContain('CICLO_INVERTIDO')
    expect(codigos(validarCalendario([ciclo('a', '2026-02-30', '2026-03-01', 'semanal')]))).toEqual(['FECHA_INVALIDA'])
  })

  it('rechaza superposiciones, huecos, ids duplicados y sucursales mezcladas (todos los errores)', () => {
    const a = ciclo('a', '2026-11-02', '2026-11-29')
    expect(codigos(validarCalendario([a, ciclo('b', '2026-11-23', '2026-12-20')]))).toEqual(['SUPERPOSICION_CICLOS'])
    expect(codigos(validarCalendario([a, ciclo('b', '2026-12-07', '2027-01-03')]))).toEqual(['HUECO_ENTRE_CICLOS'])
    expect(codigos(validarCalendario([a, { ...a }]))).toContain('ID_DUPLICADO')
    expect(codigos(validarCalendario([a, { ...ciclo('b', '2026-11-30', '2026-12-27'), sucursalId: 'otra' }]))).toContain('SUCURSAL_DISTINTA')
  })

  it('cambio de mes SIN ciclo nuevo no es primera semana (#44 (e)); con ciclo declarado, sí (#44 (b))', () => {
    // Ciclo mensual de 5 semanas que contiene la semana 30/11–06/12 (cruza el 1 de diciembre).
    const nov = ciclo('nov', '2026-11-02', '2026-12-06')
    const dic = ciclo('dic', '2026-12-07', '2027-01-03')
    expect(validarCalendario([nov, dic]).ok).toBe(true)
    expect(esPrimeraSemanaDelCiclo([nov, dic], '2026-11-30')).toEqual({ ok: true, valor: false })
    expect(esPrimeraSemanaDelCiclo([nov, dic], '2026-12-07')).toEqual({ ok: true, valor: true })
    expect(esPrimeraSemanaDelCiclo([nov, dic], '2026-11-02')).toEqual({ ok: true, valor: true })
    // Si la sucursal declara el ciclo nuevo justo en la semana que cruza el mes, esa es la primera.
    const nov4 = ciclo('nov4', '2026-11-02', '2026-11-29'), dic5 = ciclo('dic5', '2026-11-30', '2027-01-03')
    expect(esPrimeraSemanaDelCiclo([nov4, dic5], '2026-11-30')).toEqual({ ok: true, valor: true })
    expect(cicloDe([nov4, dic5], '2026-12-01')?.id).toBe('dic5')
  })

  it('esPrimeraSemanaDelCiclo exige un lunes; sin ciclo devuelve false', () => {
    const r = esPrimeraSemanaDelCiclo([], '2026-11-18')
    expect(r.ok ? null : r.errores[0].codigo).toBe('INICIO_NO_LUNES')
    expect(esPrimeraSemanaDelCiclo([], '2026-11-16')).toEqual({ ok: true, valor: false })
  })
})
