// AH2-053: los cajeros (FULL/PART) terminan como máximo a las 22:30 salvo configuración del local.
import { describe, expect, it } from 'vitest'
import { convertirInputAV2, FIN_CAJEROS_POR_DEFECTO } from '../adapter'
import { ejecutarAlgoritmo } from '../orquestador'
import { aEntradaB } from '../../hibrido/contrato'
import { HORAS_FRANJAS, type Colaborador } from '../../types'

const necesidad = HORAS_FRANJAS.map(hora => {
  const h = Number(hora.slice(0, 2))
  return { hora, necesidad: Array(7).fill(h < 8 ? 0 : h < 14 ? 2 : 3) }
})
const cajeros: Colaborador[] = [
  ...[1, 2, 3, 4].map(i => ({ id: `f${i}`, nombre: `Full ${i}`, tipo: 'FULL', horasSemanales: 48, activo: true }) as Colaborador),
  ...[1, 2, 3].map(i => ({ id: `p${i}`, nombre: `Part ${i}`, tipo: 'PART', horasSemanales: 31, activo: true }) as Colaborador),
]
const ultimaSalida = (r: ReturnType<typeof ejecutarAlgoritmo>) =>
  Math.max(...Object.values({ ...r.jornadas_full, ...r.jornadas_part }).flat().flatMap(j => j.bloques.map(b => b.slot_fin)))

describe('AH2-053: salida máxima de cajeros', () => {
  it('con el valor por defecto nadie termina después de las 22:30 (franja 29)', () => {
    const input = convertirInputAV2(necesidad, cajeros, [], [], [], { cajerosFinHoraLimite: FIN_CAJEROS_POR_DEFECTO })
    expect(input.cajeros_fin_hora_limite).toBe('22:30')
    expect(input.excepciones?.filter(e => e.tipo === 'no_despues_de' && e.valor === '22:30')).toHaveLength(7)
    expect(ultimaSalida(ejecutarAlgoritmo(input))).toBeLessThanOrEqual(29)
    // Viaja al motor CP-SAT tal cual (sin quedar «no transportable»).
    const b = aEntradaB(input, '091')
    expect((b.entrada.input as Record<string, unknown>).cajeros_fin_hora_limite).toBe('22:30')
    expect(b.noTransportables).toEqual([])
  })
  it('un local que configura 23:00 no recibe el límite', () => {
    const input = convertirInputAV2(necesidad, cajeros, [], [], [], { cajerosFinHoraLimite: '23:00' })
    expect(input.excepciones ?? []).toHaveLength(0)
    expect(input.cajeros_fin_hora_limite).toBe('23:00')
  })
})
