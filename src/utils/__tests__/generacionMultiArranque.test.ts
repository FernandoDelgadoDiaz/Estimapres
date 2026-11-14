// #7 · AH2-020 (APROBADO, B conjunta) — Multi-arranque con el motor actual como respaldo.
// Datos 100 % sintéticos / anonimizados.
import { describe, expect, it } from 'vitest'
import { convertirInputAV2 } from '../../algoritmo/adapter'
import { ejecutarAlgoritmo } from '../../algoritmo/orquestador'
import type { InputAlgoritmo, Jornada, ResultadoSemanal } from '../../algoritmo/types'
import type { Colaborador, Franja } from '../../types'
import { ESTRATEGIAS_MULTI_ARRANQUE, PREFIJO_AVISO_MULTI_ARRANQUE, VERSION_ALGORITMO, generarConMultiArranque, registroGeneracion, type SalidaMultiArranque } from '../generacionMultiArranque'
import { estadoValidacion, validarResultadoSemana } from '../validacionSemana'
import { filaASemana, semanaAFila } from '../almacen'
import { aplicarEdicionConRecalculo } from '../../hooks/useAsignacion'
import type { SemanaHistorial } from '../../types'
import { asignarHorariosConIA } from '../iaAsignacion'
import { escenarioSintetico, generarEscenario, type Escenario } from '../../algoritmo/__tests__/fixtures/escenariosSinteticos'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../../algoritmo/__tests__/fixtures/semana47Anonimizada'
import { NECESIDAD_S47 } from '../../algoritmo/__tests__/fixtures/aperturaHelpers'

const ctx = (necesidad: Franja[], excepciones: Escenario['excepciones'] = []) => ({ necesidad, excepciones, operativa: OPERATIVA_S47 })
const entrada = (e: Escenario): InputAlgoritmo => convertirInputAV2(e.necesidad, e.cajeros, AUX_S47, EVENTUALES_S47, e.excepciones, { ...OPERATIVA_S47 })
const generar = (e: Escenario, extra: Partial<Parameters<typeof generarConMultiArranque>[0]> = {}) =>
  generarConMultiArranque({ input: entrada(e), cajeros: e.cajeros, auxiliares: AUX_S47, eventuales: EVENTUALES_S47, contexto: ctx(e.necesidad, e.excepciones), ...extra })
const slots = (sem?: Jornada[]) => (sem ?? []).reduce((n, j) => n + j.bloques.reduce((m, b) => m + b.slot_fin - b.slot_inicio, 0), 0)
const horas = (r: ResultadoSemanal) => Object.fromEntries(Object.entries({ ...r.jornadas_full, ...r.jornadas_part }).map(([k, v]) => [k, slots(v) / 2]))
const violaciones = (e: Escenario, o: SalidaMultiArranque) =>
  validarResultadoSemana(o.resultado, e.cajeros, AUX_S47, EVENTUALES_S47, ctx(e.necesidad, e.excepciones)).violaciones
const respaldo = (e: Escenario) => ejecutarAlgoritmo({ ...entrada(e), omitir_impacto_horas: true })

/** Invariantes de no regresión frente al respaldo (motor actual en frío). */
function sinRegresion(e: Escenario, o: SalidaMultiArranque) {
  const r = respaldo(e)
  expect(o.resultadoV2.metricas.cobertura_total_pct).toBeGreaterThanOrEqual(r.metricas.cobertura_total_pct - 1e-9)
  const hR = horas(r), hO = horas(o.resultadoV2)
  for (const id of Object.keys(hR)) expect(hO[id], `horas de ${id}`).toBeGreaterThanOrEqual(hR[id])
  expect(o.seleccion.coberturaRespaldoPct).toBe(r.metricas.cobertura_total_pct)
}

