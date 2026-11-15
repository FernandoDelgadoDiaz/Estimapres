import { describe, expect, it } from 'vitest'
import { diffHorarios, verificarDiasCongelados } from '../diff'
import { horario, semana, TURNOS } from './fixtures'
import type { SemanaPlan } from '../semana'

const { M, T, C } = TURNOS

describe('B1 · comparación entre versiones', () => {
  it('versiones idénticas: sin cambios', () => {
    const d = diffHorarios(semana('2026-11-16'), semana('2026-11-16'))
    expect(d).toMatchObject({ personasAfectadas: [], francosMovidos: 0, cambiosTipoTurno: 0, ajustesHorario: 0, desvioMinutos: 0 })
    expect(d.fechas).toHaveLength(7)
  })

  it('un ajuste de 30 min es «ajuste-horario», no un cambio de turno; mañana → cierre sí lo es', () => {
    const a: SemanaPlan = { fechaLunes: '2026-11-16', horarios: [horario('c1', [M, M, M, M, M, null, M])] }
    const b: SemanaPlan = { fechaLunes: '2026-11-16', horarios: [horario('c1', [['09:30', '15:30'], M, C, M, M, null, M])] }
    const d = diffHorarios(a, b)
    expect(d.ajustesHorario).toBe(1)
    expect(d.cambiosTipoTurno).toBe(1)
    expect(d.cambios.find(c => c.tipo === 'ajuste-horario')).toMatchObject({ fecha: '2026-11-16', desvioMinutos: 60 })
    expect(d.personasAfectadas).toEqual(['c1'])
  })

  it('francos movidos, altas, bajas y horas por persona', () => {
    const a: SemanaPlan = { fechaLunes: '2026-11-16', horarios: [horario('c1', [M, M, M, M, M, null, M]), horario('c2', [T, T, T, T, T, T, null])] }
    const b: SemanaPlan = { fechaLunes: '2026-11-16', horarios: [horario('c1', [M, M, M, M, null, M, M]), horario('c3', [T, null, T, T, T, T, T])] }
    const d = diffHorarios(a, b)
    expect(d.francosMovidos).toBe(2)
    expect(d.cambios.filter(c => c.tipo === 'baja')).toHaveLength(6)
    expect(d.cambios.filter(c => c.tipo === 'alta')).toHaveLength(6)
    expect(d.horas.c1).toEqual({ antes: 36, despues: 36 })
    expect(d.personasAfectadas).toEqual(['c1', 'c2', 'c3'])
  })

  it('admite un rango: solo compara el tramo replanificado', () => {
    const d = diffHorarios(semana('2026-11-16'), semana('2026-11-16', 1), { desde: '2026-11-18', hasta: '2026-11-22' })
    expect(d.fechas).toEqual(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(d.cambiosTipoTurno).toBe(2) // c1: miércoles y jueves pasan de mañana a cierre
    expect(diffHorarios(semana('2026-11-16'), semana('2026-11-16', 1), { desde: '2026-11-16', hasta: '2026-11-17' }).cambios).toEqual([])
  })
})

describe('B1 · días congelados en un reemplazo parcial', () => {
  it('la versión nueva debe coincidir con la vigente antes de F; modificar un día previo se rechaza', () => {
    expect(verificarDiasCongelados(semana('2026-11-16'), semana('2026-11-16', 1), '2026-11-18').ok).toBe(true)
    const r = verificarDiasCongelados(semana('2026-11-16'), semana('2026-11-16', 1), '2026-11-19')
    expect(r.ok ? null : r.errores[0]).toMatchObject({ codigo: 'DIAS_CONGELADOS_MODIFICADOS', detalle: { cambios: [{ colaboradorId: 'c1', fecha: '2026-11-18', tipo: 'tipo-turno' }] } })
  })
})
