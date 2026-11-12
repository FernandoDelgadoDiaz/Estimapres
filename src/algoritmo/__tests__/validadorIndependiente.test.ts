// VAL-01 (#10): validador independiente — un caso válido y al menos uno inválido por restricción.
import { describe, expect, it } from 'vitest'
import { validarHorario, PERFIL_MOTOR_ACTUAL, type EntradaValidacion, type PerfilNormativo } from '../validadorIndependiente'
import { ejecutarAlgoritmo } from '../orquestador'
import { convertirOutputDeV2 } from '../adapter'
import { ROSTER_REAL_PDF, DEMANDA_REAL_PDF, PRESENCIA_AUX_REAL_PDF, DISPONIBILIDAD_EV_REAL_PDF } from './fixtures'
import { HORAS_FRANJAS, type HorarioColaborador, type JornadaAsignada } from '../../types'

type Dia = string | [string, string] | [string, string, string, string] | null // null = franco
const jornada = (dia: number, d: Dia): JornadaAsignada => {
  if (d === null) return { dia, turnos: [], horas: 0, esFranco: true, rol: 'franco' }
  const pares = typeof d === 'string' ? [d.split('-')] : d.length === 2 ? [d] : [[d[0], d[1]], [d[2], d[3]]]
  const turnos = pares.map(([inicio, fin]) => ({ inicio, fin }))
  const horas = turnos.reduce((s, t) => s + (toMin(t.fin) - toMin(t.inicio)) / 60, 0)
  return { dia, turnos, horas, esFranco: false, rol: 'cajero' }
}
const toMin = (h: string) => Number(h.split(':')[0]) * 60 + Number(h.split(':')[1])
const horario = (id: string, dias: Dia[]): HorarioColaborador => {
  const jornadas = dias.map((d, i) => jornada(i, d))
  return { colaboradorId: id, jornadas, totalHoras: jornadas.reduce((s, j) => s + j.horas, 0), errores: [], rolGeneral: 'cajero' }
}
// FULL válido: 3×9 + 2×8 + 1×5, 2 cortadas (corte ≥ 4 h), 1 franco, descansos ≥ 12 h
const FULL_OK: Dia[] = [
  '09:00-18:00', '09:00-18:00', ['08:00', '12:00', '17:00', '21:00'], null, '10:00-15:00',
  ['08:00', '12:00', '18:00', '22:00'], '13:00-22:00',
]
// PART válido: 1 franco, corridas de 4–6 h, ≤ 31 h
const PART_OK: Dia[] = ['09:00-15:00', '09:00-15:00', '16:00-22:00', '16:00-20:00', null, '09:00-14:00', '10:00-14:00']
const roster = [
  { id: 'f', nombre: 'Full', contrato: 'FULL' as const },
  { id: 'p', nombre: 'Part', contrato: 'PART' as const },
]
const base = (horarios: HorarioColaborador[], extra: Partial<EntradaValidacion> = {}) =>
  validarHorario({ horarios, roster, perfil: PERFIL_MOTOR_ACTUAL, ...extra })
const codigos = (r: ReturnType<typeof validarHorario>) => r.violaciones.map(v => v.codigo)

describe('VAL-01: casos válidos', () => {
  it('FULL y PART válidos → sin violaciones y publicable', () => {
    const r = base([horario('f', FULL_OK), horario('p', PART_OK)])
    expect(r.violaciones).toEqual([])
    expect(r.publicable).toBe(true)
  })
})