describe('AH2-020 · multi-arranque: estrategias del benchmark en el camino productivo', () => {
  it('escenario 121: «desde-sin-prioridad» mantiene 32 h a todos y supera el 95 % (respaldo 93,75 %)', () => {
    const e = escenarioSintetico(121)
    const o = generar(e)
    expect(o.seleccion.estrategia).toBe('desde-sin-prioridad')
    expect(o.seleccion.coberturaRespaldoPct).toBeLessThan(95)
    expect(o.resultadoV2.metricas.cobertura_total_pct).toBeGreaterThanOrEqual(95)
    expect(Object.values(o.resultadoV2.jornadas_part).every(w => slots(w) === 64)).toBe(true)
    expect(violaciones(e, o)).toEqual([])
    sinRegresion(e, o)
  })

  it('escenario 66: solo «full-fijos» alcanza la cobertura sin prioridad cumpliendo las horas', () => {
    const e = escenarioSintetico(66)
    const o = generar(e)
    expect(o.seleccion.estrategia).toBe('full-fijos')
    expect(o.resultadoV2.metricas.cobertura_total_pct).toBeGreaterThan(o.seleccion.coberturaRespaldoPct)
    const sinFullFijos = generar(e, { estrategias: ['actual', 'desde-sin-prioridad', 'alternada-1', 'alternada-2', 'alternada-ms-1', 'alternada-ms-2'] })
    expect(sinFullFijos.resultadoV2.metricas.cobertura_total_pct).toBeLessThan(o.resultadoV2.metricas.cobertura_total_pct)
    expect(violaciones(e, o)).toEqual([])
    sinRegresion(e, o)
  })

  it('escenario 156: llega al 100 % (full-fijos o alternada-1, ambas lo encuentran) sin bajar horas', () => {
    const e = escenarioSintetico(156)
    const o = generar(e)
    expect(o.resultadoV2.metricas.cobertura_total_pct).toBe(100)
    const soloAlternada = generar(e, { estrategias: ['actual', 'alternada-1'] })
    expect(soloAlternada.resultadoV2.metricas.cobertura_total_pct).toBe(100)
    expect(violaciones(e, o)).toEqual([])
    sinRegresion(e, o)
  })

  it('escenario 130: «alternada-ms-2» mejora (98,97 → 99,49 %); el 100 % sin prioridad NO se alcanza (no se afirma)', () => {
    const e = escenarioSintetico(130)
    const o = generar(e)
    expect(o.seleccion.estrategia).toBe('alternada-ms-2')
    expect(o.resultadoV2.metricas.cobertura_total_pct).toBeCloseTo(99.49, 1)
    expect(o.resultadoV2.metricas.cobertura_total_pct).toBeLessThan(100)
    sinRegresion(e, o)
  })

  it('escenario 100: ninguna estrategia mejora → se conserva el respaldo (solución no encontrada, sin afirmar óptimo)', () => {
    const e = escenarioSintetico(100)
    const o = generar(e)
    expect(o.seleccion.estrategia).toBe('actual')
    expect(o.resultadoV2.jornadas_part).toEqual(respaldo(e).jornadas_part)
    expect(o.resultadoV2.cumplimiento_horas?.every(c => c.estadoObjetivo === 'cumplido')).toBe(true)
  })
})

describe('AH2-020 · estados de horas separados', () => {
  it('escenario 130: P3 «imposible-demostrado» (cota individual 24 h < 32 h); los demás «cumplido»', () => {
    const o = generar(escenarioSintetico(130))
    const c = o.resultadoV2.cumplimiento_horas!
    const p3 = c.find(x => x.colab_id === 'p3')!
    expect(p3).toMatchObject({ estadoObjetivo: 'imposible-demostrado', cotaHoras: 24, asignadasHoras: 24, objetivoHoras: 32 })
    expect(c.filter(x => x.colab_id !== 'p3').every(x => x.estadoObjetivo === 'cumplido')).toBe(true)
  })

  it('«no-encontrado» solo si la cota individual permite el objetivo; «sin-objetivo» sin ficha válida', () => {
    const e = escenarioSintetico(2)
    const cajeros: Colaborador[] = e.cajeros.map(c => (c.id === 'p0' ? { ...c, horasSemanales: undefined } : c))
    const input = convertirInputAV2(e.necesidad, cajeros, AUX_S47, EVENTUALES_S47, e.excepciones, { ...OPERATIVA_S47 })
    const r = ejecutarAlgoritmo({ ...input, omitir_impacto_horas: true })
    const p0 = r.cumplimiento_horas!.find(x => x.colab_id === 'p0')!
    expect(p0.estadoObjetivo).toBe('sin-objetivo')
    for (const x of r.cumplimiento_horas!.filter(x => x.estadoObjetivo === 'no-encontrado')) expect(x.cotaHoras!).toBeGreaterThanOrEqual(x.objetivoHoras!)
  })
})

