// #38 — Apertura OFF de punta a punta y recálculo integral tras ediciones manuales.
import { describe, expect, it } from 'vitest'
import { aplicarEdicionConRecalculo } from '../../hooks/useAsignacion'
import { prepararDisponibilidadSemana, diagnosticarSupervision } from '../disponibilidadHabitual'
import { validarResultadoSemana, estadoValidacion } from '../validacionSemana'
import type { Auxiliar, Colaborador, Eventual, ResultadoAsignacion } from '../../types'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../../algoritmo/__tests__/fixtures/semana47Anonimizada'
import { NECESIDAD_S47, LUNES_S47, composicion, generar, presente } from '../../algoritmo/__tests__/fixtures/aperturaHelpers'

const ON = { ...OPERATIVA_S47, aperturaSoloAux: true }
const OFF = { ...OPERATIVA_S47, aperturaSoloAux: false }
const DIAS = [0, 1, 2, 3, 4, 5, 6]
const EV_08: Eventual[] = [...EVENTUALES_S47, { id: 'ev-08', nombre: 'Eventual 08', sector: 'S4', activo: true, horarioSemanal: Array(7).fill('08:00-16:00') }]
const necesidadFranjas = NECESIDAD_S47.map(f => f.necesidad)
const nombrePorId = Object.fromEntries([...CAJEROS_S47, ...AUX_S47, ...EV_08].map(p => [p.id, p.nombre]))
const disponibilidad = Object.fromEntries([...AUX_S47, ...EV_08].map(p => [p.id, p.horarioSemanal]))
const demanda = (d: number, s: number) => necesidadFranjas[s + 2]?.[d] ?? 0 // fila 2 = 08:00

const validar = (r: ResultadoAsignacion, op = ON, aux: Auxiliar[] = AUX_S47, ev: Eventual[] = EV_08, cajeros: Colaborador[] = CAJEROS_S47) =>
  validarResultadoSemana(r, cajeros, aux, ev, { necesidad: NECESIDAD_S47, excepciones: [], operativa: op })
const editar = (r: ResultadoAsignacion, id: string, dia: number, turnos: { inicio: string; fin: string }[], op = ON) =>
  aplicarEdicionConRecalculo(r, id, dia, { esFranco: turnos.length === 0, turnos }, nombrePorId[id] ?? id,
    { necesidadFranjas, operativa: op, nombrePorId, disponibilidad })

/** Invariantes de la cascada: nadie fuera de presencia/disponibilidad y sin cobertura duplicada. */
function coherente(r: ResultadoAsignacion, op = ON, fijos: string[] = []) {
  for (const a of r.cajaAux ?? []) a.slotsCajaPorDia.forEach((f, d) => f.forEach((x, s) => {
    if (!x) return
    const fila = r.horarios.find(h => h.colaboradorId === a.colaboradorId)!
    const j = fila.jornadas[d]
    const t = 8 * 60 + s * 30
    expect(!j.esFranco && j.turnos.some(tu => +tu.inicio.split(':')[0] * 60 + +tu.inicio.split(':')[1] <= t && +tu.fin.split(':')[0] * 60 + +tu.fin.split(':')[1] > t), `${a.colaboradorId} d${d} s${s} fuera de presencia`).toBe(true)
  }))
  for (const e of r.cajaEventual ?? []) e.slotsCajaPorDia.forEach((f, d) => f.forEach((x, s) => {
    if (x && !fijos.includes(`${e.colaboradorId}|${d}`)) expect(presente(disponibilidad[e.colaboradorId], d, s), `${e.colaboradorId} d${d} s${s} fuera de disponibilidad`).toBe(true)
  }))
  for (const d of DIAS) for (let s = 0; s < 29; s++) {
    const c = composicion(r, d, s)
    const fijosAqui = c.eventual.filter(id => fijos.includes(`${id}|${d}`)).length
    const apoyo = c.aux.length + c.eventual.length - fijosAqui - (op.aperturaSoloAux && s < 2 ? 1 : 0)
    if (apoyo > 0) expect(c.fullPart + c.aux.length + c.eventual.length, `d${d} s${s} cobertura duplicada`).toBeLessThanOrEqual(Math.max(demanda(d, s), c.fullPart + fijosAqui + (op.aperturaSoloAux && s < 2 ? 1 : 0)))
    // cobertura y faltantes informados = reales
    expect(r.coberturaFranjas[s + 2][d], `cobertura d${d} s${s}`).toBe(c.fullPart + c.aux.length + c.eventual.length)
    expect(r.faltantesFranjas[s + 2][d]).toBe(Math.max(0, demanda(d, s) - r.coberturaFranjas[s + 2][d]))
  }
}

