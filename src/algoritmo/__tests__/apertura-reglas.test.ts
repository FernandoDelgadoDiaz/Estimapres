// #38 — Contrato de las tres pasadas frente a las reglas operativas configurables.
import { describe, expect, it } from 'vitest'
import { validarResultadoSemana, estadoValidacion } from '../../utils/validacionSemana'
import { recalcularCajaAux } from '../../utils/recalculoAux'
import { aplicarEdicionJornada } from '../../hooks/useAsignacion'
import { generarPDF } from '../../utils/exportPDF'
import { textoPDFNode } from '../../utils/__tests__/fixtures/pdfTextoNode'
import type { Auxiliar, Eventual, ResultadoAsignacion } from '../../types'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'
import { NECESIDAD_S47, composicion, generar, presente, type Operativa } from './fixtures/aperturaHelpers'

const ON: Operativa = { ...OPERATIVA_S47, aperturaSoloAux: true }
const OFF: Operativa = { ...OPERATIVA_S47, aperturaSoloAux: false }
const DIAS = [0, 1, 2, 3, 4, 5, 6]
const demanda = (d: number, s: number) =>
  NECESIDAD_S47.find(f => f.hora === `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`)!.necesidad[d]

const validar = (r: ResultadoAsignacion, op: Operativa, aux: Auxiliar[] = AUX_S47, ev: Eventual[] = EVENTUALES_S47) =>
  validarResultadoSemana(r, CAJEROS_S47, aux, ev, { necesidad: NECESIDAD_S47, excepciones: [], operativa: op })

// Eventual disponible desde las 08:00 todos los días (el caso que generó el 2/1).
const EV_08: Eventual[] = [...EVENTUALES_S47, { id: 'ev-08', nombre: 'Eventual 08', sector: 'S4', activo: true, horarioSemanal: Array(7).fill('08:00-16:00') }]

describe('#38 apertura_solo_aux ON — 7 días × 08:00 y 08:30', () => {
  it('un solo AUX presente: lo abre él, sin FULL/PART ni eventuales (aun con eventual disponible desde 08:00)', () => {
    const r = generar(ON, AUX_S47, EV_08)
    for (const d of DIAS) for (const s of [0, 1]) {
      const c = composicion(r, d, s)
      expect(c.aux, `día ${d} slot ${s}`).toHaveLength(1)
      expect(presente(AUX_S47.find(a => a.id === c.aux[0])!.horarioSemanal, d, s)).toBe(true)
      expect(c.fullPart).toBe(0)
      expect(c.eventual).toEqual([])
    }
    expect(validar(r, ON, AUX_S47, EV_08).publicable).toBe(true)
  })

  it('varios AUX presentes: exactamente uno en caja y el resto supervisa', () => {
    const aux: Auxiliar[] = [
      { id: 'aux-X', nombre: 'Aux X', activo: true, horarioSemanal: Array(7).fill('08:00-16:00') },
      { id: 'aux-Y', nombre: 'Aux Y', activo: true, horarioSemanal: Array(7).fill('08:00-14:00|19:00-23:00') },
      { id: 'aux-Z', nombre: 'Aux Z', activo: true, horarioSemanal: Array(7).fill('14:00-23:00') },
    ]
    const r = generar(ON, aux, EV_08)
    for (const d of DIAS) for (const s of [0, 1]) expect(composicion(r, d, s)).toMatchObject({ fullPart: 0, eventual: [], aux: [expect.any(String)] })
    expect(validar(r, ON, aux, EV_08).violaciones.filter(v => v.codigo === 'OP_APERTURA_COMPOSICION')).toEqual([])
  })

  it('ningún AUX en la apertura de un día: violación bloqueante y NO se sustituye por cajero ni eventual', () => {
    const aux = AUX_S47.map(a => ({ ...a, horarioSemanal: a.horarioSemanal.map((h, d) => (d === 2 ? h.replace('08:00-14:00', '10:00-14:00') : h)) }))
    const r = generar(ON, aux, EV_08)
    for (const s of [0, 1]) expect(composicion(r, 2, s)).toEqual({ fullPart: 0, aux: [], eventual: [] })
    const v = validar(r, ON, aux, EV_08)
    expect(v.publicable).toBe(false)
    expect(v.violaciones.find(x => x.codigo === 'OP_APERTURA_COMPOSICION')?.dia).toBe(2)
    expect(estadoValidacion(v)).toMatch(/^BORRADOR/)
  })

  it('la cobertura del AUX de apertura se descuenta: con demanda 2 queda 1 faltante, nunca un eventual', () => {
    const r = generar(ON, AUX_S47, EV_08)
    for (const d of DIAS) if (demanda(d, 0) === 2) {
      expect(composicion(r, d, 0).aux).toHaveLength(1)
      expect(r.faltantesFranjas[2][d]).toBe(1) // fila 08:00
    }
  })
})

