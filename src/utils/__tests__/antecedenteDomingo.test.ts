import { describe, expect, it } from 'vitest'
import type { Colaborador, HorarioColaborador } from '../../types'
import { PERFIL_MOTOR_ACTUAL, validarHorario } from '../../algoritmo/validadorIndependiente'
import { entradaMinimaLunesSlots, leerAntecedenteDomingo, domingoAnteriorISO, antecedenteDesdeHistorial } from '../antecedenteDomingo'
import { convertirInputAV2 } from '../../algoritmo/adapter'
import { ejecutarAlgoritmo } from '../../algoritmo/orquestador'
import { CAJEROS_S47, AUX_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../../algoritmo/__tests__/fixtures/semana47Anonimizada'
import { NECESIDAD_S47 } from '../../algoritmo/__tests__/fixtures/aperturaHelpers'

const cajeros: Colaborador[] = [
  { id: 'full-a', nombre: 'Full A', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: 'part-b', nombre: 'Part B', tipo: 'PART', horasSemanales: 32, activo: true },
]

describe('Antecedente del domingo planificado, separado de simulaciones', () => {
  it('valida fecha, identidad y completitud FULL/PART sin incluir apoyo', () => {
    expect(domingoAnteriorISO('2026-11-23')).toBe('2026-11-22')
    const original = { sucursal: '900', lunes: '2026-11-23', domingo: '2026-11-22', finPorId: { 'full-a': '22:00', 'part-b': null } }
    const a = leerAntecedenteDomingo(original, '2026-11-23', cajeros, '900')
    expect(() => leerAntecedenteDomingo(original, '2026-11-23', cajeros, '901')).toThrow(/sucursal/)
    expect(a.finPorId).toEqual({ 'full-a': '22:00', 'part-b': null })
    expect(() => leerAntecedenteDomingo({ ...original, domingo: '2026-11-15' }, '2026-11-23', cajeros, '900')).toThrow()
    expect(() => leerAntecedenteDomingo({ ...original, finPorId: { 'full-a': '22:00' } }, '2026-11-23', cajeros, '900')).toThrow()
    expect(() => leerAntecedenteDomingo({ ...original, finPorId: { ...original.finPorId, 'aux-x': '22:00' } }, '2026-11-23', cajeros, '900')).toThrow()
    expect(() => leerAntecedenteDomingo({ ...original, finPorId: { 'full-a': '22:15', 'part-b': null } }, '2026-11-23', cajeros, '900')).toThrow()
  })

  it('calcula el inicio mínimo del lunes sin extender la jornada', () => {
    expect(entradaMinimaLunesSlots('22:00')).toBe(4) // 10:00
    expect(entradaMinimaLunesSlots('22:30')).toBe(5) // 10:30
    expect(entradaMinimaLunesSlots('18:00')).toBe(0) // 08:00 o posterior
    expect(entradaMinimaLunesSlots(null)).toBe(0) // franco
  })

  it('la validación independiente respeta el domingo aportado, incluso si difiere de un historial experimental', () => {
    const h: HorarioColaborador = {
      colaboradorId: 'part-b', rolGeneral: 'cajero', errores: [], totalHoras: 6,
      jornadas: Array.from({ length: 7 }, (_, dia) => ({
        dia, esFranco: dia !== 0, rol: dia === 0 ? 'cajero' as const : 'franco' as const,
        turnos: dia === 0 ? [{ inicio: '09:00', fin: '15:00' }] : [],
        horas: dia === 0 ? 6 : 0,
      })),
    }
    const previo: HorarioColaborador = {
      ...h, jornadas: [{
        dia: 6, esFranco: false, rol: 'cajero',
        turnos: [{ inicio: '15:00', fin: '22:30' }], horas: 7.5,
      }],
    }
    const base = { horarios: [h], roster: [{ id: 'part-b', nombre: 'Part B', contrato: 'PART' as const }], perfil: PERFIL_MOTOR_ACTUAL }
    const conCierre = validarHorario({ ...base, semanaAnterior: [previo], finDomingoAnteriorPorId: { 'part-b': '22:30' } })
    expect(conCierre.violaciones).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'NORM_DESCANSO', dia: 0 })]))
    const conDomingoTemprano = validarHorario({ ...base, semanaAnterior: [previo], finDomingoAnteriorPorId: { 'part-b': '18:00' } })
    expect(conDomingoTemprano.violaciones.filter(v => v.codigo === 'NORM_DESCANSO')).toEqual([])
  })

  it('la pasada FULL/PART no propone entradas de lunes antes del descanso confirmado', () => {
    const input = convertirInputAV2(NECESIDAD_S47, CAJEROS_S47, AUX_S47, EVENTUALES_S47, [], {
      ...OPERATIVA_S47, maxBloquesCajaEventualDia: 2, eventualesCajaHoraLimite: '22:00',
    })
    input.inicio_minimo_lunes_por_colaborador = Object.fromEntries(
      input.colaboradores.filter(c => c.rol === 'FULL' || c.rol === 'PART').map(c => [c.id, 5])
    )
    const resultado = ejecutarAlgoritmo(input)
    const lunes = [...Object.values(resultado.jornadas_full), ...Object.values(resultado.jornadas_part)]
      .flatMap(jornadas => jornadas.filter(j => j.dia === 0 && j.bloques.length))
    expect(lunes.length).toBeGreaterThan(0)
    expect(lunes.every(j => j.bloques[0].slot_inicio >= 5)).toBe(true)
  }, 20_000)
})

describe('AH2-046: domingo anterior desde la semana guardada', () => {
  const cajeros = [
    { id: 'a', nombre: 'A', tipo: 'FULL' as const, horasSemanales: 48, activo: true },
    { id: 'b', nombre: 'B', tipo: 'PART' as const, horasSemanales: 32, activo: true },
    { id: 'n', nombre: 'Nuevo', tipo: 'PART' as const, horasSemanales: 32, activo: true },
  ]
  const j = (fin: string | null) => Array.from({ length: 7 }, (_, dia) => dia === 6 && fin
    ? { dia, esFranco: false, turnos: [{ inicio: '09:00', fin: '13:00' }, { inicio: '17:00', fin }] }
    : { dia, esFranco: dia === 6, turnos: [] as { fin: string }[] })
  const semana = (version: number, finA: string) => ({ fechaLunes: '2026-11-16', version, horarios: [{ colaboradorId: 'a', jornadas: j(finA) }, { colaboradorId: 'b', jornadas: j(null) }] })
  it('usa la última versión de la semana previa: último fin del domingo, franco = null y altas nuevas = null', () => {
    const r = antecedenteDesdeHistorial([semana(1, '21:00'), semana(2, '22:30')], '2026-11-23', cajeros, '091')
    expect(r).toEqual({ lunes: '2026-11-23', domingo: '2026-11-22', sucursal: '091', lunesOrigen: '2026-11-16', finPorId: { a: '22:30', b: null, n: null } })
    expect(entradaMinimaLunesSlots(r!.finPorId.a)).toBe(5) // 22:30 + 12 h = 10:30 → 5 medias horas desde las 08:00
  })
  it('sin semana previa guardada devuelve null (no bloquea; se informa como limitación)', () => {
    expect(antecedenteDesdeHistorial([semana(1, '22:00')], '2026-11-30', cajeros, '091')).toBeNull()
    expect(antecedenteDesdeHistorial([], 'no-es-lunes', cajeros, '091')).toBeNull()
  })
})
