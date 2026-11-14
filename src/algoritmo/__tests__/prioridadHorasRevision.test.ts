// #7 · revisión final del tramo A (PR #45): prioridad horas vs cobertura, ficha sin
// horas, edición manual y perfil histórico desconocido. Datos sintéticos.
import { describe, expect, it } from 'vitest'
import { convertirInputAV2, convertirOutputDeV2 } from '../adapter'
import { ejecutarAlgoritmo } from '../orquestador'
import { resolverContratoHoras, resolverPerfilHorasSemana, PERFIL_HORAS_HISTORICO_31, PERFIL_HORAS_VIGENTE } from '../contratos'
import { validarResultadoSemana, estadoValidacion } from '../../utils/validacionSemana'
import { aplicarEdicionConRecalculo } from '../../hooks/useAsignacion'
import { semanaAFila, filaASemana, filaAItemRoster } from '../../utils/almacen'
import { HORAS_FRANJAS, type Colaborador, type ExcepcionSemanal, type Franja, type ResultadoAsignacion, type SemanaHistorial } from '../../types'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'
import { NECESIDAD_S47 } from './fixtures/aperturaHelpers'
import {
  DEMANDA_BAJO_95, CAJEROS_BAJO_95, EXCEPCIONES_BAJO_95,
  DEMANDA_SIN_REGLAS_PROPIAS, CAJEROS_SIN_REGLAS_PROPIAS, EXCEPCIONES_SIN_REGLAS_PROPIAS,
} from './fixtures/prioridadHorasAdversarial'

const aFranjas = (m: number[][]): Franja[] => HORAS_FRANJAS.map((hora, i) => ({ hora, necesidad: m[i] }))
function correr(necesidad: Franja[], cajeros: Colaborador[], excepciones: ExcepcionSemanal[] = [], op = OPERATIVA_S47) {
  const v2 = ejecutarAlgoritmo(convertirInputAV2(necesidad, cajeros, AUX_S47, EVENTUALES_S47, excepciones, { ...op }))
  return { v2, r: convertirOutputDeV2(v2, cajeros, AUX_S47, EVENTUALES_S47) }
}
const validar = (r: ResultadoAsignacion, cajeros: Colaborador[], necesidad: Franja[], excepciones: ExcepcionSemanal[] = [], extra = {}) =>
  validarResultadoSemana(r, cajeros, AUX_S47, EVENTUALES_S47, { necesidad, excepciones, operativa: OPERATIVA_S47, ...extra })
const horasPart = (r: ResultadoAsignacion, cajeros: Colaborador[]) =>
  cajeros.filter(c => c.tipo === 'PART').map(c => r.horarios.find(h => h.colaboradorId === c.id)!.totalHoras)

