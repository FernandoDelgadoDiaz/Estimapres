// RULES-01 (#11): reglas configurables v2 — vigencia, ámbito, precedencia, conflictos,
// compilación al motor y compatibilidad con el modelo actual. Datos sintéticos.
import { describe, expect, it } from 'vitest'
import {
  compilarParaMotor, compararPrecedencia, desdeReglasLegacy, diasVigentes, resolverSemana,
  type ContextoSemana, type Parametros, type PersonaRoster, type ReglaV2,
} from '../reglasV2'
import {
  reglasAExcepciones, capFrancosDeReglas, demandaMinimaDeReglas, configOperativaDeReglas,
} from '../../utils/preferencias'
import type { ReglaConfigurable } from '../../types'

const LUNES = '2026-11-16' // semana 16–22/11/2026
const roster: PersonaRoster[] = [
  { id: 'a', nombre: 'Persona A', sucursalId: 'S1', contrato: 'FULL' },
  { id: 'b', nombre: 'Persona B', sucursalId: 'S1', contrato: 'PART' },
  { id: 'c', nombre: 'Persona C', sucursalId: 'S1', contrato: 'PART' },
]
const ctx = (extra: Partial<ContextoSemana> = {}): ContextoSemana => ({ lunes: LUNES, sucursalId: 'S1', roster, ...extra })

let n = 0
const regla = (parametros: Parametros, o: Partial<ReglaV2> = {}): ReglaV2 => ({
  id: o.id ?? `r${++n}`, nivel: 'OPERATIVA', ambito: { tipo: 'PERSONA', id: 'a' }, parametros,
  vigencia: { tipo: 'PERMANENTE' }, prioridad: 0, activa: true, descripcion: o.descripcion ?? parametros.tipo,
  auditoria: { creadaPor: 'test', creadaEn: '2026-11-01T00:00:00Z', motivo: 't', version: 1 }, ...o,
})
const efectivas = (r: ReturnType<typeof resolverSemana>, id: string, d: number) => r.porPersona[id][d].map(x => x.id)

