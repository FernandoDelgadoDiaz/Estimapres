// #7 / #44 tramo A — Contrato de horas PART: una sola definición para motor,
// reglas, validador, UI y PDF. Datos sintéticos / semana 47 anonimizada.
import { describe, expect, it } from 'vitest'
import {
  PERFIL_HORAS_VIGENTE, PERFIL_HORAS_HISTORICO_31, perfilHorasDeSemana, resolverContratoHoras, aSlots,
} from '../contratos'
import { convertirInputAV2, convertirOutputDeV2 } from '../adapter'
import { ejecutarAlgoritmo } from '../orquestador'
import { PERFIL_MOTOR_ACTUAL, PERFIL_MOTOR_HISTORICO_31, perfilNormativoDeSemana } from '../validadorIndependiente'
import { validarResultadoSemana } from '../../utils/validacionSemana'
import { filasHorariosCaja } from '../../utils/exportPDF'
import { aplicarEdicionJornada } from '../../hooks/useAsignacion'
import type { Colaborador, ExcepcionSemanal, ResultadoAsignacion } from '../../types'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'
import { NECESIDAD_S47 } from './fixtures/aperturaHelpers'
import type { PerfilHorasContrato } from '../contratos'

const PARTS = CAJEROS_S47.filter(c => c.tipo === 'PART')
const horasDe = (r: ResultadoAsignacion, id: string) => r.horarios.find(h => h.colaboradorId === id)!.totalHoras

function generar(op = OPERATIVA_S47, cajeros: Colaborador[] = CAJEROS_S47, perfilHoras?: PerfilHorasContrato, excepciones: ExcepcionSemanal[] = []) {
  const input = convertirInputAV2(NECESIDAD_S47, cajeros, AUX_S47, EVENTUALES_S47, excepciones, { ...op, perfilHoras })
  return convertirOutputDeV2(ejecutarAlgoritmo(input), cajeros, AUX_S47, EVENTUALES_S47)
}
const validar = (r: ResultadoAsignacion, cajeros = CAJEROS_S47, perfil = PERFIL_MOTOR_ACTUAL, excepciones: ExcepcionSemanal[] = [], operativa = OPERATIVA_S47) =>
  validarResultadoSemana(r, cajeros, AUX_S47, EVENTUALES_S47, { necesidad: NECESIDAD_S47, excepciones, operativa, perfil })

describe('contrato de horas: definición única', () => {
  it('objetivo = ficha, tope = min(ficha, máximo del perfil); avisos si la ficha es inválida o excesiva', () => {
    expect(resolverContratoHoras('PART', 32)).toMatchObject({ objetivoHoras: 32, maximoHoras: 32, topeHoras: 32, avisos: [] })
    expect(resolverContratoHoras('PART', 30)).toMatchObject({ objetivoHoras: 30, maximoHoras: 32, topeHoras: 30 })
    expect(resolverContratoHoras('PART', 30.75)).toMatchObject({ objetivoHoras: 30.5 }) // grilla de 30 min
    const excesiva = resolverContratoHoras('PART', 36)
    expect(excesiva).toMatchObject({ objetivoHoras: 32, topeHoras: 32 })
    expect(excesiva.avisos[0]).toMatch(/36 h .* máximo PART del perfil es 32 h/)
    expect(resolverContratoHoras('PART', 0)).toMatchObject({ estadoFicha: 'invalida', objetivoHoras: null, topeHoras: 32 })
    expect(resolverContratoHoras('PART', 32, PERFIL_HORAS_HISTORICO_31)).toMatchObject({ objetivoHoras: 31, topeHoras: 31 })
    expect(aSlots(resolverContratoHoras('PART', 32))).toEqual({ objetivoSlots: 64, maximoSlots: 64, estadoFicha: 'valida' })
  })

  it('motor, reglas y validador derivan del mismo perfil', () => {
    expect(PERFIL_MOTOR_ACTUAL.contratos.PART.horasSemanaMax).toBe(PERFIL_HORAS_VIGENTE.maximoHoras.PART)
    expect(PERFIL_MOTOR_HISTORICO_31.contratos.PART.horasSemanaMax).toBe(31)
    expect(PERFIL_MOTOR_ACTUAL.contratos.FULL).toEqual(PERFIL_MOTOR_HISTORICO_31.contratos.FULL) // FULL sin cambios
    expect(perfilHorasDeSemana(undefined)).toBe(PERFIL_HORAS_HISTORICO_31) // semanas viejas: perfil histórico
    expect(perfilNormativoDeSemana(PERFIL_HORAS_VIGENTE.id).contratos.PART.horasSemanaMax).toBe(32)
  })
})

