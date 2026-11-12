// AUX-01: patrón habitual + excepciones por fecha y diagnóstico de supervisión.
import { describe, expect, it } from 'vitest'
import { diagnosticarSupervision, horarioValido, prepararDisponibilidadSemana, resolverDisponibilidadSemana, type ExcepcionDisponibilidad } from '../disponibilidadHabitual'
import { convertirInputAV2, convertirOutputDeV2 } from '../../algoritmo/adapter'
import { ejecutarAlgoritmo } from '../../algoritmo/orquestador'
import { HORAS_FRANJAS, type Auxiliar, type Eventual } from '../../types'

const LUNES = '2026-11-16'
const aux = (id: string, dias: string[]): Auxiliar => ({ id, nombre: `Aux ${id}`, horarioSemanal: dias, activo: true })
const AUX_A = aux('a', Array(7).fill('08:00-16:00'))
const AUX_B = aux('b', Array(7).fill('14:00-22:30'))
const ev: Eventual = { id: 'e', nombre: 'Eventual A', sector: 'X', horarioSemanal: ['', '', '', '', '17:00-21:00', '10:00-14:00', ''], activo: true }
const x = (o: Partial<ExcepcionDisponibilidad>): ExcepcionDisponibilidad => ({
  colaboradorId: 'a', fecha: '2026-11-18', horario: '', motivo: 'licencia', autor: 'supervisor', creadaEn: '2026-11-12T10:00:00Z', ...o,
})

describe('AUX-01: patrón habitual + excepciones por fecha', () => {
  it('sin excepciones, la semana es el patrón habitual (compatibilidad total)', () => {
    const r = resolverDisponibilidadSemana([AUX_A, AUX_B], [], LUNES)
    expect(r.personas.map(p => p.horarioSemanal)).toEqual([AUX_A.horarioSemanal, AUX_B.horarioSemanal])
    expect(r.errores).toEqual([])
    expect(r.origen.a.every(o => o === 'habitual')).toBe(true)
  })

  it('una excepción reemplaza solo su fecha y queda marcada', () => {
    const r = resolverDisponibilidadSemana([AUX_A], [x({ horario: '12:00-20:00' })], LUNES)
    expect(r.personas[0].horarioSemanal[2]).toBe('12:00-20:00')
    expect(r.personas[0].horarioSemanal[1]).toBe('08:00-16:00')
    expect(r.origen.a).toEqual(['habitual', 'habitual', 'excepcion', 'habitual', 'habitual', 'habitual', 'habitual'])
    expect(AUX_A.horarioSemanal[2]).toBe('08:00-16:00') // no muta la entrada
  })

  it('excepciones de otra semana se ignoran; las inválidas se informan y no se aplican', () => {
    const r = resolverDisponibilidadSemana([AUX_A], [
      x({ fecha: '2026-11-25' }),
      x({ horario: '16:00-08:00' }),
      x({ fecha: '2026-11-19', motivo: '' }),
      x({ colaboradorId: 'zz' }),
    ], LUNES)
    expect(r.personas[0].horarioSemanal).toEqual(AUX_A.horarioSemanal)
    expect(r.errores).toHaveLength(3)
  })

  it('dos excepciones distintas para la misma fecha → no se aplica ninguna', () => {
    const r = resolverDisponibilidadSemana([AUX_A], [x({ horario: '10:00-14:00' }), x({ horario: '15:00-19:00' })], LUNES)
    expect(r.personas[0].horarioSemanal[2]).toBe('08:00-16:00')
    expect(r.errores[0]).toMatch(/2 excepciones distintas/)
  })

  it('eventuales: disponibilidad habitual con excepción de un día', () => {
    const r = resolverDisponibilidadSemana([ev], [x({ colaboradorId: 'e', fecha: '2026-11-20', horario: '' })], LUNES)
    expect(r.personas[0].horarioSemanal[4]).toBe('')
    expect(r.personas[0].horarioSemanal[5]).toBe('10:00-14:00')
  })

  it('resuelve en conjunto excepciones de AUX y eventuales y solo informa una vez el id desconocido', () => {
    const { auxiliares, eventuales, errores, origen } = prepararDisponibilidadSemana([AUX_A, AUX_B], [ev], [
      x({ horario: '09:00-16:00' }),
      x({ colaboradorId: 'e', fecha: '2026-11-20' }),
      x({ colaboradorId: 'inexistente' }),
    ], LUNES)
    expect(errores).toHaveLength(1)
    expect(errores[0]).toContain('persona que no está en la lista')
    expect(auxiliares[0].horarioSemanal[2]).toBe('09:00-16:00')
    expect(eventuales[0].horarioSemanal[4]).toBe('')
    expect(origen.a[2]).toBe('excepcion')
    expect(origen.e[4]).toBe('excepcion')
  })

  it('informa un patrón inválido sin romper el diagnóstico y permite corregirlo por fecha', () => {
    const mal = aux('mal', ['texto no convertible', ...AUX_A.horarioSemanal.slice(1)])
    const original = prepararDisponibilidadSemana([mal, AUX_B], [], [], LUNES)
    expect(original.errores).toHaveLength(1)
    expect(original.huecosSupervision[0]).toMatchObject({ dia: 0, tipo: 'APERTURA' })
    const corregido = prepararDisponibilidadSemana([mal, AUX_B], [], [
      x({ colaboradorId: 'mal', fecha: LUNES, horario: '08:00-16:00' }),
    ], LUNES)
    expect(corregido.errores).toEqual([])
    expect(corregido.huecosSupervision).toEqual([])
  })

  it('horarioValido', () => {
    expect(horarioValido('')).toBe(true)
    expect(horarioValido('08:00-13:00|19:00-22:30')).toBe(true)
    expect(horarioValido('8:00-16:00')).toBe(true)
    expect(horarioValido('16:00-08:00')).toBe(false)
    expect(horarioValido('mañana')).toBe(false)
    expect(horarioValido('08:15-10:00')).toBe(false)
    expect(horarioValido('08:00-10:30|10:00-11:00')).toBe(false)
    expect(horarioValido('22:00-28:30')).toBe(false)
    expect(horarioValido('08:00-10:00|10:00-11:00')).toBe(true)
  })
})

