// AH2-057 · Ausencias sobre un horario ya comunicado: dos propuestas, congelamiento y validación.
import { describe, expect, it } from 'vitest'
import { validarResultadoSemana } from '../../utils/validacionSemana'
import type { AusenciaCargada, ResultadoAsignacion } from '../../types'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../../algoritmo/__tests__/fixtures/semana47Anonimizada'
import { NECESIDAD_S47, LUNES_S47, generar } from '../../algoritmo/__tests__/fixtures/aperturaHelpers'
import { proponerCobertura, type EntradaReparacion } from '../reparar'
import { ausenciasDeHorarios } from '../ausencias'

const ON = { ...OPERATIVA_S47, aperturaSoloAux: true }
const necesidadFranjas = NECESIDAD_S47.map(f => f.necesidad)
const nombrePorId = Object.fromEntries([...CAJEROS_S47, ...AUX_S47, ...EVENTUALES_S47].map(p => [p.id, p.nombre]))
const aMatriz = (hs: string[]) => Array.from({ length: 7 }, (_, d) => Array.from({ length: 30 }, (_, s) => {
  const t = 8 * 60 + s * 30
  return (hs[d] ?? '').split('|').filter(Boolean).some(r => { const [a, b] = r.split('-').map(x => +x.split(':')[0] * 60 + +x.split(':')[1]); return a <= t && t < b })
}))
const validar = (r: ResultadoAsignacion) => validarResultadoSemana(r, CAJEROS_S47, AUX_S47, EVENTUALES_S47, { necesidad: NECESIDAD_S47, excepciones: [], operativa: ON }).violaciones
const sumar = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

const base = generar(ON, AUX_S47, EVENTUALES_S47)

function entrada(colaboradorId: string, desde: number, hasta: number, aviso: number): EntradaReparacion {
  const ausencia: AusenciaCargada = { id: 'a1', colaboradorId, nombre: nombrePorId[colaboradorId], desde: sumar(LUNES_S47, desde), hasta: sumar(LUNES_S47, hasta), motivo: 'Enfermedad', aviso: sumar(LUNES_S47, aviso) }
  return {
    base, fechaLunes: LUNES_S47, ausencia, necesidadFranjas, operativa: ON, nombrePorId,
    disponibilidadEventual: Object.fromEntries(EVENTUALES_S47.map(e => [e.id, aMatriz(e.horarioSemanal)])),
    topesEventualSlots: Object.fromEntries(EVENTUALES_S47.map(e => [e.id, 24])),
    validar, presupuestoMs: 20000,
  }
}

const full = CAJEROS_S47.find(c => c.tipo === 'FULL')!