describe('semana 47 anonimizada — cinco PART con objetivo de 32 h', () => {
  for (const ap of [true, false]) for (const fm of [true, false]) {
    const op = { ...OPERATIVA_S47, aperturaSoloAux: ap, francoMedioCorridos: fm }
    describe(`apertura solo AUX ${ap ? 'ON' : 'OFF'} · franco y medio corridos ${fm ? 'ON' : 'OFF'}`, () => {
      const nuevo = generar(op)
      const anterior = generar(op, CAJEROS_S47, PERFIL_HORAS_HISTORICO_31)

      it('cada PART recibe sus 32 h (antes: 31 h como máximo) y los FULL siguen en 48 h', () => {
        for (const p of PARTS) {
          expect(horasDe(nuevo, p.id), p.id).toBe(32)
          expect(horasDe(anterior, p.id)).toBeLessThanOrEqual(31)
        }
        for (const f of CAJEROS_S47.filter(c => c.tipo === 'FULL')) expect(horasDe(nuevo, f.id)).toBe(48)
        expect(nuevo.cumplimientoHoras!.filter(c => c.tipo === 'PART').every(c => c.diferenciaHoras === 0)).toBe(true)
      })

      it('el validador acepta las 32 h y el horario completo (descansos, francos, apertura, H-A2) sigue VALIDADO', () => {
        const v = validar(nuevo, CAJEROS_S47, PERFIL_MOTOR_ACTUAL, [], op)
        expect(v.violaciones).toEqual([])
        expect(v.publicable).toBe(true)
      })

      it('las horas del PDF coinciden con las jornadas asignadas', () => {
        const filas = filasHorariosCaja(nuevo, new Map(CAJEROS_S47.map(c => [c.id, { nombre: c.nombre, tipo: c.tipo }])))
        for (const p of PARTS) expect(filas.find(f => f.colaboradorId === p.id)!.horas).toBe(32)
      })

      it('la cobertura no empeora respecto del motor anterior', () => {
        expect(nuevo.porcentajeCobertura).toBeGreaterThanOrEqual(anterior.porcentajeCobertura - 1e-9)
        const faltan = (r: ResultadoAsignacion) => r.faltantesFranjas.flat().reduce((a, b) => a + b, 0)
        expect(faltan(nuevo)).toBeLessThanOrEqual(faltan(anterior))
      })
    })
  }
})

describe('objetivos alcanzables e inalcanzables', () => {
  it('una ficha de 31 h se cumple exacta: no se asigna por encima de la ficha', () => {
    const cajeros = CAJEROS_S47.map(c => (c.id === 'part-A' ? { ...c, horasSemanales: 31 } : c))
    const r = generar(OPERATIVA_S47, cajeros)
    expect(horasDe(r, 'part-A')).toBe(31)
    expect(validar(r, cajeros).violaciones.filter(v => v.codigo === 'OP_HORAS_FICHA')).toEqual([])
  })

  it('objetivo inalcanzable por una regla propia: se asigna el máximo factible y se explica el motivo', () => {
    const excepciones: ExcepcionSemanal[] = [{ id: 'x1', colaboradorNombre: 'Part A', tipo: 'no_despues_de', valor: '13:00', descripcion: 'sale antes de las 13' }]
    const r = generar(OPERATIVA_S47, CAJEROS_S47, undefined, excepciones)
    // Mañana 09:00–13:00 (4 h) × 6 días = 24 h: es todo lo que permiten sus reglas.
    expect(horasDe(r, 'part-A')).toBe(24)
    const c = r.cumplimientoHoras!.find(x => x.colab_id === 'part-A')!
    expect(c).toMatchObject({ objetivoHoras: 32, asignadasHoras: 24, diferenciaHoras: 8, factibleHoras: 24 })
    expect(c.motivo).toMatch(/permiten como máximo 24 h.*sale antes de las 13/)
    expect(r.alertas.some(a => a.includes('Horas PART (Part A): 24 h de 32 h objetivo'))).toBe(true)
    // No se relaja ninguna regla: la salida sigue sin violaciones y el validador avisa el faltante.
    const v = validar(r, CAJEROS_S47, PERFIL_MOTOR_ACTUAL, excepciones)
    expect(v.violaciones).toEqual([])
    expect(v.advertencias?.some(a => /Part A: 24 h asignadas de 32 h objetivo \(faltan 8 h\)/.test(a))).toBe(true)
    // Los demás PART siguen cumpliendo sus 32 h.
    for (const p of PARTS.filter(x => x.id !== 'part-A')) expect(horasDe(r, p.id)).toBe(32)
  })

  it('objetivo imposible (ninguna semana válida): diagnóstico explícito, sin inventar jornadas', () => {
    const excepciones: ExcepcionSemanal[] = [{ id: 'x2', colaboradorNombre: 'Part B', tipo: 'no_despues_de', valor: '12:00', descripcion: 'sale a las 12' }]
    const r = generar(OPERATIVA_S47, CAJEROS_S47, undefined, excepciones)
    const c = r.cumplimientoHoras!.find(x => x.colab_id === 'part-B')!
    expect(c.asignadasHoras).toBe(0)
    expect(c.motivo).toMatch(/No existe ninguna semana PART válida/)
  })
})