describe('#38 Nueva Semana con «apertura solo AUX» OFF y sin AUX presentes 08:00–09:00', () => {
  const AUX_TARDE: Auxiliar[] = [
    { id: 'aux-X', nombre: 'Aux X', activo: true, horarioSemanal: Array(7).fill('09:00-16:00') },
    { id: 'aux-Y', nombre: 'Aux Y', activo: true, horarioSemanal: Array(7).fill('15:00-23:00') },
  ]

  it('el diagnóstico previo no informa H-A1 con OFF (y sí con ON)', () => {
    expect(diagnosticarSupervision(AUX_TARDE, { aperturaSoloAux: false })).toEqual([])
    expect(diagnosticarSupervision(AUX_TARDE, { aperturaSoloAux: true }).filter(h => h.tipo === 'APERTURA')).toHaveLength(7)
  })

  it('flujo completo OFF: diagnóstico → generación → validación sin H-A1 ni violación de apertura; abre FULL/PART', () => {
    const disp = prepararDisponibilidadSemana(AUX_TARDE, EV_08, [], LUNES_S47, { aperturaSoloAux: false })
    expect(disp.huecosSupervision).toEqual([])
    const r = generar(OFF, disp.auxiliares, disp.eventuales)
    for (const d of DIAS) for (const s of [0, 1]) {
      const c = composicion(r, d, s)
      expect(c).toMatchObject({ aux: [], eventual: [] })
      expect(c.fullPart).toBeGreaterThanOrEqual(1)
    }
    const v = validarResultadoSemana(r, CAJEROS_S47, disp.auxiliares, disp.eventuales, {
      necesidad: NECESIDAD_S47, excepciones: [], operativa: OFF, huecosSupervision: disp.huecosSupervision,
    })
    expect(v.violaciones.filter(x => x.codigo === 'H-A1' || x.codigo === 'OP_APERTURA_COMPOSICION')).toEqual([])
    expect(v.publicable).toBe(true)
  })

  it('aunque llegue un diagnóstico H-A1 viejo, con OFF la validación lo descarta', () => {
    const huecos = diagnosticarSupervision(AUX_TARDE, { aperturaSoloAux: true })
    const r = generar(OFF, AUX_TARDE, EV_08)
    const v = validarResultadoSemana(r, CAJEROS_S47, AUX_TARDE, EV_08, { necesidad: NECESIDAD_S47, excepciones: [], operativa: OFF, huecosSupervision: huecos })
    expect(v.violaciones.some(x => x.codigo === 'H-A1')).toBe(false)
  })

  it('mismo plantel con ON: la falta de AUX en la apertura sí es bloqueante', () => {
    const disp = prepararDisponibilidadSemana(AUX_TARDE, EV_08, [], LUNES_S47, { aperturaSoloAux: true })
    const r = generar(ON, disp.auxiliares, disp.eventuales)
    const v = validarResultadoSemana(r, CAJEROS_S47, disp.auxiliares, disp.eventuales, { necesidad: NECESIDAD_S47, excepciones: [], operativa: ON, huecosSupervision: disp.huecosSupervision })
    expect(v.publicable).toBe(false)
    expect(v.violaciones.filter(x => x.codigo === 'OP_APERTURA_COMPOSICION')).toHaveLength(7)
    for (const d of DIAS) expect(composicion(r, d, 0)).toEqual({ fullPart: 0, aux: [], eventual: [] }) // sin sustitutos
  })

  it('OFF sin cajero compatible (solo PART, que no abren a las 08:00): se informa la imposibilidad, sin sustituir ni forzar contratos', () => {
    const soloPart = CAJEROS_S47.filter(c => c.tipo === 'PART')
    const r = generar(OFF, AUX_S47, EV_08, soloPart)
    for (const d of DIAS) for (const s of [0, 1]) expect(composicion(r, d, s)).toEqual({ fullPart: 0, aux: [], eventual: [] })
    for (const h of r.horarios.filter(x => x.rolGeneral === 'cajero')) for (const j of h.jornadas) {
      if (j.esFranco) continue
      expect(j.turnos).toHaveLength(1) // PART: una jornada corrida
      expect(j.horas).toBeGreaterThanOrEqual(4)
      expect(j.horas).toBeLessThanOrEqual(6)
      const [h, m] = j.turnos[0].inicio.split(':').map(Number)
      expect(h * 60 + m).toBeGreaterThanOrEqual(9 * 60) // catálogo PART vigente: inicio desde 09:00
    }
    const v = validar(r, OFF, AUX_S47, EV_08, soloPart)
    const ap = v.violaciones.filter(x => x.codigo === 'OP_APERTURA_COMPOSICION')
    expect(ap).toHaveLength(7)
    expect(ap[0].detalle).toMatch(/ningún cajero FULL\/PART abre dentro de su contrato/)
    expect(r.alertas.some(a => a.startsWith('OP-APERTURA'))).toBe(true)
  })
})