describe('AH2-057 · cobertura de ausencias', () => {
  it('la semana base es válida (precondición)', () => {
    expect(validar(base)).toEqual([])
  })

  it('aviso el martes por miércoles a viernes: no toca lunes ni martes, acredita el contrato y no agrega violaciones', () => {
    const r = proponerCobertura(entrada(full.id, 2, 4, 1))
    expect(r.diasAusente).toEqual([2, 3, 4])
    expect(r.diasModificables).toEqual([2, 3, 4])
    for (const p of [r.menorImpacto, r.mejorCobertura]) {
      expect(p.violaciones).toEqual([])
      for (const d of [0, 1]) for (const h of base.horarios) {
        expect(p.plan.horarios.find(x => x.colaboradorId === h.colaboradorId)!.jornadas[d]).toEqual(h.jornadas[d])
      }
      for (const a of base.cajaAux ?? []) for (const d of [0, 1]) expect(p.plan.cajaAux!.find(x => x.colaboradorId === a.colaboradorId)!.slotsCajaPorDia[d]).toEqual(a.slotsCajaPorDia[d])
      // La ausente no trabaja esos días y su jornada comunicada queda guardada.
      const fila = p.plan.horarios.find(h => h.colaboradorId === full.id)!
      for (const d of [2, 3, 4]) expect(fila.jornadas[d].turnos).toEqual([])
      expect(ausenciasDeHorarios(p.plan.horarios).length).toBeGreaterThan(0)
      // Nunca más faltante que sin cambios; ninguna jornada FULL/PART cambia de duración.
      expect(p.faltante).toBeLessThanOrEqual(r.faltanteSinCambios)
      for (const h of p.plan.horarios.filter(x => x.rolGeneral === 'cajero')) {
        const o = base.horarios.find(x => x.colaboradorId === h.colaboradorId)!
        const horas = (x: typeof h) => x.jornadas.map(j => j.ausencia ? j.ausencia.horasOriginales : j.esFranco ? 0 : j.horas).sort()
        expect(horas(h)).toEqual(horas(o))
      }
    }
    // Menor impacto no mueve francos.
    expect(r.menorImpacto.francosMovidos).toBe(0)
    expect(r.mejorCobertura.faltante).toBeLessThanOrEqual(r.menorImpacto.faltante)
  })

  it('el día del aviso no se replanifica aunque la ausencia empiece ese día', () => {
    const r = proponerCobertura(entrada(full.id, 1, 2, 1))
    expect(r.diasAusente).toEqual([1, 2])
    expect(r.diasModificables).toEqual([2])
    for (const p of [r.menorImpacto, r.mejorCobertura]) expect(p.cambios.every(c => c.dia >= 2)).toBe(true)
  })

  it('una ausencia de un eventual retira su caja y su disponibilidad esos días', () => {
    const ev = (base.cajaEventual ?? []).find(e => e.slotsCajaPorDia.some((f, d) => d >= 3 && f.some(Boolean)))
    if (!ev) return
    const r = proponerCobertura(entrada(ev.colaboradorId, 3, 6, 2))
    for (const p of [r.menorImpacto, r.mejorCobertura]) {
      const caja = p.plan.cajaEventual!.find(e => e.colaboradorId === ev.colaboradorId)!
      for (const d of [3, 4, 5, 6]) expect(caja.slotsCajaPorDia[d].some(Boolean)).toBe(false)
      expect(p.violaciones).toEqual([])
    }
  })
})

describe('AH2-057 · «mejor cobertura» puede mover francos', () => {
  it('con un día de la ausencia muy cargado y otro posterior sin demanda, trae trabajo moviendo un franco', () => {
    // Miércoles (2) con +2 cajas en toda la jornada; sábado (5) sin demanda: hay de dónde traer.
    const nec = necesidadFranjas.map(f => f.map((n, d) => d === 2 ? n + 2 : d === 5 ? 0 : n))
    const conFranco = base.horarios.filter(h => h.rolGeneral === 'cajero' && h.jornadas[2].esFranco).map(h => h.colaboradorId)
    const ausente = CAJEROS_S47.find(c => !conFranco.includes(c.id) && base.horarios.find(h => h.colaboradorId === c.id)!.jornadas[2].turnos.length)!
    const e = { ...entrada(ausente.id, 2, 2, 1), necesidadFranjas: nec,
      validar: (r: ResultadoAsignacion) => validarResultadoSemana(r, CAJEROS_S47, AUX_S47, EVENTUALES_S47, { necesidad: NECESIDAD_S47.map((f, i) => ({ ...f, necesidad: nec[i] })), excepciones: [], operativa: ON }).violaciones }
    const r = proponerCobertura(e)
    expect(conFranco.length).toBeGreaterThan(0)
    expect(r.menorImpacto.francosMovidos).toBe(0)
    expect(r.mejorCobertura.francosMovidos).toBeGreaterThan(0)
    expect(r.mejorCobertura.faltante).toBeLessThan(r.menorImpacto.faltante)
    expect(r.coinciden).toBe(false)
    expect(r.mejorCobertura.violaciones.filter(v => !e.validar(r.sinCambios).some(b => b.codigo === v.codigo && b.dia === v.dia && b.colaboradorId === v.colaboradorId))).toEqual([])
    // Ningún día anterior al aviso + 1 cambia.
    expect(r.mejorCobertura.cambios.every(c => c.dia >= 2)).toBe(true)
  })
})