describe('#38 apertura_solo_aux OFF — 7 días × 08:00 y 08:30', () => {
  it('la abre un cajero FULL/PART; ningún AUX ni eventual en caja (aun disponibles)', () => {
    const r = generar(OFF, AUX_S47, EV_08)
    for (const d of DIAS) for (const s of [0, 1]) {
      const c = composicion(r, d, s)
      expect(c.aux, `día ${d} slot ${s}`).toEqual([])
      expect(c.eventual).toEqual([])
      expect(c.fullPart).toBeGreaterThanOrEqual(1)
    }
    expect(validar(r, OFF, AUX_S47, EV_08).publicable).toBe(true)
  })

  it('validar con el estado equivocado del toggle detecta la diferencia (el validador usa el estado efectivo)', () => {
    expect(validar(generar(OFF), ON).violaciones.some(v => v.codigo === 'OP_APERTURA_COMPOSICION')).toBe(true)
    expect(validar(generar(ON), OFF).violaciones.some(v => v.codigo === 'OP_APERTURA_COMPOSICION')).toBe(true)
  })

  it('cambio de regla entre sucursales: mismo roster y demanda, distinta composición', () => {
    const on = generar(ON), off = generar(OFF)
    expect(composicion(on, 0, 0)).toMatchObject({ fullPart: 0, aux: ['aux-A'] })
    expect(composicion(off, 0, 0)).toMatchObject({ aux: [] })
    expect(composicion(off, 0, 0).fullPart).toBeGreaterThanOrEqual(1)
  })
})

