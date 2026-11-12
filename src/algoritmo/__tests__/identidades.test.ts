// ID-01 (#9): identidad estable de colaboradores en el pipeline UI → motor → UI.
import { describe, expect, it } from 'vitest'
import { asignarIdentidadesV2, convertirInputAV2, convertirOutputDeV2, normalizarId } from '../adapter'
import { ejecutarAlgoritmo } from '../orquestador'
import { HORAS_FRANJAS, type Colaborador, type Auxiliar } from '../../types'

const necesidad = HORAS_FRANJAS.map(hora => {
  const h = Number(hora.slice(0, 2))
  return { hora, necesidad: Array(7).fill(h < 8 ? 0 : h < 14 ? 2 : 3) }
})
const full = (id: string, nombre: string): Colaborador => ({ id, nombre, tipo: 'FULL', horasSemanales: 48, activo: true })
const part = (id: string, nombre: string): Colaborador => ({ id, nombre, tipo: 'PART', horasSemanales: 31, activo: true })

function generar(cajeros: Colaborador[], auxiliares: Auxiliar[] = [], pref?: Record<string, number>) {
  const input = convertirInputAV2(necesidad, cajeros, auxiliares, [], [], pref ? { preferenciasPorNombre: pref as never } : undefined)
  return { input, out: convertirOutputDeV2(ejecutarAlgoritmo(input), cajeros, auxiliares, []) }
}

describe('ID-01: asignarIdentidadesV2', () => {
  it('nombres únicos conservan normalizarId (no cambia el desempate del motor)', () => {
    const r = asignarIdentidadesV2([{ id: 'u1', nombre: 'Carlos Paz' }, { id: 'u2', nombre: 'Ana' }])
    expect(r.v2PorUi.get('u1')).toBe('carlos_paz')
    expect(r.v2PorUi.get('u2')).toBe(normalizarId('Ana'))
    expect(r.homonimos).toEqual([])
  })

  it('homónimos al normalizar reciben ids distintos y se reportan', () => {
    const r = asignarIdentidadesV2([{ id: 'u1', nombre: 'José Pérez' }, { id: 'u2', nombre: 'Jose Perez' }])
    expect(r.v2PorUi.get('u1')).toBe('jose_perez__u1')
    expect(r.v2PorUi.get('u2')).toBe('jose_perez__u2')
    expect(r.homonimos).toEqual([['José Pérez', 'Jose Perez']])
  })

  it('id de UI repetido o vacío → error explícito', () => {
    expect(() => asignarIdentidadesV2([{ id: 'u1', nombre: 'A' }, { id: 'u1', nombre: 'B' }])).toThrow(/duplicado: u1/)
    expect(() => asignarIdentidadesV2([{ id: '', nombre: 'A' }])).toThrow(/sin id/)
  })
})

describe('ID-01: pipeline completo', () => {
  it('«José Pérez» y «Jose Perez» generan dos horarios distintos sin colisión', () => {
    const { input, out } = generar([full('u1', 'José Pérez'), full('u2', 'Jose Perez'), part('u3', 'Ana')])
    expect(new Set(input.colaboradores.map(c => c.id)).size).toBe(3)
    const ids = out.horarios.map(h => h.colaboradorId).sort()
    expect(ids).toEqual(['u1', 'u2', 'u3'])
    for (const id of ['u1', 'u2']) {
      const h = out.horarios.find(x => x.colaboradorId === id)!
      expect(h.jornadas.filter(j => !j.esFranco).length).toBeGreaterThan(0)
    }
    expect(out.alertas.some(a => a.includes('Nombres equivalentes: José Pérez / Jose Perez'))).toBe(true)
  })

  it('renombrar a un colaborador conserva su id y su horario', () => {
    const antes = generar([full('u1', 'Carlos Paz'), full('u2', 'Bea Ruiz'), part('u3', 'Ana')]).out
    const despues = generar([full('u1', 'Carlos A. Paz'), full('u2', 'Bea Ruiz'), part('u3', 'Ana')]).out
    const h = (o: typeof antes, id: string) => o.horarios.find(x => x.colaboradorId === id)!
    for (const id of ['u1', 'u2', 'u3']) expect(h(despues, id).jornadas).toEqual(h(antes, id).jornadas)
  })

  it('AUX homónimo de un cajero: la caja se atribuye por identidad, no por nombre', () => {
    const aux: Auxiliar = { id: 'a1', nombre: 'Jose Perez', horarioSemanal: Array(7).fill('08:00-16:00'), activo: true }
    const cajeros = [full('u1', 'José Pérez'), part('u3', 'Ana')]
    const input = convertirInputAV2(necesidad, cajeros, [aux], [], [])
    const resultado = ejecutarAlgoritmo(input)
    // Se inyecta una asignación de caja del AUX para verificar solo el mapeo de salida.
    resultado.asignacion_aux = { [input.colaboradores.find(c => c.rol === 'AUX')!.id]: input.presencia_aux['jose_perez__a1'].map(f => f.map(() => 'CAJA' as const)) }
    const out = convertirOutputDeV2(resultado, cajeros, [aux], [])
    expect(out.cajaAux?.map(c => [c.colaboradorId, c.nombre])).toEqual([['a1', 'Jose Perez']])
    // FULL/PART + fila del AUX (la UI también lista AUX): cada uno con su propio id.
    expect(out.horarios.map(h => h.colaboradorId).sort()).toEqual(['a1', 'u1', 'u3'])
    expect(out.horarios.find(h => h.colaboradorId === 'u1')!.rolGeneral).toBe('cajero')
  })

  it('preferencias por nombre aplican a cada homónimo (y se avisa)', () => {
    const { input } = generar([full('u1', 'José Pérez'), full('u2', 'Jose Perez')], [], { 'José Pérez': { manana: 1 } as never })
    expect(Object.keys(input.preferencias_turno ?? {}).sort()).toEqual(['jose_perez__u1', 'jose_perez__u2'])
  })
})