describe('VAL-01: restricciones normativas (perfil del motor actual)', () => {
  it('horas semanales: máximo y exactas', () => {
    expect(codigos(base([horario('p', ['09:00-15:00', '09:00-15:00', '09:00-15:00', '09:00-15:00', '09:00-15:00', '09:00-14:00', null])])))
      .toContain('NORM_HORAS_MAX') // 35 h > 31
    const corto = [...FULL_OK]; corto[0] = '09:00-17:00'
    expect(codigos(base([horario('f', corto)]))).toEqual(expect.arrayContaining(['NORM_HORAS_EXACTAS', 'NORM_COMPOSICION']))
  })

  it('francos: exactamente 1', () => {
    const dos = [...FULL_OK]; dos[4] = null
    expect(codigos(base([horario('f', dos)]))).toContain('NORM_FRANCOS')
    const cero = [...PART_OK]; cero[4] = '09:00-13:00'
    expect(codigos(base([horario('p', cero)]))).toContain('NORM_FRANCOS')
  })

  it('corte mínimo de 4 h en jornada cortada', () => {
    const mal = [...FULL_OK]; mal[2] = ['08:00', '12:00', '15:00', '20:00']
    const r = base([horario('f', mal)])
    expect(r.violaciones.find(v => v.codigo === 'NORM_CORTE_MIN')?.detalle).toMatch(/corte de 3 h el miércoles/)
  })

  it('PART no puede cortar; horas por día 4–6', () => {
    const mal = [...PART_OK]; mal[0] = ['09:00', '11:00', '16:00', '19:00']
    expect(codigos(base([horario('p', mal)]))).toContain('NORM_BLOQUES_DIA')
    const largo = [...PART_OK]; largo[0] = '09:00-16:00'
    expect(codigos(base([horario('p', largo)]))).toContain('NORM_HORAS_DIA_MAX')
    const corto = [...PART_OK]; corto[6] = '10:00-12:00'
    expect(codigos(base([horario('p', corto)]))).toContain('NORM_HORAS_DIA_MIN')
  })

  it('cantidad de jornadas cortadas (FULL: 2)', () => {
    const una = [...FULL_OK]; una[5] = '13:00-21:00'
    expect(codigos(base([horario('f', una)]))).toContain('NORM_CORTADAS')
  })

  it('descanso de 12 h entre jornadas, con horas reales (11,5 h es violación)', () => {
    const mal = [...PART_OK]; mal[2] = '16:30-22:30'; mal[3] = '10:00-15:00'
    const r = base([horario('p', mal)])
    expect(r.violaciones.find(v => v.codigo === 'NORM_DESCANSO')?.detalle).toMatch(/11\.5 h de descanso antes del jueves/)
    const justo = [...PART_OK]; justo[2] = '16:00-22:00'; justo[3] = '10:00-15:00'
    expect(codigos(base([horario('p', justo)]))).not.toContain('NORM_DESCANSO')
  })

  it('descanso de 12 h desde el domingo de la semana anterior', () => {
    const anterior = horario('p', [null, null, null, null, null, null, '17:00-23:00'])
    const r = base([horario('p', PART_OK)], { semanaAnterior: [anterior] })
    expect(r.violaciones.find(v => v.codigo === 'NORM_DESCANSO')?.detalle).toMatch(/10 h de descanso antes del lunes \(desde el domingo anterior\)/)
    expect(codigos(base([horario('p', PART_OK)]))).not.toContain('NORM_DESCANSO')
  })

  it('el perfil parametriza los límites: PART 32 h acepta lo que 31 h rechaza', () => {
    const h32 = horario('p', ['09:00-15:00', '09:00-15:00', '16:00-22:00', '16:00-22:00', null, '09:00-14:00', '10:00-13:00'])
    expect(codigos(base([h32]))).toContain('NORM_HORAS_MAX')
    const p32: PerfilNormativo = { ...PERFIL_MOTOR_ACTUAL, id: 'test-32', contratos: { ...PERFIL_MOTOR_ACTUAL.contratos, PART: { ...PERFIL_MOTOR_ACTUAL.contratos.PART, horasSemanaMax: 32 } } }
    expect(codigos(validarHorario({ horarios: [h32], roster, perfil: p32 }))).not.toContain('NORM_HORAS_MAX')
  })
})