describe('RULES-01: vigencia', () => {
  it('semanal, mensual, por fechas y permanente', () => {
    expect(diasVigentes(regla({ tipo: 'siempre_cierre' }, { vigencia: { tipo: 'SEMANA', lunes: LUNES } }), LUNES)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(diasVigentes(regla({ tipo: 'siempre_cierre' }, { vigencia: { tipo: 'SEMANA', lunes: '2026-11-23' } }), LUNES)).toEqual([])
    // «solo mañana todo noviembre» en la semana 30/11–06/12: solo el lunes 30
    expect(diasVigentes(regla({ tipo: 'solo_turno', turno: 'manana' }, { vigencia: { tipo: 'MES', anio: 2026, mes: 11 } }), '2026-11-30')).toEqual([0])
    expect(diasVigentes(regla({ tipo: 'siempre_cierre' }, { vigencia: { tipo: 'RANGO', desde: '2026-11-18', hasta: '2026-11-20' } }), LUNES)).toEqual([2, 3, 4])
    expect(diasVigentes(regla({ tipo: 'siempre_cierre' }, { vigencia: { tipo: 'PERMANENTE', desde: '2026-11-21' } }), LUNES)).toEqual([5, 6])
    expect(diasVigentes(regla({ tipo: 'siempre_cierre' }, { activa: false }), LUNES)).toEqual([])
  })
})

describe('RULES-01: ámbito', () => {
  it('persona, grupo (con membresía por fecha), sucursal y empresa', () => {
    const rp = regla({ tipo: 'siempre_cierre' }, { ambito: { tipo: 'PERSONA', id: 'b' } })
    const rg = regla({ tipo: 'solo_turno', turno: 'noche' }, { ambito: { tipo: 'GRUPO', id: 'g1' } })
    const rs = regla({ tipo: 'ventana_horaria', salidaHasta: '23:00' }, { ambito: { tipo: 'SUCURSAL', id: 'S1' } })
    const rs2 = regla({ tipo: 'ventana_horaria', entradaDesde: '08:00' }, { ambito: { tipo: 'SUCURSAL', id: 'OTRA' } })
    const re = regla({ tipo: 'ventana_horaria', entradaDesde: '07:00' }, { ambito: { tipo: 'EMPRESA', id: 'E1' } })
    const grupos = [{ id: 'g1', sucursalId: 'S1', nombre: 'Noche', miembros: [{ colaboradorId: 'c', desde: '2026-11-19' }] }]
    const r = resolverSemana([rp, rg, rs, rs2, re], ctx({ grupos, empresaId: 'E1' }))
    expect(efectivas(r, 'b', 0).sort()).toEqual([rp.id, rs.id, re.id].sort())
    expect(efectivas(r, 'c', 2)).not.toContain(rg.id) // aún no es miembro
    expect(efectivas(r, 'c', 3)).toContain(rg.id)
    expect(efectivas(r, 'a', 0)).not.toContain(rs2.id)
  })
})

describe('RULES-01: precedencia y conflictos', () => {
  it('orden: nivel → prioridad → especificidad → más reciente', () => {
    const op = regla({ tipo: 'siempre_cierre' })
    const pref = regla({ tipo: 'siempre_cierre' }, { nivel: 'PREFERENCIA', prioridad: 99 })
    const alta = regla({ tipo: 'siempre_cierre' }, { prioridad: 5 })
    const suc = regla({ tipo: 'siempre_cierre' }, { ambito: { tipo: 'SUCURSAL', id: 'S1' } })
    const nueva = regla({ tipo: 'siempre_cierre' }, { auditoria: { creadaPor: 't', creadaEn: '2026-11-10T00:00:00Z', motivo: '', version: 1 } })
    expect([pref, suc, op, alta].sort(compararPrecedencia).map(x => x.id)).toEqual([alta.id, op.id, suc.id, pref.id])
    expect(compararPrecedencia(nueva, op)).toBeLessThan(0)
  })

  it('dos francos fijos distintos con igual prioridad → CONFLICTO (no se resuelve en silencio)', () => {
    const r = resolverSemana([regla({ tipo: 'franco_fijo', dia: 1 }), regla({ tipo: 'franco_fijo', dia: 3 })], ctx())
    expect(r.ok).toBe(false)
    expect(r.conflictos[0]).toMatchObject({ codigo: 'FRANCO_FIJO', colaboradorId: 'a' })
  })

  it('dos obligatorias incompatibles con DISTINTA prioridad también son CONFLICTO (la prioridad no decide)', () => {
    const baja = regla({ tipo: 'franco_fijo', dia: 1 }, { descripcion: 'franco martes' })
    const alta = regla({ tipo: 'franco_fijo', dia: 3 }, { prioridad: 10, descripcion: 'franco jueves' })
    const r = resolverSemana([baja, alta], ctx())
    expect(r.ok).toBe(false)
    expect(r.sobrescritas).toEqual([])
    expect(r.conflictos.every(c => c.codigo === 'FRANCO_FIJO')).toBe(true)
    expect(r.conflictos[0].detalle).toMatch(/La prioridad no decide entre obligatorias/)
    // igual con turnos y con NORMATIVA vs OPERATIVA
    expect(resolverSemana([regla({ tipo: 'solo_turno', turno: 'manana' }, { prioridad: 99 }), regla({ tipo: 'siempre_cierre' })], ctx()).ok).toBe(false)
    expect(resolverSemana([regla({ tipo: 'solo_turno', turno: 'manana' }, { nivel: 'NORMATIVA' }), regla({ tipo: 'siempre_cierre' }, { prioridad: 99 })], ctx()).ok).toBe(false)
  })

  it('preferencias: se ordenan por prioridad, luego especificidad y luego la más reciente', () => {
    const p1 = regla({ tipo: 'solo_turno', turno: 'manana' }, { nivel: 'PREFERENCIA', prioridad: 1 })
    const p5 = regla({ tipo: 'solo_turno', turno: 'noche' }, { nivel: 'PREFERENCIA', prioridad: 5 })
    const r = resolverSemana([p1, p5], ctx())
    expect(r.ok).toBe(true)
    expect(efectivas(r, 'a', 0)).toEqual([p5.id])
    expect(r.sobrescritas.filter(x => x.regla === p1.id)).toHaveLength(7)
    const suc = regla({ tipo: 'solo_turno', turno: 'manana' }, { nivel: 'PREFERENCIA', ambito: { tipo: 'SUCURSAL', id: 'S1' } })
    const per = regla({ tipo: 'solo_turno', turno: 'tarde' }, { nivel: 'PREFERENCIA' })
    expect(efectivas(resolverSemana([suc, per], ctx()), 'a', 0)).toEqual([per.id])
  })

  it('una preferencia nunca desactiva una NORMATIVA ni una OPERATIVA, aunque tenga más prioridad', () => {
    const norm = regla({ tipo: 'franco_fijo', dia: 2 }, { nivel: 'NORMATIVA', descripcion: 'normativa (test)' })
    const pref = regla({ tipo: 'franco_fijo', dia: 4 }, { nivel: 'PREFERENCIA', prioridad: 1000 })
    const r = resolverSemana([norm, pref], ctx())
    expect(r.ok).toBe(true)
    expect(efectivas(r, 'a', 0)).toEqual([norm.id])
    expect(r.sobrescritas.every(x => x.regla === pref.id && x.por === norm.id)).toBe(true)
  })

  it('una preferencia nunca bloquea: cede ante la operativa', () => {
    const r = resolverSemana([regla({ tipo: 'solo_turno', turno: 'manana' }, { nivel: 'PREFERENCIA' }), regla({ tipo: 'siempre_cierre' })], ctx())
    expect(r.ok).toBe(true)
    expect(r.sobrescritas.length).toBe(7)
  })

  it('turnos incompatibles: mañana vs cierre / tarde vs noche; cierre es compatible con noche', () => {
    expect(resolverSemana([regla({ tipo: 'solo_turno', turno: 'manana' }), regla({ tipo: 'siempre_cierre' })], ctx()).conflictos[0].codigo).toBe('TURNO')
    expect(resolverSemana([regla({ tipo: 'solo_turno', turno: 'tarde' }), regla({ tipo: 'solo_turno', turno: 'noche' })], ctx()).ok).toBe(false)
    expect(resolverSemana([regla({ tipo: 'solo_turno', turno: 'noche' }), regla({ tipo: 'siempre_cierre' })], ctx()).ok).toBe(true)
  })

  it('conflicto solo en los días donde se superponen las vigencias', () => {
    const r = resolverSemana([
      regla({ tipo: 'solo_turno', turno: 'manana' }, { vigencia: { tipo: 'RANGO', desde: '2026-11-16', hasta: '2026-11-18' } }),
      regla({ tipo: 'siempre_cierre' }, { vigencia: { tipo: 'RANGO', desde: '2026-11-18', hasta: '2026-11-22' } }),
    ], ctx())
    expect(r.conflictos.map(c => c.dia)).toEqual([2])
  })

  it('ventanas horarias: se intersectan; vacía → conflicto', () => {
    expect(resolverSemana([regla({ tipo: 'ventana_horaria', entradaDesde: '10:00' }), regla({ tipo: 'ventana_horaria', salidaHasta: '18:00' })], ctx()).ok).toBe(true)
    const r = resolverSemana([regla({ tipo: 'ventana_horaria', entradaDesde: '18:00' }), regla({ tipo: 'ventana_horaria', salidaHasta: '12:00' })], ctx())
    expect(r.conflictos.map(c => c.codigo)).toContain('VENTANA_VACIA')
  })

  it('«franco fijo martes» de todos vs «mínimo 2 cajeros martes» → dotación insuficiente', () => {
    const fr = (id: string) => regla({ tipo: 'franco_fijo', dia: 1 }, { ambito: { tipo: 'PERSONA', id } })
    const minimo = regla({ tipo: 'min_cajeros_franja', dia: 1, desde: '18:00', hasta: '21:00', cantidad: 2 }, { ambito: { tipo: 'SUCURSAL', id: 'S1' }, descripcion: 'mínimo martes noche' })
    const r = resolverSemana([fr('a'), fr('b'), minimo], ctx())
    expect(r.conflictos).toEqual([expect.objectContaining({ codigo: 'DOTACION_INSUFICIENTE', dia: 1 })])
    expect(r.conflictos[0].detalle).toMatch(/pide 2 cajeros y solo 1/)
  })

  it('más francos fijos el mismo día que el tope → conflicto', () => {
    const fr = (id: string) => regla({ tipo: 'franco_fijo', dia: 4 }, { ambito: { tipo: 'PERSONA', id } })
    const tope = regla({ tipo: 'max_francos_dia', cantidad: 2 }, { ambito: { tipo: 'SUCURSAL', id: 'S1' } })
    expect(resolverSemana([fr('a'), fr('b'), fr('c'), tope], ctx()).conflictos.map(c => c.codigo)).toEqual(['FRANCOS_FIJOS_SOBRE_TOPE'])
    expect(resolverSemana([fr('a'), fr('b'), tope], ctx()).ok).toBe(true)
  })

  it('regla para una persona que no está en el roster → conflicto explícito', () => {
    expect(resolverSemana([regla({ tipo: 'siempre_cierre' }, { ambito: { tipo: 'PERSONA', id: 'zz' } })], ctx()).conflictos[0].codigo).toBe('PERSONA_INEXISTENTE')
  })
})

describe('RULES-01: excepciones autorizadas', () => {
  const franco = regla({ tipo: 'franco_fijo', dia: 1 }, { id: 'fm', descripcion: 'franco martes' })
  const autorizada = (o: Partial<ReglaV2> = {}, x: Partial<NonNullable<ReglaV2['excepcion']>> = {}) =>
    regla({ tipo: 'franco_fijo', dia: 3 }, {
      id: 'ex', descripcion: 'franco jueves esta semana', vigencia: { tipo: 'SEMANA', lunes: LUNES },
      excepcion: { reemplaza: ['fm'], autorizadaPor: 'supervisor-091', autorizadaEn: '2026-11-12T10:00:00Z', motivo: 'cambio pedido por la persona', ...x },
      ...o,
    })

  it('reemplaza a la OPERATIVA nombrada durante su vigencia, con auditoría', () => {
    const r = resolverSemana([franco, autorizada()], ctx())
    expect(r.ok).toBe(true)
    expect(efectivas(r, 'a', 0)).toEqual(['ex'])
    expect(r.reemplazadas).toEqual([{ regla: 'fm', excepcion: 'ex', dias: [0, 1, 2, 3, 4, 5, 6], autorizadaPor: 'supervisor-091', motivo: 'cambio pedido por la persona' }])
    // fuera de su vigencia vuelve a regir la regla original
    expect(efectivas(resolverSemana([franco, autorizada()], ctx({ lunes: '2026-11-23' })), 'a', 0)).toEqual(['fm'])
  })

  it('solo aparta los días de su vigencia', () => {
    const r = resolverSemana([franco, autorizada({ vigencia: { tipo: 'RANGO', desde: '2026-11-16', hasta: '2026-11-18' } })], ctx())
    expect(r.reemplazadas[0].dias).toEqual([0, 1, 2])
    expect(r.ok).toBe(true)
    expect(efectivas(r, 'a', 5)).toEqual(['fm'])
  })

  it('sin vigencia acotada, sin autor, sin motivo o sin reglas a reemplazar → inválida, no se aplica y bloquea', () => {
    for (const [o, x, msg] of [
      [{ vigencia: { tipo: 'PERMANENTE' } }, {}, /vigencia acotada/],
      [{}, { autorizadaPor: ' ' }, /quién la autorizó/],
      [{}, { motivo: '' }, /falta el motivo/],
      [{}, { reemplaza: [] }, /qué reglas reemplaza/],
      [{ nivel: 'PREFERENCIA' }, {}, /nivel OPERATIVA/],
    ] as const) {
      const r = resolverSemana([franco, autorizada(o as Partial<ReglaV2>, x as Partial<NonNullable<ReglaV2["excepcion"]>>)], ctx())
      expect(r.ok).toBe(false)
      expect(r.conflictos.find(c => c.codigo === 'EXCEPCION_INVALIDA')?.detalle).toMatch(msg)
      expect(r.reemplazadas).toEqual([])
    }
  })

  it('nunca puede reemplazar una regla NORMATIVA', () => {
    const norm = regla({ tipo: 'franco_fijo', dia: 1 }, { id: 'fm', nivel: 'NORMATIVA', descripcion: 'normativa (test)' })
    const r = resolverSemana([norm, autorizada()], ctx())
    expect(r.conflictos.find(c => c.codigo === 'EXCEPCION_INVALIDA')?.detalle).toMatch(/no puede reemplazar la regla normativa/)
    expect(efectivas(r, 'a', 0)).toEqual(['fm'])
  })

  it('reemplaza también reglas generales (toggle) y dos toggles obligatorios opuestos son conflicto', () => {
    const t1 = regla({ tipo: 'toggle_operativo', clave: 'apertura_solo_aux', valor: true }, { id: 't1', ambito: { tipo: 'SUCURSAL', id: 'S1' } })
    const t2 = regla({ tipo: 'toggle_operativo', clave: 'apertura_solo_aux', valor: false }, { id: 't2', ambito: { tipo: 'SUCURSAL', id: 'S1' }, prioridad: 9 })
    expect(resolverSemana([t1, t2], ctx()).conflictos.map(c => c.codigo)).toEqual(['TOGGLE'])
    const ex = regla({ tipo: 'toggle_operativo', clave: 'apertura_solo_aux', valor: false }, {
      id: 't3', ambito: { tipo: 'SUCURSAL', id: 'S1' }, vigencia: { tipo: 'SEMANA', lunes: LUNES },
      excepcion: { reemplaza: ['t1'], autorizadaPor: 'gerente', autorizadaEn: '2026-11-12', motivo: 'inventario' },
    })
    const r = resolverSemana([t1, ex], ctx())
    expect(r.ok).toBe(true)
    expect(compilarParaMotor(r, ctx()).operativa.aperturaSoloAux).toBe(false)
  })
})

describe('RULES-01: compilación al motor actual', () => {
  it('traduce cada tipo y avisa lo que el motor no puede representar', () => {
    const rs = [
      regla({ tipo: 'franco_fijo', dia: 1 }, { ambito: { tipo: 'PERSONA', id: 'a' } }),
      regla({ tipo: 'solo_turno', turno: 'manana' }, { ambito: { tipo: 'PERSONA', id: 'b' }, vigencia: { tipo: 'RANGO', desde: '2026-11-16', hasta: '2026-11-18' } }),
      regla({ tipo: 'ventana_horaria', entradaDesde: '09:30', salidaHasta: '20:00' }, { ambito: { tipo: 'PERSONA', id: 'c' } }),
      regla({ tipo: 'no_disponible' }, { ambito: { tipo: 'PERSONA', id: 'c' }, vigencia: { tipo: 'RANGO', desde: '2026-11-22', hasta: '2026-11-22' } }),
      regla({ tipo: 'min_cajeros_franja', dia: -1, desde: '19:00', hasta: '21:00', cantidad: 3 }, { ambito: { tipo: 'SUCURSAL', id: 'S1' } }),
      regla({ tipo: 'max_francos_dia', cantidad: 3 }, { ambito: { tipo: 'SUCURSAL', id: 'S1' } }),
      regla({ tipo: 'max_francos_dia', cantidad: 2 }, { ambito: { tipo: 'EMPRESA', id: 'E1' } }),
      regla({ tipo: 'toggle_operativo', clave: 'apertura_solo_aux', valor: false }, { ambito: { tipo: 'SUCURSAL', id: 'S1' } }),
    ]
    const c = compilarParaMotor(resolverSemana(rs, ctx()), ctx())
    expect(c.excepciones.map(e => [e.colaboradorNombre, e.tipo, e.valor])).toEqual([
      ['Persona A', 'franco_dia', '1'],
      ['Persona B', 'solo_matutino', undefined],
      ['Persona C', 'no_antes_de', '09:30'],
      ['Persona C', 'no_despues_de', '20:00'],
    ])
    expect(c.maxFrancosDia).toBe(2) // ambas obligatorias: rige la más restrictiva
    expect(c.demandaMinima).toEqual([{ dia: -1, slotDesde: 22, slotHasta: 26, cantidad: 3 }])
    expect(c.operativa.aperturaSoloAux).toBe(false)
    expect(c.operativa.francoMedioCorridos).toBe(true) // default
    expect(c.avisos.join('\n')).toMatch(/rige solo lunes, martes, miércoles/)
    expect(c.avisos.join('\n')).toMatch(/no disponible.*no tiene representación/)
  })
})

describe('RULES-01: compatibilidad con ReglaConfigurable (modelo actual)', () => {
  const legacy: ReglaConfigurable[] = [
    { id: 'l1', ambito: 'colaborador', tipo: 'franco_fijo', colaboradorNombre: 'Persona A', dia: 2, activa: true, descripcion: 'franco mié', creadaEl: '2026-07-01' },
    { id: 'l2', ambito: 'colaborador', tipo: 'no_antes_de', colaboradorNombre: 'Persona B', hora: '10:00', activa: true, descripcion: 'entra 10', creadaEl: '2026-07-01' },
    { id: 'l3', ambito: 'colaborador', tipo: 'no_despues_de', colaboradorNombre: 'Persona B', hora: '19:00', activa: true, descripcion: 'sale 19', creadaEl: '2026-07-01' },
    { id: 'l4', ambito: 'colaborador', tipo: 'siempre_manana', colaboradorNombre: 'Persona C', activa: true, vigenciaDesde: '2026-11-01', vigenciaHasta: '2026-11-30', descripcion: 'mañana nov', creadaEl: '2026-07-01' },
    { id: 'l5', ambito: 'colaborador', tipo: 'siempre_cierre', colaboradorNombre: 'Persona A', activa: false, descripcion: 'cierre (inactiva)', creadaEl: '2026-07-01' },
    { id: 'l6', ambito: 'local', tipo: 'min_cajeros_franja', dia: 5, horaDesde: '19:30', horaHasta: '21:00', cantidad: 3, activa: true, descripcion: 'min sab', creadaEl: '2026-07-01' },
    { id: 'l7', ambito: 'local', tipo: 'max_francos_dia', cantidad: 3, activa: true, descripcion: 'tope', creadaEl: '2026-07-01' },
    { id: 'l8', ambito: 'local', tipo: 'sin_aux_cierre', activa: false, descripcion: 'toggle R2 OFF', creadaEl: '2026-07-01' },
    { id: 'l9', ambito: 'local', tipo: 'franco_medio_corridos', activa: true, vigenciaDesde: '2026-12-01', descripcion: 'R4 desde dic', creadaEl: '2026-07-01' },
  ]

  for (const lunes of ['2026-11-16', '2026-11-30', '2026-12-07', '2026-07-06']) {
    it(`el resultado compilado coincide con el pipeline actual (semana ${lunes})`, () => {
      const { reglas, pendientes } = desdeReglasLegacy(legacy, roster, 'S1')
      expect(pendientes).toEqual([])
      const c = compilarParaMotor(resolverSemana(reglas, ctx({ lunes })), ctx({ lunes }))
      const clave = (e: { colaboradorNombre: string; tipo: string; valor?: string }) => `${e.colaboradorNombre}|${e.tipo}|${e.valor ?? ''}`
      expect(c.excepciones.map(clave).sort()).toEqual(reglasAExcepciones(legacy, lunes).map(clave).sort())
      expect(c.maxFrancosDia).toEqual(capFrancosDeReglas(legacy, lunes))
      expect(c.demandaMinima).toEqual(demandaMinimaDeReglas(legacy, lunes))
      expect(c.operativa).toEqual(configOperativaDeReglas(legacy, lunes))
    })
  }

  it('nombres ambiguos o inexistentes quedan pendientes (no se adivina; ver ID-01 #9)', () => {
    const r = [...roster, { id: 'a2', nombre: 'Persona A', sucursalId: 'S1', contrato: 'PART' as const }]
    const { pendientes } = desdeReglasLegacy([legacy[0], { ...legacy[1], colaboradorNombre: 'Nadie' }], r, 'S1')
    expect(pendientes.map(p => p.motivo)).toEqual(['nombre «Persona A» ambiguo', '«Nadie» no está en el roster'])
  })
})
