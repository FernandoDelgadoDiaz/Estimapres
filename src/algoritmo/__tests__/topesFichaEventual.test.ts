import { describe, expect, it } from 'vitest'
import { topesCajaPorPersona } from '../adapter'
import { compilarDisponibilidadCaja } from '../disponibilidadCajaEventual'
import type { Eventual } from '../../types'

const ev = (id: string, max?: number): Eventual => ({ id, nombre: id, activo: true, sector: 'Salon', horarioSemanal: Array(7).fill('09:00-15:00'), ...(max === undefined ? {} : { maxHorasSemanales: max }) }) as Eventual

describe('AH2-047: tope de caja de cada eventual = el menor entre su ficha y el máximo de Configuración', () => {
  it('la ficha agrega un tope individual y nunca amplía uno menor', () => {
    expect(topesCajaPorPersona([ev('a', 6), ev('b'), ev('c', 4)], { c: 2 }, id => `m-${id}`)).toEqual({ 'm-a': 12, 'm-c': 2 })
    expect(topesCajaPorPersona([ev('a', 0)], undefined, id => id)).toEqual({ a: 0 })
    expect(topesCajaPorPersona([ev('b')], undefined, id => id)).toBeUndefined()
  })
  it('con el máximo PART en 8 h, una ficha de 6 h deja 6 h; de 4 h deja 4 h; sin ficha, 8 h', () => {
    const tope = (max?: number) => {
      const presencia = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => (s >= 2 && s < 14 ? 'DISPONIBLE' : 'NO_DISPONIBLE')))
      const input = {
        sucursal_id: '091', semana: '2026-11-23', demanda: [], colaboradores: [{ id: 'e1', nombre: 'e1', rol: 'EVENTUAL' }], presencia_aux: {},
        disponibilidad_eventual: { e1: presencia },
        max_caja_eventual_slots: topesCajaPorPersona(max === undefined ? [] : [ev('e1', max)], undefined, id => id),
        disponibilidad_caja_eventual: { version: 1, perfiles: [{ sucursalId: '091', colaboradorId: 'e1', vigenciaDesde: '2026-11-23', vigenciaHasta: null, acreditacion: 'TODA_LA_PRESENCIA', contratoOrigen: 'PART', fuente: 'test' }] },
        topes_caja_eventual_contrato: { version: 1, configuraciones: [{ sucursalId: '091', vigenciaDesde: '2026-11-23', vigenciaHasta: null, fuente: 'test', FULL: { activo: true, horas: 12 }, PART: { activo: true, horas: 8 } }] },
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return compilarDisponibilidadCaja(input as any).input.max_caja_eventual_slots?.e1
    }
    expect(tope(6)).toBe(12)
    expect(tope(4)).toBe(8)
    expect(tope()).toBe(16)
    expect(tope(10)).toBe(16)
  })
})
