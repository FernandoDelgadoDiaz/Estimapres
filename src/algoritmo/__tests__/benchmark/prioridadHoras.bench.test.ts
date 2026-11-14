// #7 · AH2-020 — Benchmark OFFLINE: prioridad de horas PART frente a cobertura POM.
// No corre en CI: solo con AH2_BENCH=1 (opcional AH2_BENCH_OUT=<archivo.json>, AH2_BENCH_N=<escenarios>).
// Datos 100 % sintéticos (semilla fija). No toca Supabase ni producción.
//
// Estrategias por escenario:
//   A0     sin prioridad de horas (referencia de cobertura; puede incumplir horas exigibles)
//   H1000  motor productivo: horas objetivo lexicográficas (penalización 1000)
//   H50/H10/H2  penalización menor (¿se pierden horas? ¿mejora la cobertura?)
//   MS     multi-arranque: prioridad de horas partiendo de la solución A0 (warm start)
//   MEJOR  mejor cobertura entre H1000 y MS que cumpla TODAS las horas objetivo
// Clasificación (solo escenarios donde A0 y H1000 validan SIN violaciones):
//   - factible encontrada: alguna estrategia cumple todas las horas y llega a la cobertura de A0;
//   - inviable demostrada: una cota EXACTA por persona (relajando el tope de francos por día,
//     la única regla compartida entre PART) prueba que el objetivo de horas es imposible;
//   - no encontrada: ni se encontró ni se probó imposible → requiere solver exacto (#13).
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { convertirInputAV2, convertirOutputDeV2 } from '../../adapter'
import { ejecutarAlgoritmo } from '../../orquestador'
import type { InputAlgoritmo, Jornada, ResultadoSemanal } from '../../types'
import { validarResultadoSemana } from '../../../utils/validacionSemana'
import { generarEscenario, type Escenario } from '../fixtures/escenariosSinteticos'
import { AUX_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../fixtures/semana47Anonimizada'

const ACTIVO = process.env.AH2_BENCH === '1'
const N = Number(process.env.AH2_BENCH_N ?? 150)

const base = (e: Escenario): InputAlgoritmo => convertirInputAV2(e.necesidad, e.cajeros, AUX_S47, EVENTUALES_S47, e.excepciones, { ...OPERATIVA_S47 })
const sinPrioridad = (inp: InputAlgoritmo): InputAlgoritmo => ({
  ...inp, contratos: Object.fromEntries(Object.entries(inp.contratos ?? {}).map(([k, c]) => [k, { ...c, objetivoSlots: null }])),
})
const horasPart = (r: ResultadoSemanal) => Object.values(r.jornadas_part).map(s => s.reduce((n, j) => n + j.bloques.reduce((m, b) => m + b.slot_fin - b.slot_inicio, 0), 0) / 2)
const sobrantes = (r: ResultadoSemanal) => r.metricas.exceso_por_slot.flat().reduce((a, b) => a + b, 0) / 2

function validar(e: Escenario, r: ResultadoSemanal) {
  const ui = convertirOutputDeV2(r, e.cajeros, AUX_S47, EVENTUALES_S47)
  return validarResultadoSemana(ui, e.cajeros, AUX_S47, EVENTUALES_S47, { necesidad: e.necesidad, excepciones: e.excepciones, operativa: OPERATIVA_S47 })
}

/** Cota exacta por persona: máximo de horas PART que permiten SUS reglas (tope de francos relajado). */
function cotaHoras(inp: InputAlgoritmo, id: string): number {
  const c = inp.colaboradores.find(x => x.id === id)!
  const r = ejecutarAlgoritmo({
    ...inp, demanda: inp.demanda.map(f => f.map(() => 0)), colaboradores: [c], presencia_aux: {}, disponibilidad_eventual: {},
    max_francos_dia: 7, contratos: { [id]: inp.contratos![id] },
  })
  return horasPart(r)[0] ?? 0
}

export function evaluar(e: Escenario) {
  const inp = base(e)
  const objetivo = Object.values(inp.contratos ?? {}).reduce((s, c) => s + (c.objetivoSlots ?? 0) / 2, 0)
  const t = (f: () => ResultadoSemanal) => { const t0 = Date.now(); const r = f(); return { r, ms: Date.now() - t0 } }
  const a0 = t(() => ejecutarAlgoritmo(sinPrioridad(inp)))
  const corrida = (pen: number) => t(() => ejecutarAlgoritmo({ ...inp, experimental: { penalizacionHoraFaltante: pen } }))
  const h1000 = t(() => ejecutarAlgoritmo(inp))
  const h50 = corrida(50), h10 = corrida(10), h2 = corrida(2)
  const semillas: Record<string, Jornada[]> = { ...a0.r.jornadas_full, ...a0.r.jornadas_part }
  const ms = t(() => ejecutarAlgoritmo({ ...inp, experimental: { semillas } }))
  const resumen = (x: { r: ResultadoSemanal; ms: number }) => {
    const v = validar(e, x.r)
    const hp = horasPart(x.r)
    return {
      cobertura: x.r.metricas.cobertura_total_pct, sobrantes: sobrantes(x.r), horasPart: hp.reduce((a, b) => a + b, 0),
      cumpleHoras: hp.reduce((a, b) => a + b, 0) >= objetivo - 1e-9, violaciones: v.violaciones.length, ms: x.ms,
    }
  }
  const res = { A0: resumen(a0), H1000: resumen(h1000), H50: resumen(h50), H10: resumen(h10), H2: resumen(h2), MS: resumen(ms) }
  const cotas = Object.keys(inp.contratos ?? {}).map(id => ({ id, cota: cotaHoras(inp, id), objetivo: (inp.contratos![id].objetivoSlots ?? 0) / 2 }))
  const conHoras = [res.H1000, res.MS].filter(x => x.cumpleHoras && x.violaciones === 0)
  const mejor = conHoras.sort((a, b) => b.cobertura - a.cobertura)[0]
  const validos = res.A0.violaciones === 0 && res.H1000.violaciones === 0
  const brecha = res.A0.cobertura - res.H1000.cobertura
  let estado: 'sin-brecha' | 'factible-encontrada' | 'inviable-demostrada' | 'no-encontrada'
  if (cotas.some(c => c.cota < c.objetivo)) estado = 'inviable-demostrada'
  else if (brecha <= 1e-9) estado = 'sin-brecha'
  else if (mejor && mejor.cobertura >= res.A0.cobertura - 1e-9) estado = 'factible-encontrada'
  else estado = 'no-encontrada'
  return { id: e.id, modo: e.modo, nPart: Object.keys(inp.contratos ?? {}).length, validos, estado, brecha, mejorCobertura: mejor?.cobertura ?? null, res, cotas }
}

describe.skipIf(!ACTIVO)('benchmark offline AH2-020', () => {
  it(`${N} escenarios sintéticos`, { timeout: 30 * 60 * 1000 }, () => {
    const filas = Array.from({ length: N }, (_, i) => evaluar(generarEscenario(i)))
    if (process.env.AH2_BENCH_OUT) writeFileSync(process.env.AH2_BENCH_OUT, JSON.stringify(filas))
    expect(filas.length).toBe(N)
  })
})