describe('AH2-057 · validador y versión aprobada', () => {
  it('una FULL ausente no rompe su composición (se acredita), pero sin la marca de ausencia sí', async () => {
    const { marcarAusente } = await import('../ausencias')
    const fila = base.horarios.find(h => h.colaboradorId === full.id)!
    const d = fila.jornadas.findIndex(j => !j.esFranco && j.turnos.length)
    const conAusencia = { ...base, horarios: base.horarios.map(h => h.colaboradorId !== full.id ? h : { ...h, jornadas: h.jornadas.map(j => j.dia === d ? marcarAusente(j, 'Enfermedad') : j) }) }
    expect(validar(conAusencia).filter(v => v.colaboradorId === full.id)).toEqual([])
    const sinMarca = { ...conAusencia, horarios: conAusencia.horarios.map(h => h.colaboradorId !== full.id ? h : { ...h, jornadas: h.jornadas.map(j => { const { ausencia: _a, ...x } = j; void _a; return x }) }) }
    expect(validar(sinMarca).some(v => v.colaboradorId === full.id)).toBe(true)
    // Marcada ausente pero con turnos cargados: contradicción explícita.
    const contradictoria = { ...conAusencia, horarios: conAusencia.horarios.map(h => h.colaboradorId !== full.id ? h : { ...h, jornadas: h.jornadas.map(j => j.dia === d ? { ...j, esFranco: false, turnos: [{ inicio: '10:00', fin: '14:00' }], horas: 4 } : j) }) }
    expect(validar(contradictoria).some(v => v.codigo === 'DATOS_AUSENCIA_CON_TURNOS')).toBe(true)
  })

  it('la versión aprobada hereda la semana, registra motivo, aprobador y hora, y anula la disponibilidad del ausente', async () => {
    const { versionPorContingencia, notaContingencia } = await import('../semana')
    const ev = EVENTUALES_S47[0]
    const r = proponerCobertura(entrada(ev.id, 3, 4, 2))
    const semana = { id: 's', fechaLunes: LUNES_S47, version: 4, descripcion: 'Semana', generadoEl: '2026-11-20T10:00:00Z', editadoManualmente: false,
      horarios: base.horarios, resumenPorColaborador: {}, disponibilidadSemana: { [ev.id]: ev.horarioSemanal }, necesidadFranjas }
    const datos = versionPorContingencia(semana, r.menorImpacto, r.menorImpacto.plan ? { id: 'a1', colaboradorId: ev.id, nombre: ev.nombre, desde: sumar(LUNES_S47, 3), hasta: sumar(LUNES_S47, 4), motivo: 'Licencia', aviso: sumar(LUNES_S47, 2) } : (null as never), r.diasAusente, 'Aux A', () => ({}), new Date('2026-11-22T15:00:00Z'))
    expect(datos).not.toHaveProperty('id')
    expect(datos).not.toHaveProperty('version')
    expect(datos.contingencia).toMatchObject({ aprobadoPor: 'Aux A', aprobadoEl: '2026-11-22T15:00:00.000Z', basadaEnVersion: 4, opcion: 'menor_impacto' })
    expect(datos.ausencias).toHaveLength(1)
    expect(datos.disponibilidadSemana![ev.id][3]).toBe('')
    expect(datos.disponibilidadSemana![ev.id][4]).toBe('')
    expect(datos.disponibilidadSemana![ev.id][2]).toBe(ev.horarioSemanal[2])
    expect(notaContingencia({ ...datos, version: 5 })).toContain('aprobada por Aux A')
    expect(notaContingencia({ ...datos, version: 5 })).toContain('Reemplaza a la versión 4')
  })
})