describe('AH2-020 · respaldo, presupuesto y alcance', () => {
  it('sin presupuesto solo corre el respaldo: resultado idéntico al motor actual y estrategias omitidas informadas', () => {
    const e = escenarioSintetico(121)
    const o = generar(e, { presupuestoMs: 0 })
    expect(o.seleccion.estrategia).toBe('actual')
    expect(o.seleccion.candidatos.map(c => c.estrategia)).toEqual(['actual'])
    // Cierre de calidad: agotado el presupuesto ANTES de empezar, se informan TODAS las alternativas.
    expect(o.seleccion.omitidas).toEqual(ESTRATEGIAS_MULTI_ARRANQUE.filter(x => x !== 'actual'))
    expect(o.seleccion.sinAlternativas).toBe('presupuesto-agotado')
    const r = respaldo(e)
    expect([o.resultadoV2.jornadas_full, o.resultadoV2.jornadas_part]).toEqual([r.jornadas_full, r.jornadas_part])
  })

  it('sin objetivo de horas PART (fichas sin dato) no hay alternativas: se usa el motor actual', () => {
    const e = escenarioSintetico(121)
    const cajeros = e.cajeros.map(c => (c.tipo === 'PART' ? { ...c, horasSemanales: undefined } : c))
    const input = convertirInputAV2(e.necesidad, cajeros, AUX_S47, EVENTUALES_S47, e.excepciones, { ...OPERATIVA_S47 })
    const o = generarConMultiArranque({ input, cajeros, auxiliares: AUX_S47, eventuales: EVENTUALES_S47, contexto: ctx(e.necesidad, e.excepciones) })
    expect(o.seleccion.candidatos.map(c => c.estrategia)).toEqual(['actual'])
    expect(o.seleccion.omitidas).toEqual([]) // no aplica: no es falta de tiempo
    expect(o.seleccion.sinAlternativas).toBe('sin-objetivo-horas')
    expect(o.resultadoV2.impacto_horas).toBeUndefined()
  })

  it('el impacto de la prioridad se mide contra la cascada sin prioridad, sobre la solución ELEGIDA', () => {
    const o = generar(escenarioSintetico(121))
    expect(o.resultadoV2.impacto_horas!.coberturaConPrioridadPct).toBe(o.resultadoV2.metricas.cobertura_total_pct)
    expect(o.resultado.impactoHoras).toEqual(o.resultadoV2.impacto_horas)
  })

  it('la app (asignarHorariosConIA) usa el multi-arranque y es reproducible', async () => {
    const e = escenarioSintetico(121)
    const r1 = await asignarHorariosConIA(e.necesidad, e.cajeros, AUX_S47, EVENTUALES_S47, [], e.excepciones, { ...OPERATIVA_S47 })
    const r2 = await asignarHorariosConIA(e.necesidad, e.cajeros, AUX_S47, EVENTUALES_S47, [], e.excepciones, { ...OPERATIVA_S47 })
    expect(r1.multiArranque?.estrategia).toBe('desde-sin-prioridad')
    expect(r2).toEqual(r1)
  })
})

describe('AH2-020 · no regresión', () => {
  it('40 escenarios sintéticos: cobertura y horas por persona ≥ respaldo; sin violaciones nuevas', () => {
    for (let i = 0; i < 40; i++) {
      const e = i === 0 ? escenarioSintetico(0) : generarEscenario(i) // misma secuencia que el benchmark
      const o = generar(e)
      sinRegresion(e, o)
      const vR = validarResultadoSemana(
        generarConMultiArranque({ input: entrada(e), cajeros: e.cajeros, auxiliares: AUX_S47, eventuales: EVENTUALES_S47, contexto: ctx(e.necesidad, e.excepciones), presupuestoMs: 0 }).resultado,
        e.cajeros, AUX_S47, EVENTUALES_S47, ctx(e.necesidad, e.excepciones)).violaciones.map(v => v.codigo)
      for (const v of violaciones(e, o)) expect(vR).toContain(v.codigo)
    }
  }, 120_000)

  it('semana 47 anonimizada: valida sin violaciones y no empeora al respaldo', () => {
    const e: Escenario = { id: -47, modo: 's47', necesidad: NECESIDAD_S47, cajeros: CAJEROS_S47, excepciones: [] }
    const o = generar(e)
    expect(violaciones(e, o)).toEqual([])
    sinRegresion(e, o)
  })

  it('dotación grande (6 FULL + 14 PART, demanda ×2, tope 4 francos/día): dentro del presupuesto, valida y sin regresión', () => {
    const cajeros: Colaborador[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `gf${i}`, nombre: `GF${i}`, tipo: 'FULL' as const, horasSemanales: 48, activo: true })),
      ...Array.from({ length: 14 }, (_, i) => ({ id: `gp${i}`, nombre: `GP${i}`, tipo: 'PART' as const, horasSemanales: i % 3 === 0 ? 24 : 32, activo: true })),
    ]
    const necesidad = NECESIDAD_S47.map(f => ({ ...f, necesidad: f.necesidad.map(n => n * 2) }))
    const input = convertirInputAV2(necesidad, cajeros, AUX_S47, EVENTUALES_S47, [], { ...OPERATIVA_S47, maxFrancosDia: 4 })
    const contexto = { ...ctx(necesidad), maxFrancosDia: 4 }
    const t0 = Date.now()
    const o = generarConMultiArranque({ input, cajeros, auxiliares: AUX_S47, eventuales: EVENTUALES_S47, contexto })
    expect(Date.now() - t0).toBeLessThan(60_000)
    expect(o.seleccion.omitidas).toEqual([])
    expect(validarResultadoSemana(o.resultado, cajeros, AUX_S47, EVENTUALES_S47, contexto).violaciones).toEqual([])
    const r = ejecutarAlgoritmo({ ...input, omitir_impacto_horas: true })
    expect(o.resultadoV2.metricas.cobertura_total_pct).toBeGreaterThanOrEqual(r.metricas.cobertura_total_pct - 1e-9)
    const hR = horas(r), hO = horas(o.resultadoV2)
    for (const id of Object.keys(hR)) expect(hO[id], `horas de ${id}`).toBeGreaterThanOrEqual(hR[id])
    expect(o.resultadoV2.cumplimiento_horas!.filter(c => c.tipo === 'PART').every(c => c.estadoObjetivo === 'cumplido')).toBe(true)
  }, 180_000)
})