describe('#38 pasadas 2 y 3 — presencia ≠ caja, solo déficit real', () => {
  for (const [nombre, op] of [['ON', ON], ['OFF', OFF]] as const) {
    it(`${nombre}: ningún AUX ni eventual en caja fuera de su presencia/disponibilidad (turnos partidos y francos)`, () => {
      const r = generar(op, AUX_S47, EV_08)
      for (const a of r.cajaAux ?? []) a.slotsCajaPorDia.forEach((f, d) => f.forEach((x, s) => {
        if (x) expect(presente(AUX_S47.find(p => p.id === a.colaboradorId)!.horarioSemanal, d, s), `${a.colaboradorId} d${d} s${s}`).toBe(true)
      }))
      for (const e of r.cajaEventual ?? []) e.slotsCajaPorDia.forEach((f, d) => f.forEach((x, s) => {
        if (x) expect(presente(EV_08.find(p => p.id === e.colaboradorId)!.horarioSemanal, d, s), `${e.colaboradorId} d${d} s${s}`).toBe(true)
      }))
    })

    it(`${nombre}: AUX/eventual en caja solo donde FULL/PART no alcanzan (sin cobertura duplicada) y nunca más de la demanda`, () => {
      const r = generar(op, AUX_S47, EV_08)
      for (const d of DIAS) for (let s = 0; s < 29; s++) {
        const c = composicion(r, d, s)
        const apoyo = c.aux.length + c.eventual.length - (op.aperturaSoloAux && s < 2 ? 1 : 0)
        if (apoyo > 0) expect(c.fullPart + c.aux.length + c.eventual.length, `d${d} s${s}`).toBeLessThanOrEqual(demanda(d, s))
      }
      expect(validar(r, op, AUX_S47, EV_08).violaciones.filter(v => v.codigo === 'OP_COBERTURA_DUPLICADA')).toEqual([])
    })

    it(`${nombre}: 09:00–22:00 siempre queda ≥1 AUX parado supervisando cuando hay presencia`, () => {
      const r = generar(op)
      for (const d of DIAS) for (let s = 2; s <= 27; s++) {
        const presentes = AUX_S47.filter(a => presente(a.horarioSemanal, d, s)).map(a => a.id)
        if (!presentes.length) continue
        const enCaja = composicion(r, d, s).aux
        expect(presentes.filter(id => !enCaja.includes(id)).length, `d${d} s${s}`).toBeGreaterThanOrEqual(1)
      }
    })
  }

  it('un AUX nunca pasa a CAJA sin déficit: con FULL/PART que cubren todo, solo queda la apertura obligatoria', () => {
    const r = generar(ON)
    // Demanda = exactamente lo que cubren los FULL/PART (déficit 0) + 1 en la apertura.
    const justa = NECESIDAD_S47.map(f => f.necesidad.map((_, d) => {
      const [h, m] = f.hora.split(':').map(Number)
      const s = (h - 8) * 2 + (m ? 1 : 0)
      return s < 0 ? 0 : s < 2 ? 1 : composicion(r, d, s).fullPart
    }))
    const caja = recalcularCajaAux(r.horarios, justa, {}, ON)!
    expect(caja).not.toBeNull()
    for (const d of DIAS) expect(caja.filter(a => a.slotsCajaPorDia[d][0] && a.slotsCajaPorDia[d][1])).toHaveLength(1)
    for (const a of caja) a.slotsCajaPorDia.forEach(f => expect(f.slice(2).some(Boolean)).toBe(false))
  })

  it('supervisor_jornada_completa ON: con 2+ AUX simultáneos, uno queda parado toda su jornada (salvo apertura)', () => {
    const r = generar(ON)
    expect(validar(r, ON).violaciones.filter(v => v.codigo === 'OP_SUPERVISOR_JORNADA')).toEqual([])
    for (const d of DIAS) {
      const presentesDia = AUX_S47.filter(a => a.horarioSemanal[d])
      if (presentesDia.length < 2) continue
      const sinCajaTrasApertura = presentesDia.filter(a => !(r.cajaAux?.find(c => c.colaboradorId === a.id)?.slotsCajaPorDia[d] ?? []).some((x, s) => x && s >= 2))
      expect(sinCajaTrasApertura.length, `día ${d}`).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('#38 revalidación después de ediciones manuales', () => {
  it('poner un eventual en la apertura → BORRADOR (composición y cobertura duplicada)', () => {
    const r = generar(ON, AUX_S47, EV_08)
    const editado: ResultadoAsignacion = {
      ...r,
      cajaEventual: [...(r.cajaEventual ?? []).filter(e => e.colaboradorId !== 'ev-08'),
        { colaboradorId: 'ev-08', nombre: 'Eventual 08', slotsCajaPorDia: DIAS.map(() => Array(30).fill(false).map((_, s) => s < 2)) }],
    }
    const v = validar(editado, ON, AUX_S47, EV_08)
    expect(v.publicable).toBe(false)
    expect(v.violaciones.filter(x => x.codigo === 'OP_APERTURA_COMPOSICION')).toHaveLength(7)
  })

  it('editar la presencia de un AUX recalcula su CAJA con la configuración de la semana y nunca deja CAJA fuera de presencia', () => {
    const r = generar(ON)
    // Lunes: aux-A pasa a entrar 10:00 → nadie abre ese día
    const horarios = aplicarEdicionJornada(r.horarios, 'aux-A', 0, { esFranco: false, turnos: [{ inicio: '10:00', fin: '14:00' }, { inicio: '20:00', fin: '23:00' }] })
    const cajaAux = recalcularCajaAux(horarios, NECESIDAD_S47.map(f => f.necesidad), {}, ON)!
    const aA = cajaAux.find(a => a.colaboradorId === 'aux-A')!
    expect(aA.slotsCajaPorDia[0].slice(0, 4).some(Boolean)).toBe(false)
    const v = validar({ ...r, horarios, cajaAux }, ON)
    expect(v.violaciones.filter(x => x.codigo === 'OP_AUX_FUERA_PRESENCIA')).toEqual([])
    expect(v.violaciones.find(x => x.codigo === 'OP_APERTURA_COMPOSICION')?.dia).toBe(0)
    expect(v.publicable).toBe(false)
  })

  it('snapshot de CAJA viejo tras editar la presencia (sin recalcular) → BORRADOR por AUX fuera de presencia', () => {
    const r = generar(ON)
    const horarios = aplicarEdicionJornada(r.horarios, 'aux-A', 0, { esFranco: true, turnos: [] })
    const v = validar({ ...r, horarios }, ON)
    expect(v.violaciones.some(x => x.codigo === 'OP_AUX_FUERA_PRESENCIA' && x.dia === 0)).toBe(true)
  })

  it('AUX en caja después de las 22:00 con sin_aux_cierre ON → BORRADOR', () => {
    const r = generar(ON)
    const cajaAux = (r.cajaAux ?? []).map(a => a.colaboradorId === 'aux-A' ? { ...a, slotsCajaPorDia: a.slotsCajaPorDia.map((f, d) => f.map((x, s) => x || (d === 0 && s === 28))) } : a)
    expect(validar({ ...r, cajaAux }, ON).violaciones.some(x => x.codigo === 'OP_AUX_CIERRE')).toBe(true)
  })

  it('categoría incorrecta: un cajero FULL cargado como AUX en caja → BORRADOR', () => {
    const r = generar(ON)
    const cajaAux = [...(r.cajaAux ?? []), { colaboradorId: 'full-A', nombre: 'Full A', slotsCajaPorDia: DIAS.map(() => Array(30).fill(false).map((_, s) => s === 10)) }]
    expect(validar({ ...r, cajaAux }, ON).violaciones.some(x => x.codigo === 'OP_CATEGORIA')).toBe(true)
  })
})

describe('#38 PDF', () => {
  it('una semana que incumple la apertura sale como BORRADOR en el PDF; la corregida, VALIDADO', async () => {
    const r = generar(ON)
    const malo: ResultadoAsignacion = { ...r, cajaEventual: (r.cajaEventual ?? []).map(e => e.colaboradorId === 'ev-M' ? { ...e, slotsCajaPorDia: e.slotsCajaPorDia.map((f, d) => f.map((x, s) => x || (d !== 5 && s < 2))) } : e) }
    for (const [res, esperado] of [[malo, /Estado: BORRADOR/], [r, /Estado: VALIDADO/]] as const) {
      const v = validar(res, ON)
      const pdf = generarPDF(res, CAJEROS_S47, 'S47', AUX_S47, EVENTUALES_S47, { sucursal: '000', validacion: v, estado: estadoValidacion(v) })
      const texto = (await textoPDFNode(new Uint8Array(pdf.output('arraybuffer')))).replace(/\s+/g, ' ')
      expect(texto).toMatch(esperado)
      if (res === malo) expect(texto).toContain('OP_APERTURA_COMPOSICION')
    }
  })
})
