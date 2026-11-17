import { describe, expect, it, vi } from 'vitest'
import { convertirInputAV2 } from '../../algoritmo/adapter'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../../algoritmo/__tests__/fixtures/semana47Anonimizada'
import type { DiaEfectivo } from '../../planificacion/historial'
import type { CicloPlanificacion } from '../../planificacion/ciclos'
import * as multiArranque from '../generacionMultiArranque'
import { generarConCiclo, medirCiclo, prepararCiclo } from '../optimizacionCiclos'
import { MATRIZ_POM_SINTETICA } from './fixtures/pomSintetico'

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

  it('elige una alternativa válida aunque empate en cobertura con el borrador inválido', () => {
    const necesidad = MATRIZ_POM_SINTETICA.map(([hora, necesidad]) => ({ hora, necesidad }))
    const entrada: multiArranque.EntradaMultiArranque = {
      input: convertirInputAV2(necesidad, CAJEROS_S47, AUX_S47, EVENTUALES_S47, [], OPERATIVA_S47),
      cajeros: CAJEROS_S47, auxiliares: AUX_S47, eventuales: EVENTUALES_S47,
      contexto: { necesidad, excepciones: [], operativa: OPERATIVA_S47 },
    }
    const valido = multiArranque.generarConMultiArranque(entrada)
    const invalido = { ...valido, resultado: { ...valido.resultado, horarios: [] } }
    const generar = vi.spyOn(multiArranque, 'generarConMultiArranque')
      .mockReturnValueOnce(invalido).mockReturnValueOnce(valido)
    try {
      const resultado = generarConCiclo(entrada, {
        lunes: '2026-11-16', sucursalId: '900', calendario,
        historial: {
          ...historial, hasta: '2026-11-15', hoy: '2026-11-16',
          tramos: [{ id: 't1', sucursalId: '900', publicacionId: 'p1', versionId: 'v1', desde: '2026-11-09', hasta: '2026-11-15', hastaEfectivo: '2026-11-15' }],
          versiones: [{
            version: { id: 'v1', sucursalId: '900', cicloId: 'nov', fechaLunes: '2026-11-09', numero: 1, estado: 'PUBLICADO', ambito: 'servidor', huellaEntradas: 'fixture', creadaPor: 'fixture' },
            semana: { fechaLunes: '2026-11-09', horarios: valido.resultado.horarios },
          }],
        },
      })
      expect(generar).toHaveBeenCalledTimes(2)
      expect(resultado.elegibleHibrido).toBe(true)
      expect(resultado.resultado).toEqual(valido.resultado)
    } finally {
      generar.mockRestore()
    }
  })
})