describe('cierre de calidad · presupuesto agotado a mitad de camino', () => {
  it('reloj simulado: cada estrategia pedida queda corrida u omitida, nunca en silencio; las dependientes de una omitida también se omiten', () => {
    const e = escenarioSintetico(121)
    for (const presupuestoMs of [1, 5_000, 9_000, 13_000, 17_000, 25_000]) {
      let t = 0
      const o = generar(e, { presupuestoMs, reloj: () => (t += 1_000) })
      const corridas = o.seleccion.candidatos.map(c => c.estrategia).filter(x => x !== 'actual')
      expect([...corridas, ...o.seleccion.omitidas].sort(), `presupuesto ${presupuestoMs}`).toEqual(ESTRATEGIAS_MULTI_ARRANQUE.filter(x => x !== 'actual').sort())
      if (o.seleccion.omitidas.includes('alternada-1')) expect(o.seleccion.omitidas).toContain('alternada-2')
      if (o.seleccion.omitidas.includes('desde-sin-prioridad')) expect(o.seleccion.omitidas).toEqual(expect.arrayContaining(['alternada-ms-1', 'alternada-ms-2']))
      if (o.seleccion.omitidas.length === 6) expect(o.seleccion.sinAlternativas).toBe('presupuesto-agotado')
      sinRegresion(e, o)
    }
  })
})

describe('cierre de calidad · sin violaciones nuevas ≠ totalmente válido', () => {
  // Dotación grande con el tope predeterminado de 2 francos/día: el respaldo deja personas sin semana
  // (violaciones preexistentes). Ningún candidato puede ser válido; el elegido no es publicable.
  const cajeros: Colaborador[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `gf${i}`, nombre: `GF${i}`, tipo: 'FULL' as const, horasSemanales: 48, activo: true })),
    ...Array.from({ length: 14 }, (_, i) => ({ id: `gp${i}`, nombre: `GP${i}`, tipo: 'PART' as const, horasSemanales: 32, activo: true })),
  ]
  const necesidad = NECESIDAD_S47.map(f => ({ ...f, necesidad: f.necesidad.map(n => n * 2) }))
  const e: Escenario = { id: -2, modo: 'preexistentes', necesidad, cajeros, excepciones: [] }
  const o = generar(e)

  it('los candidatos elegibles se distinguen de los totalmente válidos', () => {
    const elegibles = o.seleccion.candidatos.filter(c => c.elegible)
    expect(elegibles.length).toBeGreaterThan(0)
    for (const c of elegibles) {
      expect(c.violacionesNuevas).toBe(0)
      expect(c.violacionesPreexistentes).toBeGreaterThan(0)
      expect(c.totalmenteValido).toBe(false)
    }
    expect(o.seleccion.validacion).toBe('con-violaciones-preexistentes')
    expect(o.seleccion.violacionesElegida).toBeGreaterThan(0)
  })

  it('el horario elegido queda en BORRADOR, no publicable, con aviso explícito', () => {
    const v = validarResultadoSemana(o.resultado, cajeros, AUX_S47, EVENTUALES_S47, ctx(necesidad))
    expect(v.publicable).toBe(false)
    expect(estadoValidacion(v)).toMatch(/^BORRADOR/)
    expect(o.resultado.alertas.some(a => a.startsWith(PREFIJO_AVISO_MULTI_ARRANQUE) && a.includes('No es publicable'))).toBe(true)
    expect(registroGeneracion(o.seleccion).validacion).toBe('con-violaciones-preexistentes')
  })

  it('tras una edición manual el aviso de generación se retira (la validez la informa el validador)', () => {
    const h = o.resultado.horarios.find(x => x.jornadas.some(j => !j.esFranco))!
    const j = h.jornadas.find(x => !x.esFranco)!
    const editado = aplicarEdicionConRecalculo(o.resultado, h.colaboradorId, j.dia, { esFranco: false, turnos: j.turnos }, cajeros.find(c => c.id === h.colaboradorId)?.nombre ?? h.colaboradorId)
    expect(editado.alertas.some(a => a.startsWith(PREFIJO_AVISO_MULTI_ARRANQUE))).toBe(false)
  })

  it('un escenario totalmente válido se informa como «valida» y sin aviso de multi-arranque', () => {
    const v = generar(escenarioSintetico(121))
    expect(v.seleccion.validacion).toBe('valida')
    expect(v.seleccion.candidatos.find(c => c.estrategia === v.seleccion.estrategia)!.totalmenteValido).toBe(true)
    expect(v.resultado.alertas.some(a => a.startsWith(PREFIJO_AVISO_MULTI_ARRANQUE))).toBe(false)
  })
})