describe('#38 recálculo integral después de una edición manual', () => {
  const base = () => generar(ON, AUX_S47, EV_08)

  it('punto de partida coherente', () => coherente(base()))

  it('cambiar la presencia de un AUX recalcula su CAJA y la del resto sin duplicar ni salir de presencia', () => {
    const r = editar(base(), 'aux-C', 1, [{ inicio: '08:00', fin: '11:00' }]) // martes: aux-C se va a las 11
    coherente(r)
    expect(r.cajaAux!.find(a => a.colaboradorId === 'aux-C')!.slotsCajaPorDia[1].slice(6).some(Boolean)).toBe(false)
    const v = validar(r)
    expect(v.violaciones.filter(x => ['OP_AUX_FUERA_PRESENCIA', 'OP_COBERTURA_DUPLICADA', 'OP_EVENTUAL_FUERA_DISPONIBILIDAD'].includes(x.codigo))).toEqual([])
  })

  it('reducir las horas de un cajero: el déficit nuevo pasa a AUX/eventuales disponibles y los faltantes se actualizan', () => {
    const r0 = base()
    const cajero = r0.horarios.find(h => h.rolGeneral === 'cajero' && !h.jornadas[2].esFranco)!
    const r = editar(r0, cajero.colaboradorId, 2, [])
    coherente(r)
    expect(validar(r).violaciones.filter(x => x.codigo === 'OP_COBERTURA_DUPLICADA')).toEqual([])
    const sum = (m: number[][]) => m.flat().reduce((a, b) => a + b, 0)
    expect(sum(r.coberturaFranjas)).toBeLessThanOrEqual(sum(r0.coberturaFranjas))
  })

  it('aumentar las horas de un cajero donde había un eventual: el eventual (no fijado) se retira, sin cobertura duplicada', () => {
    const r0 = base()
    const ev = (r0.cajaEventual ?? []).flatMap(e => e.slotsCajaPorDia.flatMap((f, d) => f.map((x, s) => ({ id: e.colaboradorId, d, s, x })))).find(c => c.x && c.s >= 4 && c.s <= 20)!
    expect(ev).toBeDefined()
    const cajero = r0.horarios.find(h => h.rolGeneral === 'cajero' && h.jornadas[ev.d].esFranco)!
    const hora = (s: number) => `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`
    const r = editar(r0, cajero.colaboradorId, ev.d, [{ inicio: hora(ev.s - 2), fin: hora(ev.s + 4) }])
    coherente(r)
    const c0 = composicion(r0, ev.d, ev.s), c = composicion(r, ev.d, ev.s)
    expect(c.fullPart).toBe(c0.fullPart + 1)
    expect(c.aux.length + c.eventual.length).toBe(Math.max(0, c0.aux.length + c0.eventual.length - 1))
    expect(validar(r).violaciones.filter(x => x.codigo === 'OP_COBERTURA_DUPLICADA')).toEqual([])
  })

  it('asignar a mano un eventual: queda fijado, el recálculo lo respeta y descuenta su cobertura (sin AUX/eventual extra)', () => {
    const r0 = base()
    // Lunes 15:00–17:00 a ev-T1 (disponible 15–23) como decisión manual
    const r = editar(r0, 'ev-T1', 0, [{ inicio: '15:00', fin: '17:00' }])
    expect(r.eventualesFijos).toContain('ev-T1|0')
    const caja = r.cajaEventual!.find(e => e.colaboradorId === 'ev-T1')!.slotsCajaPorDia[0]
    expect(caja.slice(14, 18)).toEqual([true, true, true, true])
    expect(caja.filter(Boolean)).toHaveLength(4)
    coherente(r, ON, r.eventualesFijos)
    // Una edición posterior de otra persona no lo pisa
    const r2 = editar(r, 'aux-A', 0, [{ inicio: '08:00', fin: '14:00' }])
    expect(r2.cajaEventual!.find(e => e.colaboradorId === 'ev-T1')!.slotsCajaPorDia[0]).toEqual(caja)
  })

  it('un eventual fijado a mano donde ya no hay déficit, en la apertura o fuera de su disponibilidad → BORRADOR con la causa', () => {
    const r0 = base()
    const sinDeficit = editar(r0, 'ev-08', 3, [{ inicio: '08:00', fin: '09:00' }, { inicio: '12:00', fin: '16:00' }])
    const v = validar(sinDeficit)
    expect(v.publicable).toBe(false)
    expect(v.violaciones.find(x => x.codigo === 'OP_APERTURA_COMPOSICION')?.dia).toBe(3)
    expect(estadoValidacion(v)).toMatch(/^BORRADOR/)
    // Sin déficit: un slot donde FULL/PART ya cubren la demanda
    const hueco = DIAS.flatMap(d => Array.from({ length: 14 }, (_, i) => ({ d, s: i + 2 })))
      .find(({ d, s }) => { const c = composicion(r0, d, s); return c.fullPart >= demanda(d, s) && !c.eventual.length && !c.aux.length })!
    const hora = (x: number) => `${String(8 + Math.floor(x / 2)).padStart(2, '0')}:${x % 2 ? '30' : '00'}`
    const dup = editar(r0, 'ev-08', hueco.d, [{ inicio: hora(hueco.s), fin: hora(hueco.s + 1) }])
    expect(validar(dup).violaciones.find(x => x.codigo === 'OP_COBERTURA_DUPLICADA')?.dia).toBe(hueco.d)
    expect(dup.cajaEventual!.find(e => e.colaboradorId === 'ev-08')!.slotsCajaPorDia[hueco.d][hueco.s]).toBe(true) // no se pisa en silencio
    const fuera = editar(r0, 'ev-T2', 0, [{ inicio: '10:00', fin: '12:00' }]) // ev-T2 no está disponible el lunes
    expect(validar(fuera).violaciones.some(x => x.codigo === 'OP_EVENTUAL_FUERA_DISPONIBILIDAD' && x.dia === 0)).toBe(true)
  })

  it('sin disponibilidad registrada (semana histórica) no se reasignan eventuales: se avisa y no se inventa', () => {
    const r0 = base()
    const r = aplicarEdicionConRecalculo(r0, 'aux-A', 0, { esFranco: false, turnos: [{ inicio: '08:00', fin: '14:00' }] }, 'Aux A',
      { necesidadFranjas, operativa: ON, nombrePorId })
    expect(r.cajaEventual).toEqual(r0.cajaEventual)
    expect(r.alertas.some(a => a.includes('No se recalcularon los eventuales'))).toBe(true)
  })
})

describe('#38 semanas históricas sin datos completos', () => {
  it('sin violaciones pero con limitaciones de datos: SIN VERIFICAR, nunca VALIDADO', () => {
    const r = generar(ON)
    const v = validarResultadoSemana(r, CAJEROS_S47, AUX_S47, EVENTUALES_S47, {
      necesidad: NECESIDAD_S47, excepciones: [], operativa: ON,
      limitaciones: ['La semana no registró su configuración operativa: se revisó con las reglas vigentes hoy.'],
    })
    expect(v.violaciones).toEqual([])
    expect(v.publicable).toBe(false)
    expect(estadoValidacion(v)).toMatch(/^SIN VERIFICAR: La semana no registró su configuración operativa/)
  })
})
