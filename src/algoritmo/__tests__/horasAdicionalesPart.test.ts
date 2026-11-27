/**
 * AH2-071 · Horas adicionales PART (sigue siendo PART): exacto / hasta, jornadas de 4 a 8 h, cortada con corte ≥ 4 h.
 */
import { describe, expect, it } from 'vitest'
import casos from './fixtures/ah2040SemanalCasosEstados.json'
import { ejecutarPasada1 } from '../pasada1-fullpart'
import { validarHorario, PERFIL_MOTOR_ACTUAL } from '../validadorIndependiente'
import { horasAdicionalesDeReglas } from '../../utils/preferencias'
import type { InputAlgoritmo, Jornada } from '../types'
import type { ReglaConfigurable } from '../../types'

const base = (casos as unknown as Array<{ nombre: string; data: { input: InputAlgoritmo } }>).find(c => c.nombre.startsWith('S11'))!.data.input
const slots = (w: Jornada[]) => w.reduce((n, j) => n + j.bloques.reduce((m, b) => m + b.slot_fin - b.slot_inicio, 0), 0)

function conAdicional(modo: 'exacto' | 'hasta', horas: number): InputAlgoritmo {
  const input = structuredClone(base)
  const part = input.colaboradores.find(c => c.rol === 'PART')!
  const ficha = input.contratos?.[part.id]?.objetivoSlots ?? 64
  input.contratos = { ...input.contratos, [part.id]: { objetivoSlots: modo === 'exacto' ? horas * 2 : ficha, maximoSlots: horas * 2, minimoSlots: modo === 'exacto' ? horas * 2 : ficha, adicional: { modo, maximoSlots: horas * 2 } } }
  // Más demanda para que convenga sumar horas.
  input.demanda = input.demanda.map(r => r.map((n, s) => (s >= 2 && s < 28 ? n + 2 : n)))
  return input
}

describe('AH2-071 · motor A con horas adicionales PART', () => {
  it('exacto: trabaja exactamente esas horas, con jornadas de hasta 8 h y un franco', () => {
    const input = conAdicional('exacto', 42)
    const id = input.colaboradores.find(c => c.rol === 'PART')!.id
    const w = ejecutarPasada1(input).jornadas_part[id]
    expect(w).toHaveLength(7)
    expect(slots(w)).toBe(84)
    expect(w.filter(j => !j.bloques.length)).toHaveLength(1)
    for (const j of w) {
      const n = j.bloques.reduce((m, b) => m + b.slot_fin - b.slot_inicio, 0)
      expect(n === 0 || (n >= 8 && n <= 16)).toBe(true)
      if (j.bloques.length === 2) expect(j.bloques[1].slot_inicio - j.bloques[0].slot_fin).toBeGreaterThanOrEqual(8)
    }
  })
  it('hasta: entre la ficha y el máximo cargado', () => {
    const input = conAdicional('hasta', 46)
    const id = input.colaboradores.find(c => c.rol === 'PART')!.id
    const w = ejecutarPasada1(input).jornadas_part[id]
    const total = slots(w)
    expect(total).toBeGreaterThanOrEqual(input.contratos![id].minimoSlots!)
    expect(total).toBeLessThanOrEqual(92)
  })
})

describe('AH2-071 · validador', () => {
  const dia = (d: number, turnos: Array<[string, string]>) => ({ dia: d, turnos: turnos.map(([inicio, fin]) => ({ inicio, fin })), horas: 0, esFranco: !turnos.length, rol: 'cajero' as const })
  const semana = [dia(0, [['09:00', '17:00']]), dia(1, [['09:00', '13:00'], ['17:00', '21:00']]), dia(2, [['09:00', '17:00']]), dia(3, [['09:00', '17:00']]), dia(4, [['09:00', '15:00']]), dia(5, [['09:00', '15:00']]), dia(6, [])]
  const entrada = (ad?: { modo: 'exacto' | 'hasta'; horas: number; fichaHoras?: number }) => validarHorario({
    horarios: [{ colaboradorId: 'p', rolGeneral: 'cajero', jornadas: semana, errores: [], totalHoras: 44 }],
    roster: [{ id: 'p', nombre: 'Ana', contrato: 'PART' }], perfil: PERFIL_MOTOR_ACTUAL,
    ...(ad ? { horasAdicionales: { Ana: ad } } : {}),
  }).violaciones.map(v => v.codigo)
  it('sin horas adicionales, 44 h con jornadas de 8 h y cortada no valen para un PART', () => {
    expect(entrada()).toEqual(expect.arrayContaining(['NORM_HORAS_MAX', 'NORM_BLOQUES_DIA', 'NORM_HORAS_DIA_MAX']))
  })
  it('con horas adicionales (hasta 44 h) valen; exacto 46 pide 46', () => {
    expect(entrada({ modo: 'hasta', horas: 44, fichaHoras: 32 }).filter(c => c.startsWith('NORM_'))).toEqual([])
    expect(entrada({ modo: 'exacto', horas: 46 })).toContain('NORM_HORAS_EXACTAS')
  })
})

describe('AH2-071 · regla por persona', () => {
  const r = (x: Partial<ReglaConfigurable>): ReglaConfigurable => ({ id: Math.random().toString(36), ambito: 'colaborador', tipo: 'horas_adicionales', colaboradorNombre: 'Ana', cantidad: 40, modoHoras: 'hasta', activa: true, descripcion: '', creadaEl: '2026-11-27T00:00:00Z', ...x } as ReglaConfigurable)
  it('rige en su vigencia y la más reciente de cada persona', () => {
    expect(horasAdicionalesDeReglas([r({})], '2026-11-30')).toEqual({ Ana: { modo: 'hasta', horas: 40 } })
    expect(horasAdicionalesDeReglas([r({ vigenciaDesde: '2026-12-07', vigenciaHasta: '2026-12-13' })], '2026-11-30')).toEqual({})
    expect(horasAdicionalesDeReglas([r({ cantidad: 50 })], '2026-11-30')).toEqual({})
    expect(horasAdicionalesDeReglas([r({ cantidad: 38, creadaEl: '2026-11-01T00:00:00Z' }), r({ cantidad: 42, modoHoras: 'exacto' })], '2026-11-30')).toEqual({ Ana: { modo: 'exacto', horas: 42 } })
  })
})
