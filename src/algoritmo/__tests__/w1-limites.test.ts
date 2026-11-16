import { expect, it, vi } from 'vitest'
import { convertirInputAV2 } from '../adapter'
import { ejecutarAlgoritmo } from '../orquestador'
import { generarConMultiArranque } from '../../utils/generacionMultiArranque'
import { escenarioSintetico } from './fixtures/escenariosSinteticos'
import { AUX_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'

function preparar(id: number) {
  const { necesidad, cajeros, excepciones } = escenarioSintetico(id)
  return {
    input: convertirInputAV2(necesidad, cajeros, AUX_S47, EVENTUALES_S47, excepciones, OPERATIVA_S47),
    cajeros,
    auxiliares: AUX_S47,
    eventuales: EVENTUALES_S47,
    contexto: { necesidad, excepciones, operativa: OPERATIVA_S47 },
  }
}

it('20 s: conserva el respaldo e informa todas las estrategias pendientes si agotó el tiempo', () => {
  const entrada = preparar(121)
  const completa = generarConMultiArranque({ ...entrada, reloj: () => 0 }).seleccion
  let lecturaInicial = true
  const limitada = generarConMultiArranque({
    ...entrada,
    reloj: () => {
      if (!lecturaInicial) return 20_000
      lecturaInicial = false
      return 0
    },
  }).seleccion
  expect(completa.omitidas).toEqual([])
  expect(limitada).toMatchObject({ estrategia: 'actual', sinAlternativas: 'presupuesto-agotado' })
  expect(limitada.omitidas).toHaveLength(6)
  expect(limitada.coberturaElegidaPct).toBe(limitada.coberturaRespaldoPct)
  expect(limitada.coberturaElegidaPct).toBeLessThan(completa.coberturaElegidaPct)
})

it('6 s: el corte de la pasada 1 puede cambiar el horario con la misma entrada', () => {
  const { input } = preparar(121)
  const reloj = vi.spyOn(Date, 'now')
  try {
    reloj.mockReturnValue(0)
    const completa = ejecutarAlgoritmo(input)
    reloj.mockReturnValue(6001).mockReturnValueOnce(0)
    const limitada = ejecutarAlgoritmo(input)
    expect({ full: limitada.jornadas_full, part: limitada.jornadas_part })
      .not.toEqual({ full: completa.jornadas_full, part: completa.jornadas_part })
  } finally {
    reloj.mockRestore()
  }
})