describe('compatibilidad histórica y edición manual', () => {
  it('una semana generada con el motor anterior (31 h) sigue siendo válida con su perfil y con el vigente', () => {
    const anterior = generar(OPERATIVA_S47, CAJEROS_S47, PERFIL_HORAS_HISTORICO_31)
    expect(validar(anterior, CAJEROS_S47, perfilNormativoDeSemana(undefined)).violaciones.filter(v => v.codigo.startsWith('NORM_'))).toEqual([])
    expect(validar(anterior, CAJEROS_S47, PERFIL_MOTOR_ACTUAL).violaciones.filter(v => v.codigo.startsWith('NORM_'))).toEqual([])
  })

  it('una semana con 32 h validada con el perfil histórico (31 h) se marca: cada semana usa su propio perfil', () => {
    const nuevo = generar(OPERATIVA_S47)
    const v = validar(nuevo, CAJEROS_S47, PERFIL_MOTOR_HISTORICO_31)
    expect(v.violaciones.filter(x => x.codigo === 'NORM_HORAS_MAX').length).toBe(5)
  })

  it('edición manual: subir un PART a 32,5 h viola máximo y ficha; bajarlo a 30 h queda como aviso de faltante', () => {
    const r = generar(OPERATIVA_S47)
    const dia = r.horarios.find(h => h.colaboradorId === 'part-C')!.jornadas.find(j => !j.esFranco && j.horas < 6)!
    const [hi, mi] = dia.turnos[0].fin.split(':').map(Number)
    const masMedia = `${String(hi + (mi === 30 ? 1 : 0)).padStart(2, '0')}:${mi === 30 ? '00' : '30'}`
    const arriba = { ...r, horarios: aplicarEdicionJornada(r.horarios, 'part-C', dia.dia, { esFranco: false, turnos: [{ inicio: dia.turnos[0].inicio, fin: masMedia }] }) }
    const cods = validar(arriba).violaciones.map(v => v.codigo)
    expect(cods).toContain('NORM_HORAS_MAX')
    expect(cods).toContain('OP_HORAS_FICHA')
    // Bajar a un PART 2 h en un día de ≥ 6 h (queda ≥ 4 h, dentro de su jornada válida).
    const fila = r.horarios.find(h => h.rolGeneral === 'cajero' && PARTS.some(p => p.id === h.colaboradorId) && h.colaboradorId !== 'part-C' && h.jornadas.some(j => j.horas >= 6))!
    expect(fila).toBeDefined()
    const otro = fila.jornadas.find(j => j.horas >= 6)!
    const [h0, m0] = otro.turnos[0].inicio.split(':').map(Number)
    const fin = `${String(h0 + otro.horas - 2).padStart(2, '0')}:${String(m0).padStart(2, '0')}`
    const abajo = { ...r, horarios: aplicarEdicionJornada(r.horarios, fila.colaboradorId, otro.dia, { esFranco: false, turnos: [{ inicio: otro.turnos[0].inicio, fin }] }) }
    const v = validar(abajo)
    expect(v.violaciones.filter(x => x.codigo.startsWith('NORM_HORAS'))).toEqual([])
    const nombre = CAJEROS_S47.find(c => c.id === fila.colaboradorId)!.nombre
    expect(v.advertencias?.some(a => a.startsWith(`${nombre}: 30 h asignadas de 32 h objetivo (faltan 2 h)`))).toBe(true)
  })
})
