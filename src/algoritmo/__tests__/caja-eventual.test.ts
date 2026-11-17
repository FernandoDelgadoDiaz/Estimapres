import { describe, expect, it } from 'vitest'
import { ejecutarPasada3 } from '../pasada3-eventuales'
import { PERFIL_MOTOR_ACTUAL, validarHorario } from '../validadorIndependiente'
import { configOperativaDeReglas } from '../../utils/preferencias'
import type { ReglaConfigurable } from '../../types'
import type { AsignacionEv, InputAlgoritmo } from '../types'

function correr(slots: number[], reglas: Partial<InputAlgoritmo> = {}, pesos?: number[]) {
  const demanda = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => Number(slots.includes(s))))
  const disponibilidad = Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s): AsignacionEv => s === 8 ? 'NO_DISPONIBLE' : 'NO_USADO'))
  const pasada = ejecutarPasada3({
    demanda, colaboradores: [], presencia_aux: {}, disponibilidad_eventual: { ev: disponibilidad },
    pesos_franja: pesos, ...reglas,
  }, { asignacion_aux: {}, deficit_2: demanda, auxes_activados_08_09: {}, supervisor_designado: {}, violaciones_input: [] })
  return { pasada, disponibilidad, caja: pasada.asignacion_eventual.ev[0].flatMap((estado, slot) => estado === 'CAJA' ? [slot] : []) }
}

describe('Límites de caja de eventuales por sucursal', () => {
  it.each([
    ['A', {}, [2, 3, 6, 27, 28]],
    ['B', { max_bloques_caja_eventual_dia: 2 }, [2, 3, 6]],
    ['C', { eventuales_caja_hora_limite: '22:00' }, [2, 3, 6, 27]],
    ['D', { max_bloques_caja_eventual_dia: 2, eventuales_caja_hora_limite: '22:00' }, [2, 3, 6]],
  ] as const)('%s asigna durante la generación y conserva presencia', (_, reglas, esperado) => {
    const { pasada, disponibilidad, caja } = correr([0, 2, 3, 6, 8, 27, 28], reglas)
    expect(caja).toEqual(esperado)
    expect(pasada.deficit_3[0][28]).toBe(Number(!caja.includes(28)))
    expect(pasada.deficit_3[0][29]).toBe(0)
    expect(pasada.asignacion_eventual.ev[0][8]).toBe('NO_DISPONIBLE')
    expect(disponibilidad[0][28]).toBe('NO_USADO')
  })

  it('al unir dos bloques habilita un bloque nuevo', () => {
    const pesos = Array.from({ length: 30 }, () => 1)
    pesos[4] = 3
    pesos[6] = 3
    pesos[5] = 2
    expect(correr([4, 5, 6, 12], { max_bloques_caja_eventual_dia: 2 }, pesos).caja).toEqual([4, 5, 6, 12])
  })

  it('el límite es inclusivo y admite un horario distinto', () => {
    expect(correr([26, 27, 28], { eventuales_caja_hora_limite: '21:30' }).caja).toEqual([26])
  })

  it('la validación independiente detecta ambos incumplimientos incluso sin datos de presencia', () => {
    const { pasada } = correr([2, 3, 6, 28])
    const v = validarHorario({
      horarios: [],
      perfil: PERFIL_MOTOR_ACTUAL,
      roster: [{ id: 'ev', nombre: 'Eventual sintético', contrato: 'EVENTUAL' }],
      cajaEventual: [{ colaboradorId: 'ev', nombre: 'Eventual sintético', slotsCajaPorDia: pasada.asignacion_eventual.ev.map(f => f.map(x => x === 'CAJA')) }],
      operativa: { aperturaSoloAux: false, maxBloquesCajaEventualDia: 2, eventualesCajaHoraLimite: '22:00' },
    })
    expect(v.violaciones.filter(x => x.dia === 0).map(x => x.codigo)).toEqual(expect.arrayContaining(['OP_EVENTUAL_MAX_BLOQUES', 'OP_EVENTUAL_CIERRE']))
    expect(v.publicable).toBe(false)
  })

  it('resuelve individualmente revisiones vigentes y respeta la desactivación', () => {
    const base = { ambito: 'local', descripcion: 'Configuración de prueba', activa: true } as const
    const reglas: ReglaConfigurable[] = [
      { ...base, id: 'a', tipo: 'max_bloques_caja_eventual_dia', cantidad: 2, creadaEl: '2026-11-16' },
      { ...base, id: 'b', tipo: 'max_bloques_caja_eventual_dia', activa: false, creadaEl: '2026-11-17' },
      { ...base, id: 'c', tipo: 'eventuales_caja_hora_limite', hora: '22:00', creadaEl: '2026-11-16', vigenciaDesde: '2026-11-23' },
    ]
    expect(configOperativaDeReglas(reglas, '2026-11-16')).not.toHaveProperty('maxBloquesCajaEventualDia')
    expect(configOperativaDeReglas(reglas, '2026-11-16')).not.toHaveProperty('eventualesCajaHoraLimite')
    expect(configOperativaDeReglas(reglas, '2026-11-23').eventualesCajaHoraLimite).toBe('22:00')
    expect(configOperativaDeReglas([], '2026-11-23')).not.toHaveProperty('eventualesCajaHoraLimite')
  })
})
