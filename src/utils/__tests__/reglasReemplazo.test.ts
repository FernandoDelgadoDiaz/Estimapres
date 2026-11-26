import { describe, expect, it } from 'vitest'
import { reglasReemplazadas } from '../reglasReemplazo'
import type { ReglaConfigurable } from '../../types'

const r = (x: Partial<ReglaConfigurable>): ReglaConfigurable => ({ id: Math.random().toString(36).slice(2), ambito: 'local', tipo: 'eventuales_caja_hora_limite', activa: true, descripcion: '', creadaEl: '2026-11-01T00:00:00Z', ...x } as ReglaConfigurable)

describe('AH2-067 · la regla nueva reemplaza a la anterior del mismo tema', () => {
  it('hora límite de eventuales: 22:00 → 21:00 → 20:00 deja solo la última', () => {
    const vieja = r({ hora: '22:00' }), otra = r({ hora: '21:00' })
    const bloques = r({ tipo: 'max_bloques_caja_eventual_dia', cantidad: 2 })
    expect(reglasReemplazadas([vieja, otra, bloques], { ambito: 'local', tipo: 'eventuales_caja_hora_limite', hora: '20:00', descripcion: '' })).toEqual([vieja, otra])
  })
  it('interruptores y máximos de la sucursal también son de un solo valor', () => {
    const a = r({ tipo: 'supervisor_jornada_completa' }), b = r({ tipo: 'supervisor_jornada_completa' })
    expect(reglasReemplazadas([a, b], { ambito: 'local', tipo: 'supervisor_jornada_completa', descripcion: '' })).toEqual([a, b])
  })
  it('mínimo de cajeros por franja admite varias', () => {
    const f = r({ tipo: 'min_cajeros_franja', horaDesde: '10:00', horaHasta: '12:00', cantidad: 3 })
    expect(reglasReemplazadas([f], { ambito: 'local', tipo: 'min_cajeros_franja', horaDesde: '18:00', horaHasta: '20:00', cantidad: 4, descripcion: '' })).toEqual([])
  })
  it('por persona: reemplaza la de la misma persona, tipo y vigencia; no toca otras personas ni otros períodos', () => {
    const ana = r({ ambito: 'colaborador', tipo: 'no_antes_de', colaboradorNombre: 'Ana', hora: '09:00' })
    const anaDic = r({ ambito: 'colaborador', tipo: 'no_antes_de', colaboradorNombre: 'Ana', hora: '10:00', vigenciaDesde: '2026-12-01', vigenciaHasta: '2026-12-31' })
    const beto = r({ ambito: 'colaborador', tipo: 'no_antes_de', colaboradorNombre: 'Beto', hora: '09:00' })
    const anaOtro = r({ ambito: 'colaborador', tipo: 'no_despues_de', colaboradorNombre: 'Ana', hora: '20:00' })
    expect(reglasReemplazadas([ana, anaDic, beto, anaOtro], { ambito: 'colaborador', tipo: 'no_antes_de', colaboradorNombre: 'Ana', hora: '11:00', descripcion: '' })).toEqual([ana])
  })
})