describe('AUX-01: diagnóstico de supervisión antes de generar', () => {
  it('cobertura completa → sin huecos', () => {
    expect(diagnosticarSupervision([AUX_A, AUX_B])).toEqual([])
  })

  it('una excepción que deja la apertura y la tarde sin AUX se detecta con rangos legibles', () => {
    const { huecosSupervision } = prepararDisponibilidadSemana([AUX_A, AUX_B], [ev], [x({ horario: '' })], LUNES)
    expect(huecosSupervision).toEqual([
      { dia: 2, tipo: 'APERTURA', desde: '08:00', hasta: '09:00', detalle: 'miércoles: ningún supervisor (AUX) presente en la apertura 08:00–09:00.' },
      { dia: 2, tipo: 'SUPERVISION', desde: '09:00', hasta: '14:00', detalle: 'miércoles: ningún supervisor (AUX) presente de 09:00 a 14:00.' },
    ])
  })

  it('coincide con el motor: con huecos, la pasada 2 no pone ningún AUX en caja', () => {
    const necesidad = HORAS_FRANJAS.map(hora => ({ hora, necesidad: Array(7).fill(hora < '08:00' ? 0 : 6) }))
    const run = (auxs: Auxiliar[]) => {
      const input = convertirInputAV2(necesidad, [], auxs, [], [])
      return ejecutarAlgoritmo(input)
    }
    const conHueco = prepararDisponibilidadSemana([AUX_A, AUX_B], [], [x({ horario: '' })], LUNES)
    expect(conHueco.huecosSupervision.length).toBeGreaterThan(0)
    const sinCaja = run(conHueco.auxiliares)
    expect(Object.keys(sinCaja.asignacion_aux)).toEqual([])
    const nominal = convertirOutputDeV2(sinCaja, [], conHueco.auxiliares, [])
    const supervisor = nominal.horarios.find(h => h.colaboradorId === 'a')
    expect(supervisor?.jornadas[2].esFranco).toBe(true)
    expect(supervisor?.jornadas[1].turnos).toEqual([{ inicio: '8:00', fin: '16:00' }])
    expect(nominal.cajaAux).toEqual([])
    const sinHueco = prepararDisponibilidadSemana([AUX_A, AUX_B], [], [], LUNES)
    expect(sinHueco.huecosSupervision).toEqual([])
    expect(Object.keys(run(sinHueco.auxiliares).asignacion_aux).sort()).toEqual(['aux_a', 'aux_b'])
  })
})