describe('1 · prioridad de horas PART frente a cobertura POM (AH2-020, PROPUESTO)', () => {
  // NO CONCLUYENTE para la política (contiene un PART infactible, P0): solo prueba que el aviso se emite.
  // La evidencia concluyente está en prioridadHorasOptimo.test.ts (escenario 121, todo validable).
  it('aviso: la cobertura informada cae bajo el 95 % y se señala el pico (caso con un PART infactible)', () => {
    const nec = aFranjas(DEMANDA_BAJO_95)
    const { v2, r } = correr(nec, CAJEROS_BAJO_95, EXCEPCIONES_BAJO_95)
    const i = v2.impacto_horas!
    expect(i.coberturaConPrioridadPct).toBeLessThan(95)
    expect(i.coberturaSinPrioridadPct).toBeGreaterThanOrEqual(95)
    expect(i.franjasPeores.some(x => x.pico)).toBe(true)
    // La prioridad NO se cambia en silencio: el PART factible cumple sus 32 h…
    expect(horasPart(r, CAJEROS_BAJO_95)).toEqual([0, 32])
    // …y el que tiene «no antes de 16:00» no puede cumplir H-P3 (≥ 2 mañanas): diagnóstico, sin inventar jornadas.
    expect(r.cumplimientoHoras!.find(c => c.colab_id === 'p0')!.motivo).toMatch(/No existe ninguna semana PART válida/)
    // …y el costo queda explícito para el supervisor.
    expect(r.alertas.some(a => /por debajo del objetivo de 95 % solo por cumplir las horas objetivo/.test(a))).toBe(true)
    expect(r.alertas.some(a => /afecta franjas pico/.test(a))).toBe(true)
    // Reglas obligatorias: la prioridad de horas no genera violaciones. Las únicas son de la
    // persona sin semana factible (sin jornadas), que dejan la semana en BORRADOR.
    const v = validar(r, CAJEROS_BAJO_95, nec, EXCEPCIONES_BAJO_95)
    expect(v.violaciones.length).toBeGreaterThan(0)
    expect(v.violaciones.every(x => x.colaboradorId === 'p0')).toBe(true)
    expect(v.publicable).toBe(false)
  })

  it('adversarial sin reglas propias: la prioridad de horas resta cobertura en un pico y agrega sobrantes evitables; se informa', () => {
    const nec = aFranjas(DEMANDA_SIN_REGLAS_PROPIAS)
    const { v2, r } = correr(nec, CAJEROS_SIN_REGLAS_PROPIAS, EXCEPCIONES_SIN_REGLAS_PROPIAS)
    const i = v2.impacto_horas!
    expect(i.coberturaConPrioridadPct).toBeLessThan(i.coberturaSinPrioridadPct)
    expect(i.sobrantesConPrioridadHoras).toBeGreaterThan(i.sobrantesSinPrioridadHoras)
    expect(r.alertas.some(a => a.startsWith('Prioridad de horas PART: cumplir las horas objetivo deja la cobertura en'))).toBe(true)
    expect(r.alertas.some(a => /agrega [\d,]+ h de sobrante en caja/.test(a))).toBe(true)
  })

  it('caso de referencia (semana 47): la prioridad no baja la cobertura; solo informa +0,5 h de sobrante', () => {
    const { v2, r } = correr(NECESIDAD_S47, CAJEROS_S47)
    const i = v2.impacto_horas!
    expect(i.coberturaConPrioridadPct).toBeGreaterThanOrEqual(i.coberturaSinPrioridadPct - 1e-9)
    expect(i.coberturaConPrioridadPct).toBeGreaterThanOrEqual(95)
    expect(r.alertas.some(a => /deja la cobertura en/.test(a))).toBe(false)
  })
})

