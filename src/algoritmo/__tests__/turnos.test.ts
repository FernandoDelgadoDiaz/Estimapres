// AH2-056: pedido de turno por persona en el motor de la app (A) y su traducción.
import { describe, expect, it } from 'vitest'
import { convertirInputAV2 } from '../adapter'
import { ejecutarAlgoritmo } from '../orquestador'
import { resolverCortadasMaximas } from '../pasada1-fullpart'
import { excepcionesDeTurno, turnosDeContrato, type TurnoPedido } from '../turnos'
import { reglasAExcepciones } from '../../utils/preferencias'
import { HORAS_FRANJAS, type Colaborador, type ReglaConfigurable } from '../../types'

const necesidad = HORAS_FRANJAS.map(hora => { const h = Number(hora.slice(0, 2)); return { hora, necesidad: Array(7).fill(h < 8 ? 0 : h < 14 ? 2 : 3) } })
const cajeros: Colaborador[] = [
  ...[1, 2, 3, 4].map(i => ({ id: `f${i}`, nombre: `Full ${i}`, tipo: 'FULL', horasSemanales: 48, activo: true }) as Colaborador),
  ...[1, 2, 3].map(i => ({ id: `p${i}`, nombre: `Part ${i}`, tipo: 'PART', horasSemanales: 30, activo: true }) as Colaborador),
]
const slot = (h: string) => (Number(h.slice(0, 2)) - 8) * 2 + (h.slice(3) === '30' ? 1 : 0)
function generar(nombre: string, contrato: string, turno: TurnoPedido) {
  const exc = excepcionesDeTurno({ id: 't', colaboradorNombre: nombre, descripcion: 'pedido' }, contrato, turno)!
  const input = resolverCortadasMaximas(convertirInputAV2(necesidad, cajeros, [], [], exc, { cajerosFinHoraLimite: '22:30' }))
  const r = ejecutarAlgoritmo(input)
  const id = input.colaboradores.find(c => c.nombre === nombre)!.id
  const semana = (r.jornadas_full[id] ?? r.jornadas_part[id]).filter(j => j.bloques.length)
  return { input, semana }
}

describe('AH2-056: el desplegable muestra solo los turnos del contrato', () => {
  it('FULL: mañana, intermedio, tarde, cortado; PART: mañana, tarde, noche (sin cortado)', () => {
    expect(turnosDeContrato('FULL').map(([k]) => k)).toEqual(['manana', 'intermedio', 'tarde', 'cortado', 'cierre'])
    expect(turnosDeContrato('PART').map(([k]) => k)).toEqual(['manana', 'tarde', 'noche', 'cierre'])
    expect(excepcionesDeTurno({ id: 'x', colaboradorNombre: 'P', descripcion: '' }, 'PART', 'cortado')).toBeNull()
  })
  it('una regla «Turno» vigente se traduce según el contrato; si no corresponde, no se aplica', () => {
    const r = { id: 'r', ambito: 'colaborador', tipo: 'turno', turno: 'manana', colaboradorNombre: 'Full 1', activa: true, descripcion: '', creadaEl: '', vigenciaDesde: '2026-11-23', vigenciaHasta: '2026-12-31' } as ReglaConfigurable
    expect(reglasAExcepciones([r], '2026-11-30', { 'Full 1': 'FULL' }).map(e => e.tipo)).toEqual(['no_antes_de', 'inicio_no_despues_de', 'cortadas_semana'])
    expect(reglasAExcepciones([r], '2027-01-04', { 'Full 1': 'FULL' })).toEqual([])            // vencida
    expect(reglasAExcepciones([{ ...r, turno: 'noche' }], '2026-11-30', { 'Full 1': 'FULL' })).toEqual([]) // no es de FULL
  })
})

