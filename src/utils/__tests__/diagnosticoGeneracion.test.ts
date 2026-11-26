// AH2-062 · Motivos claros cuando no se puede generar el horario.
import { describe, expect, it } from 'vitest'
import { diagnosticoPrevio, explicarSinPropuesta } from '../diagnosticoGeneracion'
import type { Colaborador, ExcepcionSemanal } from '../../types'

const cajeros: Colaborador[] = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, nombre: `Cajero ${i + 1}`, tipo: i < 4 ? 'FULL' : 'PART', horasSemanales: 48, activo: true }) as Colaborador)
const franco = (nombre: string, valor: string): ExcepcionSemanal => ({ id: `${nombre}${valor}`, colaboradorNombre: nombre, tipo: 'franco_dia', valor, descripcion: '' })

describe('AH2-062 · diagnóstico antes de generar', () => {
  it('todos de franco el lunes (como se cargan en pantalla, «Lun»): dice cuántos, quiénes y el máximo', () => {
    const m = diagnosticoPrevio(cajeros, cajeros.map(c => franco(c.nombre, 'Lun')), { maxFrancosDia: 2 })
    expect(m).toHaveLength(1)
    expect(m[0]).toContain('El lunes tienen franco 8 cajeros')
    expect(m[0]).toContain('el máximo es 2 por día')
    expect(m[0]).toContain('Quitá 6 francos')
    expect(m[0]).not.toMatch(/OP_|franco_dia|restricci/)
  })
  it('AH2-066: el máximo cuenta a los supervisores de franco ese día y el mensaje lo dice', () => {
    const m = diagnosticoPrevio(cajeros, [franco('Cajero 1', '2'), franco('Cajero 2', '2')], { maxFrancosDia: 2, maxFrancosPorDia: [2, 2, 1, 2, 2, 2, 2], supervisoresDeFranco: [0, 0, 1, 0, 0, 0, 0] })
    expect(m).toHaveLength(1)
    expect(m[0]).toContain('El miércoles tienen franco 2 cajeros')
    expect(m[0]).toContain('el máximo es 2 personas por día y ese día ya está de franco un supervisor')
    expect(m[0]).toContain('Quitá un franco')
  })
  it('dos francos para la misma persona (regla de Configuración + cambio de la semana)', () => {
    const m = diagnosticoPrevio(cajeros, [franco('Cajero 1', '0'), franco('Cajero 1', 'Mié')], { maxFrancosDia: 2 })
    expect(m[0]).toContain('Cajero 1 tiene franco cargado 2 días (lunes y miércoles)')
  })
  it('horarios que se contradicen', () => {
    const ex: ExcepcionSemanal[] = [
      { id: 'a', colaboradorNombre: 'Cajero 2', tipo: 'no_antes_de', valor: '18:00', descripcion: '' },
      { id: 'b', colaboradorNombre: 'Cajero 2', tipo: 'no_despues_de', valor: '20:00', descripcion: '' },
    ]
    expect(diagnosticoPrevio(cajeros, ex)[0]).toContain('Cajero 2 no puede entrar antes de las 18:00 ni salir después de las 20:00')
  })
  it('una semana normal no da motivos', () => {
    expect(diagnosticoPrevio(cajeros, [franco('Cajero 1', 'Lun'), franco('Cajero 2', 'Lun'), franco('Cajero 3', 'Mar')], { maxFrancosDia: 2 })).toEqual([])
  })
})

describe('AH2-062 · sin propuesta del motor', () => {
  it('muestra los motivos con nombres y sin códigos ni datos técnicos', () => {
    const t = explicarSinPropuesta([
      { origen: 'A', codigo: 'NORM_DESCANSO', detalle: 'cajero_1: 11 h de descanso antes del martes (mínimo 12 h).' },
      { origen: 'A', codigo: 'X', detalle: '{"codigo":1}' },
      { origen: 'TRANSPORTE', codigo: 'TIMEOUT', detalle: 'B no respondió' },
    ], { cajero_1: 'Ana Pérez' })
    expect(t).toContain('Ana Pérez: 11 h de descanso')
    expect(t).not.toContain('cajero_1')
    expect(t).not.toContain('{')
    expect(t).not.toContain('B no respondió')
    expect(t).toContain('Revisá los cambios de esta semana')
  })
})