describe('2 · ficha PART sin horas, inválida o válida', () => {
  it('distingue faltante, inválida y válida (con avisos de tope y grilla)', () => {
    expect(resolverContratoHoras('PART', undefined)).toMatchObject({ estadoFicha: 'faltante', objetivoHoras: null, topeHoras: 32 })
    expect(resolverContratoHoras('PART', null)).toMatchObject({ estadoFicha: 'faltante', objetivoHoras: null })
    for (const v of [0, -5, Number.NaN, '32' as unknown]) expect(resolverContratoHoras('PART', v)).toMatchObject({ estadoFicha: 'invalida', objetivoHoras: null })
    expect(resolverContratoHoras('PART', 36)).toMatchObject({ estadoFicha: 'valida', objetivoHoras: 32 })
    const fraccion = resolverContratoHoras('PART', 31.75)
    expect(fraccion).toMatchObject({ estadoFicha: 'valida', objetivoHoras: 31.5 })
    expect(fraccion.avisos[0]).toMatch(/grilla es de 30 min/)
  })

  it('sin horas en la ficha: no se asumen 32 h; se planifica sin objetivo y la semana queda BORRADOR con el dato a completar', () => {
    const cajeros = CAJEROS_S47.map(c => (c.id === 'part-A' ? { ...c, horasSemanales: undefined } : c))
    const { r } = correr(NECESIDAD_S47, cajeros)
    const c = r.cumplimientoHoras!.find(x => x.colab_id === 'part-A')!
    expect(c).toMatchObject({ estadoFicha: 'faltante', objetivoHoras: null, diferenciaHoras: null })
    expect(c.motivo).toMatch(/no informa horas semanales/)
    expect(r.horarios.find(h => h.colaboradorId === 'part-A')!.totalHoras).toBeLessThanOrEqual(32) // nunca más que el máximo del perfil
    const v = validar(r, cajeros, NECESIDAD_S47)
    const datos = v.violaciones.filter(x => x.codigo === 'DATOS_HORAS_FICHA')
    expect(datos.map(x => x.colaboradorId)).toEqual(['part-A'])
    expect(datos[0].detalle).toMatch(/Part A: La ficha no informa horas semanales.*Completar la ficha/)
    expect(v.publicable).toBe(false)
    expect(estadoValidacion(v)).toMatch(/^BORRADOR/)
  })

  it('ficha en 0: dato inválido, mensaje distinto y mismo bloqueo; una ficha de 36 h solo avisa', () => {
    const cajeros = CAJEROS_S47.map(c => (c.id === 'part-B' ? { ...c, horasSemanales: 0 } : c.id === 'part-C' ? { ...c, horasSemanales: 36 } : c))
    const { r } = correr(NECESIDAD_S47, cajeros)
    const v = validar(r, cajeros, NECESIDAD_S47)
    expect(v.violaciones.find(x => x.codigo === 'DATOS_HORAS_FICHA')!.detalle).toMatch(/Part B: La ficha informa «0» horas semanales, que no es un objetivo válido/)
    expect(v.violaciones.filter(x => x.colaboradorId === 'part-C')).toEqual([])
    expect(v.advertencias?.some(a => /Part C: La ficha indica 36 h y el máximo PART del perfil es 32 h/.test(a))).toBe(true)
    expect(r.horarios.find(h => h.colaboradorId === 'part-C')!.totalHoras).toBe(32)
  })

  it('carga desde Supabase: un PART sin horas queda sin dato (antes 48 h en silencio); FULL conserva 48 h', () => {
    const fila = (tipo: string, horas: number | null) => ({ id: 'x', grupo: 'cajero' as const, nombre: 'Sintético', tipo, horas_semanales: horas, horario_semanal: null, sector: null, activo: true })
    expect((filaAItemRoster('cajero', fila('PART', null)) as Colaborador).horasSemanales).toBeUndefined()
    expect((filaAItemRoster('cajero', fila('PART', 32)) as Colaborador).horasSemanales).toBe(32)
    expect((filaAItemRoster('cajero', fila('FULL', null)) as Colaborador).horasSemanales).toBe(48)
  })
})

