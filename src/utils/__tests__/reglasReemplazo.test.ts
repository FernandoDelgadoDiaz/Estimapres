import { describe, expect, it } from 'vitest'
import { reemplazoDeReglas, reglasReemplazadas } from '../reglasReemplazo'
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
  it('mínimo de cajeros por franja: la nueva pisa a la que se cruza; otras franjas siguen', () => {
    const manana = r({ tipo: 'min_cajeros_franja', dia: -1, horaDesde: '10:00', horaHasta: '12:00', cantidad: 3 })
    const tarde = r({ tipo: 'min_cajeros_franja', dia: -1, horaDesde: '18:00', horaHasta: '20:00', cantidad: 4 })
    const sabado = r({ tipo: 'min_cajeros_franja', dia: 5, horaDesde: '11:00', horaHasta: '13:00', cantidad: 5 })
    // Nueva franja de la tarde: no toca la de la mañana.
    expect(reglasReemplazadas([manana], { ambito: 'local', tipo: 'min_cajeros_franja', dia: -1, horaDesde: '18:00', horaHasta: '20:00', cantidad: 4, descripcion: '' })).toEqual([])
    // Mismo horario con otra cantidad: pisa a la anterior.
    expect(reglasReemplazadas([manana, tarde], { ambito: 'local', tipo: 'min_cajeros_franja', dia: -1, horaDesde: '10:00', horaHasta: '12:00', cantidad: 2, descripcion: '' })).toEqual([manana])
    // Sábado 11–12 se cruza con «todos los días 10–12» y con «sábado 11–13»; un lunes 11–12 no toca el del sábado.
    expect(reglasReemplazadas([manana, tarde, sabado], { ambito: 'local', tipo: 'min_cajeros_franja', dia: 5, horaDesde: '11:00', horaHasta: '12:00', cantidad: 4, descripcion: '' })).toEqual([manana, sabado])
    expect(reglasReemplazadas([sabado], { ambito: 'local', tipo: 'min_cajeros_franja', dia: 0, horaDesde: '11:00', horaHasta: '12:00', cantidad: 4, descripcion: '' })).toEqual([])
  })
  const HOY = '2026-11-26'
  const p = (x: Partial<ReglaConfigurable>) => r({ ambito: 'colaborador', tipo: 'franco_fijo', colaboradorNombre: 'Ana', ...x })
  const nueva = (x: Partial<ReglaConfigurable>) => ({ ambito: 'colaborador' as const, tipo: 'franco_fijo' as const, colaboradorNombre: 'Ana', descripcion: '', ...x })

  it('franco fijo «siempre» jueves → «siempre» viernes: el del jueves se borra', () => {
    const jue = p({ dia: 3 })
    expect(reemplazoDeReglas([jue], nueva({ dia: 4 }), HOY)).toEqual({ borrar: [jue], recortar: [] })
  })
  it('franco fijo «siempre» jueves → viernes desde la semana que viene: el jueves termina el domingo anterior', () => {
    const jue = p({ dia: 3 })
    expect(reemplazoDeReglas([jue], nueva({ dia: 4, vigenciaDesde: '2026-12-07', vigenciaHasta: '2026-12-13' }), HOY))
      .toEqual({ borrar: [], recortar: [{ regla: jue, vigenciaHasta: '2026-12-06' }] })
  })
  it('jueves de una semana ya pasada y viernes la semana siguiente: el vencido se borra (no se acumula)', () => {
    const jue = p({ dia: 3, vigenciaDesde: '2026-11-16', vigenciaHasta: '2026-11-22' })
    expect(reemplazoDeReglas([jue], nueva({ dia: 4, vigenciaDesde: '2026-11-30', vigenciaHasta: '2026-12-06' }), HOY).borrar).toEqual([jue])
  })
  it('jueves esta semana próxima y viernes la siguiente: el jueves se mantiene para su semana', () => {
    const jue = p({ dia: 3, vigenciaDesde: '2026-11-30', vigenciaHasta: '2026-12-06' })
    expect(reemplazoDeReglas([jue], nueva({ dia: 4, vigenciaDesde: '2026-12-07', vigenciaHasta: '2026-12-13' }), HOY)).toEqual({ borrar: [], recortar: [] })
  })
  it('una regla para un período posterior a la nueva no se toca', () => {
    const enero = p({ dia: 3, vigenciaDesde: '2027-01-04', vigenciaHasta: '2027-01-31' })
    expect(reemplazoDeReglas([enero], nueva({ dia: 4, vigenciaDesde: '2026-11-30', vigenciaHasta: '2026-12-31' }), HOY)).toEqual({ borrar: [], recortar: [] })
  })
  it('turno pedido, siempre mañana y siempre cierre son el mismo tema', () => {
    const manana = p({ tipo: 'siempre_manana' })
    expect(reglasReemplazadas([manana], nueva({ tipo: 'turno', turno: 'cierre' }), HOY)).toEqual([manana])
  })
  it('no toca otras personas ni otros temas', () => {
    const beto = r({ ambito: 'colaborador', tipo: 'franco_fijo', colaboradorNombre: 'Beto', dia: 3 })
    const anaHora = p({ tipo: 'no_antes_de', hora: '09:00' })
    expect(reemplazoDeReglas([beto, anaHora], nueva({ dia: 4 }), HOY)).toEqual({ borrar: [], recortar: [] })
  })
})