describe('VAL-01: reglas operativas', () => {
  const exc = (tipo: any, valor?: string) => [{ id: 'x', colaboradorNombre: 'Part', tipo, valor, descripcion: '' }]
  it('franco fijo', () => {
    expect(codigos(base([horario('p', PART_OK)], { excepciones: exc('franco_dia', '4') }))).toEqual([])
    expect(codigos(base([horario('p', PART_OK)], { excepciones: exc('franco_dia', '1') }))).toEqual(['OP_FRANCO_DIA', 'OP_FRANCO_DIA'])
  })
  it('entrada/salida, solo mañana, solo noche, siempre cierre', () => {
    expect(codigos(base([horario('p', PART_OK)], { excepciones: exc('no_antes_de', '10:00') }))).toContain('OP_NO_ANTES_DE')
    expect(codigos(base([horario('p', PART_OK)], { excepciones: exc('no_despues_de', '21:30') }))).toContain('OP_NO_DESPUES_DE')
    expect(codigos(base([horario('p', PART_OK)], { excepciones: exc('solo_matutino') }))).toContain('OP_SOLO_MATUTINO')
    expect(codigos(base([horario('p', PART_OK)], { excepciones: exc('solo_nocturno') }))).toContain('OP_SOLO_NOCTURNO')
    expect(codigos(base([horario('p', PART_OK)], { excepciones: exc('siempre_cierre') }))).toContain('OP_SIEMPRE_CIERRE')
  })
  it('máximo de francos simultáneos', () => {
    const p2 = horario('p2', PART_OK)
    const r = validarHorario({ horarios: [horario('p', PART_OK), p2], roster: [...roster, { id: 'p2', nombre: 'P2', contrato: 'PART' }], perfil: PERFIL_MOTOR_ACTUAL, maxFrancosDia: 1 })
    expect(r.violaciones.filter(v => v.codigo === 'OP_MAX_FRANCOS_DIA').map(v => v.dia)).toEqual([4])
  })
  it('mínimo de cajeros por franja', () => {
    const necesidad = HORAS_FRANJAS.map(hora => ({ hora, necesidad: Array(7).fill(0) }))
    const r = base([horario('p', PART_OK)], { necesidad, minimosCajeros: [{ dia: 0, slotDesde: 2, slotHasta: 4, cantidad: 2 }] })
    expect(r.violaciones.filter(v => v.codigo === 'OP_MIN_CAJEROS').map(v => v.franja)).toEqual(['09:00', '09:30'])
  })
})

describe('VAL-01: datos', () => {
  it('fuera de roster, duplicado, día faltante, solape', () => {
    const sinDom = horario('p', PART_OK); sinDom.jornadas = sinDom.jornadas.slice(0, 6)
    expect(codigos(base([horario('z', PART_OK)]))).toEqual(['DATOS_SIN_ROSTER'])
    expect(codigos(base([horario('p', PART_OK), horario('p', PART_OK)]))).toContain('DATOS_DUPLICADO')
    expect(codigos(base([sinDom]))).toContain('DATOS_DIA_FALTANTE')
    const sol = [...FULL_OK]; sol[2] = ['08:00', '12:00', '11:00', '14:00']
    expect(codigos(base([horario('f', sol)]))).toContain('DATOS_SOLAPE')
  })
})

describe('VAL-01: sobre la salida real del motor (fixture de la sucursal de referencia)', () => {
  const r = ejecutarAlgoritmo({ demanda: DEMANDA_REAL_PDF, colaboradores: ROSTER_REAL_PDF, presencia_aux: PRESENCIA_AUX_REAL_PDF, disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF } as never)
  const ui = (rol: string) => ROSTER_REAL_PDF.filter(c => c.rol === rol)
  const out = convertirOutputDeV2(
    r,
    [...ui('FULL'), ...ui('PART')].map(c => ({ id: c.id, nombre: c.nombre, tipo: c.rol as 'FULL', horasSemanales: 0, activo: true })),
    ui('AUX').map(c => ({ id: c.id, nombre: c.nombre, horarioSemanal: [], activo: true })),
    ui('EVENTUAL').map(c => ({ id: c.id, nombre: c.nombre, sector: '', horarioSemanal: [], activo: true })),
  )
  const necesidad = HORAS_FRANJAS.map(hora => {
    const [h, m] = hora.split(':').map(Number); const s = (h - 8) * 2 + (m >= 30 ? 1 : 0)
    return { hora, necesidad: [0, 1, 2, 3, 4, 5, 6].map(d => (s >= 0 && s < 30 ? DEMANDA_REAL_PDF[d][s] : 0)) }
  })
  const res = validarHorario({
    horarios: out.horarios, roster: ROSTER_REAL_PDF.map(c => ({ id: c.id, nombre: c.nombre, contrato: c.rol as 'FULL' })),
    perfil: PERFIL_MOTOR_ACTUAL, necesidad, cajaAux: out.cajaAux, cajaEventual: out.cajaEventual,
  })

  it('la cobertura calculada coincide con la del motor en todas las franjas 08:00–22:00', () => {
    for (let i = 2; i < 31; i++) expect(res.metricas!.cobertura[i]).toEqual(out.coberturaFranjas[i])
  })

  it('detecta el defecto conocido del motor: descansos de 11,5 h (19 slots nocturnos en vez de 18)', () => {
    // Defecto documentado en #10; su corrección va en un PR separado. Cuando se integre,
    // este test debe pasar a esperar cero violaciones.
    expect(new Set(codigos(res))).toEqual(new Set(['NORM_DESCANSO']))
    expect(res.violaciones.every(v => /11\.5 h de descanso/.test(v.detalle))).toBe(true)
  })
})
