// #38 — Resolución determinística de toggles operativos con filas duplicadas.
import { describe, expect, it } from 'vitest'
import { configOperativaDeReglas, resolverReglaOperativa, DEFAULTS_OPERATIVOS } from '../preferencias'
import type { ReglaConfigurable } from '../../types'

const LUNES = '2026-11-16'
const r = (id: string, tipo: ReglaConfigurable['tipo'], activa: boolean, creadaEl: string, extra: Partial<ReglaConfigurable> = {}): ReglaConfigurable =>
  ({ id, ambito: 'local', tipo, activa, descripcion: '', creadaEl, ...extra })

describe('resolverReglaOperativa', () => {
  it('sin filas → predeterminado (apertura_solo_aux ON)', () => {
    expect(resolverReglaOperativa([], 'apertura_solo_aux', LUNES)).toEqual({ valor: true, origen: 'predeterminado' })
    expect(DEFAULTS_OPERATIVOS.apertura_solo_aux).toBe(true)
  })

  it('dos filas activas iguales (caso supervisor_jornada_completa de 091) → valor único, sin conflicto', () => {
    const res = resolverReglaOperativa([r('a', 'supervisor_jornada_completa', true, '2026-07-20'), r('b', 'supervisor_jornada_completa', true, '2026-07-24')], 'supervisor_jornada_completa', LUNES)
    expect(res).toMatchObject({ valor: true, origen: 'regla', reglaId: 'b' })
    expect(res.conflicto).toBeUndefined()
  })

  it('filas con valores distintos → prevalece la más reciente y se informa el conflicto (antes ganaba la más antigua)', () => {
    const res = resolverReglaOperativa([r('vieja', 'apertura_solo_aux', true, '2026-07-01'), r('nueva', 'apertura_solo_aux', false, '2026-08-01')], 'apertura_solo_aux', LUNES)
    expect(res.valor).toBe(false)
    expect(res.reglaId).toBe('nueva')
    expect(res.conflicto).toMatch(/valores distintos/)
  })

  it('el orden de carga no cambia el resultado', () => {
    const filas = [r('x', 'sin_aux_cierre', false, '2026-07-01'), r('y', 'sin_aux_cierre', true, '2026-09-01')]
    expect(resolverReglaOperativa(filas, 'sin_aux_cierre', LUNES).valor).toBe(resolverReglaOperativa([...filas].reverse(), 'sin_aux_cierre', LUNES).valor)
  })

  it('una regla de vigencia acotada prevalece sobre la permanente; fuera de su vigencia no aplica', () => {
    const filas = [r('perm', 'apertura_solo_aux', true, '2026-09-01'), r('temp', 'apertura_solo_aux', false, '2026-07-01', { vigenciaDesde: '2026-11-16', vigenciaHasta: '2026-11-22' })]
    expect(resolverReglaOperativa(filas, 'apertura_solo_aux', LUNES).valor).toBe(false)
    expect(resolverReglaOperativa(filas, 'apertura_solo_aux', '2026-11-23').valor).toBe(true)
  })

  it('ignora reglas de otro tipo o de colaborador', () => {
    const filas = [r('c', 'apertura_solo_aux', false, '2026-09-01', { ambito: 'colaborador' }), r('o', 'sin_aux_cierre', false, '2026-09-01')]
    expect(configOperativaDeReglas(filas, LUNES).aperturaSoloAux).toBe(true)
  })
})