describe('cierre de calidad · persistencia de la generación (jsonb existente, sin migración)', () => {
  const semanaDe = (o: SalidaMultiArranque, extra: Partial<SemanaHistorial> = {}): SemanaHistorial => ({
    id: 's1', fechaLunes: '2026-11-16', version: 1, descripcion: 'S', generadoEl: '2026-11-14T00:00:00Z',
    resumenPorColaborador: {}, horarios: o.resultado.horarios, editadoManualmente: false,
    generacion: registroGeneracion(o.resultado.multiArranque!), ...extra,
  })

  it('registro: versión, estrategia, mejora frente al respaldo, omitidas y validez', () => {
    const o = generar(escenarioSintetico(121))
    const g = registroGeneracion(o.resultado.multiArranque!)
    expect(g).toEqual({
      versionAlgoritmo: VERSION_ALGORITMO, estrategia: 'desde-sin-prioridad',
      coberturaRespaldoPct: o.seleccion.coberturaRespaldoPct, coberturaElegidaPct: o.seleccion.coberturaElegidaPct,
      mejoraPp: Math.round((o.seleccion.coberturaElegidaPct - o.seleccion.coberturaRespaldoPct) * 100) / 100,
      omitidas: [], validacion: 'valida',
    })
    expect(g.mejoraPp).toBeCloseTo(2.34, 2)
  })

  it('ida y vuelta por la fila de Supabase (horario_completo.generacion) y por localStorage (JSON)', () => {
    const o = generar(escenarioSintetico(121))
    const semana = semanaDe(o)
    const fila = semanaAFila(semana)
    expect((fila.horario_completo as Record<string, unknown>).generacion).toEqual(semana.generacion)
    expect(filaASemana({ ...fila, created_at: '2026-11-14T00:00:00Z' }).generacion).toEqual(semana.generacion)
    const local = JSON.parse(JSON.stringify([semana])) as SemanaHistorial[]
    expect(local[0].generacion).toEqual(semana.generacion)
  })

  it('presupuesto agotado y violaciones preexistentes también se conservan al recuperar', () => {
    const o = generar(escenarioSintetico(121), { presupuestoMs: 0 })
    const vuelta = filaASemana({ ...semanaAFila(semanaDe(o)), created_at: '2026-11-14T00:00:00Z' })
    expect(vuelta.generacion).toMatchObject({ estrategia: 'actual', mejoraPp: 0, sinAlternativas: 'presupuesto-agotado', omitidas: ESTRATEGIAS_MULTI_ARRANQUE.filter(x => x !== 'actual') })
  })

  it('semanas anteriores (sin el campo) se recuperan sin generación y sin errores', () => {
    const o = generar(escenarioSintetico(121))
    const fila = semanaAFila(semanaDe(o, { generacion: undefined }))
    delete (fila.horario_completo as Record<string, unknown>).generacion
    expect(filaASemana({ ...fila, created_at: '2026-11-14T00:00:00Z' }).generacion).toBeUndefined()
  })
})