describe('3 · edición manual y cumplimiento de horas', () => {
  const nombrePorId = Object.fromEntries([...CAJEROS_S47, ...AUX_S47, ...EVENTUALES_S47].map(p => [p.id, p.nombre]))
  const ctx = {
    necesidadFranjas: NECESIDAD_S47.map(f => f.necesidad), operativa: OPERATIVA_S47, nombrePorId,
    disponibilidad: Object.fromEntries([...AUX_S47, ...EVENTUALES_S47].map(p => [p.id, p.horarioSemanal])),
  }

  it('acortar una jornada PART recalcula cumplimiento, avisos y descarta el impacto previo; restaurarla vuelve a cumplir', () => {
    const { r: r0 } = correr(NECESIDAD_S47, CAJEROS_S47)
    expect(r0.cumplimientoHoras!.find(c => c.colab_id === 'part-D')!.asignadasHoras).toBe(32)
    expect(r0.impactoHoras).toBeDefined()
    const j = r0.horarios.find(h => h.colaboradorId === 'part-D')!.jornadas.find(x => !x.esFranco && x.horas >= 5)!
    const [h0, m0] = j.turnos[0].inicio.split(':').map(Number)
    const fin = `${String(h0 + j.horas - 1).padStart(2, '0')}:${String(m0).padStart(2, '0')}`
    const r1 = aplicarEdicionConRecalculo(r0, 'part-D', j.dia, { esFranco: false, turnos: [{ inicio: j.turnos[0].inicio, fin }] }, 'Part D', ctx)
    const c1 = r1.cumplimientoHoras!.find(c => c.colab_id === 'part-D')!
    expect(c1).toMatchObject({ asignadasHoras: 31, diferenciaHoras: 1, factibleHoras: undefined })
    expect(c1.motivo).toMatch(/modificadas manualmente/)
    expect(r1.impactoHoras).toBeUndefined()
    expect(r1.alertas.some(a => a.startsWith('Horas PART (Part D): 31 h de 32 h objetivo'))).toBe(true)
    expect(r1.alertas.some(a => a.startsWith('Prioridad de horas PART:'))).toBe(false)
    expect(validar(r1, CAJEROS_S47, NECESIDAD_S47).advertencias?.some(a => a.startsWith('Part D: 31 h asignadas de 32 h objetivo'))).toBe(true)
    // Restaurar la jornada: el aviso desaparece (no queda un resultado viejo).
    const r2 = aplicarEdicionConRecalculo(r1, 'part-D', j.dia, { esFranco: false, turnos: j.turnos }, 'Part D', ctx)
    expect(r2.cumplimientoHoras!.find(c => c.colab_id === 'part-D')!).toMatchObject({ asignadasHoras: 32, diferenciaHoras: 0 })
    expect(r2.alertas.some(a => a.startsWith('Horas PART (Part D)'))).toBe(false)
  })

  it('lo persistido tras la edición es el cumplimiento nuevo (ida y vuelta por la fila de Supabase)', () => {
    const { r: r0 } = correr(NECESIDAD_S47, CAJEROS_S47)
    const j = r0.horarios.find(h => h.colaboradorId === 'part-E')!.jornadas.find(x => !x.esFranco && x.horas >= 5)!
    const [h0, m0] = j.turnos[0].inicio.split(':').map(Number)
    const r1 = aplicarEdicionConRecalculo(r0, 'part-E', j.dia, { esFranco: false, turnos: [{ inicio: j.turnos[0].inicio, fin: `${String(h0 + j.horas - 1).padStart(2, '0')}:${String(m0).padStart(2, '0')}` }] }, 'Part E', ctx)
    const semana: SemanaHistorial = {
      id: 's', fechaLunes: '2026-11-16', version: 1, descripcion: 'S', generadoEl: '2026-11-14T00:00:00Z',
      resumenPorColaborador: {}, horarios: r1.horarios, editadoManualmente: true,
      cumplimientoHoras: r1.cumplimientoHoras, perfilHorasId: PERFIL_HORAS_VIGENTE.id,
    }
    const vuelta = filaASemana({ ...semanaAFila(semana), created_at: '2026-11-14T00:00:00Z' })
    expect(vuelta.perfilHorasId).toBe(PERFIL_HORAS_VIGENTE.id)
    expect(vuelta.cumplimientoHoras!.find(c => c.colab_id === 'part-E')).toMatchObject({ asignadasHoras: 31, diferenciaHoras: 1 })
  })
})

describe('4 · perfil histórico desconocido', () => {
  it('sin identificador → histórico 31 h; conocido → ese; desconocido → marcado, nunca adivinado', () => {
    expect(resolverPerfilHorasSemana(undefined)).toEqual({ perfil: PERFIL_HORAS_HISTORICO_31, estado: 'historico' })
    expect(resolverPerfilHorasSemana(PERFIL_HORAS_VIGENTE.id)).toEqual({ perfil: PERFIL_HORAS_VIGENTE, estado: 'registrado' })
    expect(resolverPerfilHorasSemana('horas-2099-desconocido').estado).toBe('desconocido')
  })

  it('una semana con perfilHorasId desconocido queda SIN VERIFICAR aunque no tenga violaciones', () => {
    const { r } = correr(NECESIDAD_S47, CAJEROS_S47)
    const v = validar(r, CAJEROS_S47, NECESIDAD_S47, [], { perfilHorasId: 'horas-2099-desconocido' })
    expect(v.violaciones).toEqual([])
    expect(v.publicable).toBe(false)
    expect(v.limitaciones?.[0]).toMatch(/perfil de horas «horas-2099-desconocido», que esta versión no reconoce/)
    expect(estadoValidacion(v)).toMatch(/^SIN VERIFICAR/)
  })

  it('semana sin identificador (anterior al registro) se valida con 31 h; con el vigente registrado, 32 h es válido', () => {
    const { r } = correr(NECESIDAD_S47, CAJEROS_S47)
    const sinId = validar(r, CAJEROS_S47, NECESIDAD_S47, [], { perfilHorasId: undefined })
    expect(sinId.violaciones.filter(x => x.codigo === 'NORM_HORAS_MAX').length).toBe(5)
    const conId = validar(r, CAJEROS_S47, NECESIDAD_S47, [], { perfilHorasId: PERFIL_HORAS_VIGENTE.id })
    expect(conId.publicable).toBe(true)
  })
})