describe('AH2-056: el motor de la app respeta el pedido sin tocar la composición FULL', () => {
  const composicion = (semana: { bloques: { slot_inicio: number; slot_fin: number }[] }[]) =>
    semana.map(j => j.bloques.reduce((n, b) => n + b.slot_fin - b.slot_inicio, 0)).sort((a, b) => a - b)
  it.each([['manana', '08:00', '09:00'], ['intermedio', '10:00', '11:00'], ['tarde', '12:00', '15:00']] as const)('FULL solo %s: sin cortadas, ingreso en la ventana', (t, desde, hasta) => {
    const { semana } = generar('Full 1', 'FULL', t)
    expect(semana.filter(j => j.bloques.length === 2)).toHaveLength(0)
    expect(composicion(semana)).toEqual([10, 16, 16, 18, 18, 18])
    for (const j of semana) { expect(j.bloques[0].slot_inicio).toBeGreaterThanOrEqual(slot(desde)); expect(j.bloques[0].slot_inicio).toBeLessThanOrEqual(slot(hasta)) }
  })
  it('FULL solo cortado: la mayor cantidad posible (4), encadenadas con 12 h de descanso', () => {
    const { input, semana } = generar('Full 1', 'FULL', 'cortado')
    expect(input.excepciones?.find(e => e.tipo === 'cortadas_semana')?.valor).toBe('4')
    expect(semana.filter(j => j.bloques.length === 2)).toHaveLength(4)
    expect(composicion(semana)).toEqual([10, 16, 16, 18, 18, 18])
  })
  it('PART solo noche: ingreso 17:00–18:00', () => {
    const { semana } = generar('Part 1', 'PART', 'noche')
    for (const j of semana) { expect(j.bloques).toHaveLength(1); expect(j.bloques[0].slot_inicio).toBeGreaterThanOrEqual(18); expect(j.bloques[0].slot_inicio).toBeLessThanOrEqual(20) }
  })
  // AH2-058: «Solo cierre» reemplaza a la regla suelta «Siempre de cierre» (misma regla del motor).
  it.each([['Full 1', 'FULL'], ['Part 1', 'PART']] as const)('%s solo cierre: cada jornada que no es mañana corrida termina al cierre', (nombre, contrato) => {
    const { input, semana } = generar(nombre, contrato, 'cierre')
    expect(input.excepciones?.some(e => e.tipo === 'siempre_cierre')).toBe(true)
    for (const j of semana) {
      const mananaCorrida = j.bloques.length === 1 && j.bloques[0].slot_inicio <= 6
      if (!mananaCorrida) expect(j.bloques[j.bloques.length - 1].slot_fin).toBeGreaterThanOrEqual(28)
    }
    if (contrato === 'FULL') expect(composicion(semana)).toEqual([10, 16, 16, 18, 18, 18])
  })
  it('el resto del personal sigue con 2 cortadas', () => {
    const { input } = generar('Full 1', 'FULL', 'manana')
    const r = ejecutarAlgoritmo(input)
    for (const id of ['full_2', 'full_3', 'full_4']) expect((r.jornadas_full[id] ?? []).filter(j => j.bloques.length === 2)).toHaveLength(2)
  })
})

describe('AH2-056: la regla «Turno» se guarda y se lee completa', () => {
  it('ida y vuelta por la fila de la base conserva el turno y la vigencia', async () => {
    const { filaARegla } = await import('../../utils/almacen')
    const fila = { id: 'r1', tipo: 'colaborador', colaborador_nombre: 'Full 1', parametros: { tipo: 'turno', turno: 'cortado' }, activa: true,
      fecha_desde: '2026-11-30', fecha_hasta: '2026-12-31', descripcion: 'Full 1: solo cortado', created_at: '2026-11-22T00:00:00Z' }
    expect(filaARegla(fila as never)).toMatchObject({ tipo: 'turno', turno: 'cortado', colaboradorNombre: 'Full 1', vigenciaDesde: '2026-11-30', vigenciaHasta: '2026-12-31' })
  })
})
