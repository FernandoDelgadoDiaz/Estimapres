import { describe, expect, it } from 'vitest'
import type { DiaEfectivo } from '../../planificacion/historial'
import type { CicloPlanificacion } from '../../planificacion/ciclos'
import { medirCiclo, prepararCiclo } from '../optimizacionCiclos'

const calendario: CicloPlanificacion[] = [
  { id: 'nov', sucursalId: '900', nombre: 'Nov', inicio: '2026-11-02', fin: '2026-12-06', estado: 'cerrado', modalidad: 'mensual', origen: 'sucursal' },
  { id: 'dic', sucursalId: '900', nombre: 'Dic', inicio: '2026-12-07', fin: '2027-01-03', estado: 'abierto', modalidad: 'mensual', origen: 'sucursal' },
]
const historial = { desde: '2026-11-02', hasta: '2026-12-06', hoy: '2026-12-07', tramos: [], versiones: [] }

describe('Selección experimental por ciclos', () => {
  it('distingue cambio de ciclo y cambio de mes y aísla sucursales', () => {
    expect(prepararCiclo({ lunes: '2026-11-30', sucursalId: '900', calendario, historial }).rotacion).toBe(false)
    expect(prepararCiclo({ lunes: '2026-12-07', sucursalId: '900', calendario, historial }).rotacion).toBe(true)
    expect(() => prepararCiclo({ lunes: '2026-12-07', sucursalId: '091', calendario, historial })).toThrow(/sucursal/)
  })

  it('mide el desplazamiento de media hora y la repetición de un cierre', () => {
    const historia: DiaEfectivo[] = [{
      fecha: '2026-11-30', fuente: 'oficial', versionId: 'v1', tramoId: 't1', ausentes: [],
      jornadas: [{ colaboradorId: 'x', jornada: { dia: 0, rol: 'cajero', turnos: [{ inicio: '17:00', fin: '22:00' }], horas: 5, esFranco: false } }],
    }]
    const mismos = medirCiclo({ x: [{ colab_id: 'x', dia: 0, bloques: [{ slot_inicio: 18, slot_fin: 28 }] }] }, historia, '2026-12-07', false)
    const unSlot = medirCiclo({ x: [{ colab_id: 'x', dia: 0, bloques: [{ slot_inicio: 17, slot_fin: 27 }] }] }, historia, '2026-12-07', true)
    expect(mismos).toMatchObject({ mediasHorasCambiadas: 0, cambiosClase: 0, repeticion: 1 })
    expect(unSlot).toMatchObject({ mediasHorasCambiadas: 2, cambiosClase: 1, repeticion: 0 })
  })
})
