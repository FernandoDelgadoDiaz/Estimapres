// #7 · AH2-020 (APROBADO, B conjunta) — Generación con multi-arranque.
//
// Objetivo: mejorar la cobertura POM redistribuyendo las horas disponibles, SIN reducir
// horas contractuales ni relajar reglas. El motor actual (arranque en frío con prioridad
// lexicográfica de horas) es el RESPALDO: nunca se acepta un candidato peor que él.
//
// Estrategias (todas con la MISMA entrada, reglas y prioridad de horas; solo cambia el
// punto de partida de la búsqueda local de la pasada 1):
//   actual          respaldo: arranque en frío (comportamiento previo, sin cambios).
//   desde-sin-prioridad   semillas = solución de la cascada sin prioridad de horas (A0).
//   full-fijos      semillas = solo las semanas FULL del respaldo (benchmark: escenario 66).
//   alternada-1/2   alternancia desde el respaldo: A0 sembrada con él → prioridad sembrada con
//                   ese A0; la 2 repite una vuelta (benchmark: escenario 156).
//   alternada-ms-1/2  la misma alternancia partiendo de «desde-sin-prioridad» (escenario 130).
//
// Selección: solo candidatos que pasan la validación independiente sin violaciones que
// el respaldo no tenga y que no bajan las horas de NINGUNA persona frente al respaldo.
// Entre ellos: mayor cobertura; a igual cobertura, menos sobrantes; empate → respaldo.
import { convertirOutputDeV2 } from '../algoritmo/adapter'
import { compararImpactoHoras, ejecutarAlgoritmo, inputSinPrioridadHoras, tieneObjetivoHoras } from '../algoritmo/orquestador'
import type { InputAlgoritmo, Jornada, ResultadoSemanal } from '../algoritmo/types'
import type { Auxiliar, Colaborador, Eventual, ResultadoAsignacion } from '../types'
import { validarResultadoSemana, type ContextoValidacionSemana } from './validacionSemana'

export type EstrategiaMultiArranque = 'actual' | 'desde-sin-prioridad' | 'full-fijos' | 'alternada-1' | 'alternada-2' | 'alternada-ms-1' | 'alternada-ms-2'
export const ESTRATEGIAS_MULTI_ARRANQUE: EstrategiaMultiArranque[] = ['actual', 'desde-sin-prioridad', 'full-fijos', 'alternada-1', 'alternada-2', 'alternada-ms-1', 'alternada-ms-2']
/** Cada estrategia que necesita a otra como punto de partida. */
const DEPENDE_DE: Partial<Record<EstrategiaMultiArranque, EstrategiaMultiArranque>> = {
  'alternada-2': 'alternada-1', 'alternada-ms-1': 'desde-sin-prioridad', 'alternada-ms-2': 'alternada-ms-1',
}

export interface CandidatoMultiArranque {
  estrategia: EstrategiaMultiArranque
  coberturaPct: number
  sobrantesHoras: number
  faltantesHoras: number
  violaciones: number
  elegible: boolean
  motivoDescarte?: string
  ms: number
}

export interface SeleccionMultiArranque {
  estrategia: EstrategiaMultiArranque
  coberturaRespaldoPct: number
  coberturaElegidaPct: number
  /** Estrategias que no se corrieron por agotar el presupuesto de tiempo. */
  omitidas: EstrategiaMultiArranque[]
  candidatos: CandidatoMultiArranque[]
  tiempoMs: number
}

/** Presupuesto total del multi-arranque (el respaldo siempre se corre completo). */
export const PRESUPUESTO_MULTI_ARRANQUE_MS = 20_000
const EPS = 1e-9

const suma = (m: number[][]) => m.flat().reduce((a, b) => a + b, 0) / 2
const slots = (sem: Jornada[] | undefined) => (sem ?? []).reduce((n, j) => n + j.bloques.reduce((m, b) => m + b.slot_fin - b.slot_inicio, 0), 0)
const semanas = (r: ResultadoSemanal): Record<string, Jornada[]> => ({ ...r.jornadas_full, ...r.jornadas_part })
const claveViolacion = (v: { codigo: string; colaboradorId?: string; dia?: number; franja?: string }) => `${v.codigo}|${v.colaboradorId ?? ''}|${v.dia ?? ''}|${v.franja ?? ''}`

export interface EntradaMultiArranque {
  input: InputAlgoritmo
  cajeros: Colaborador[]
  auxiliares: Auxiliar[]
  eventuales: Eventual[]
  contexto: ContextoValidacionSemana
  presupuestoMs?: number
  /** Solo pruebas: restringe las estrategias corridas (el respaldo siempre corre). */
  estrategias?: EstrategiaMultiArranque[]
}

export interface SalidaMultiArranque {
  resultadoV2: ResultadoSemanal
  resultado: ResultadoAsignacion
  seleccion: SeleccionMultiArranque
}

export function generarConMultiArranque(e: EntradaMultiArranque): SalidaMultiArranque {
  const t0 = Date.now()
  const presupuesto = e.presupuestoMs ?? PRESUPUESTO_MULTI_ARRANQUE_MS
  const pedidas = new Set(e.estrategias ?? ESTRATEGIAS_MULTI_ARRANQUE)
  const base: InputAlgoritmo = { ...e.input, semillas: undefined, omitir_impacto_horas: true }
  const conHoras = tieneObjetivoHoras(base)
  const sinPrioridad = inputSinPrioridadHoras(base)

  const correr = (inp: InputAlgoritmo) => { const t = Date.now(); const r = ejecutarAlgoritmo(inp); return { r, ms: Date.now() - t } }
  const validar = (r: ResultadoSemanal) => validarResultadoSemana(convertirOutputDeV2(r, e.cajeros, e.auxiliares, e.eventuales), e.cajeros, e.auxiliares, e.eventuales, e.contexto)

  const respaldo = correr(base)
  const vRespaldo = validar(respaldo.r)
  const permitidas = new Set(vRespaldo.violaciones.map(claveViolacion))
  const horasRespaldo = semanas(respaldo.r)

  const ficha = (estrategia: EstrategiaMultiArranque, x: { r: ResultadoSemanal; ms: number }, violaciones: number, motivoDescarte?: string): CandidatoMultiArranque => ({
    estrategia, coberturaPct: x.r.metricas.cobertura_total_pct, sobrantesHoras: suma(x.r.metricas.exceso_por_slot), faltantesHoras: suma(x.r.metricas.deficit_por_slot),
    violaciones, elegible: !motivoDescarte, motivoDescarte, ms: x.ms,
  })
  const candidatos: CandidatoMultiArranque[] = [ficha('actual', respaldo, vRespaldo.violaciones.length)]
  const resultados = new Map<EstrategiaMultiArranque, ResultadoSemanal>([['actual', respaldo.r]])
  const omitidas: EstrategiaMultiArranque[] = []

  const evaluar = (estrategia: EstrategiaMultiArranque, x: { r: ResultadoSemanal; ms: number }, candidato = true) => {
    resultados.set(estrategia, x.r)
    if (!candidato) return
    const v = validar(x.r)
    const nuevas = v.violaciones.filter(w => !permitidas.has(claveViolacion(w)))
    const sem = semanas(x.r)
    const menosHoras = Object.keys(horasRespaldo).filter(id => slots(sem[id]) < slots(horasRespaldo[id]))
    const motivo = nuevas.length
      ? `${nuevas.length} violación(es) que la solución de respaldo no tiene (${[...new Set(nuevas.map(w => w.codigo))].join(', ')})`
      : menosHoras.length ? `asigna menos horas que el respaldo a ${menosHoras.length} persona(s)` : undefined
    candidatos.push(ficha(estrategia, x, v.violaciones.length, motivo))
  }
  const hayTiempo = () => Date.now() - t0 < presupuesto

  // A0 en frío: punto de partida de «desde-sin-prioridad» y referencia del impacto de la prioridad.
  let a0: ResultadoSemanal | undefined
  if (conHoras && hayTiempo()) {
    a0 = correr(sinPrioridad).r
    const alternar = (desde: ResultadoSemanal) => {
      const aSem = ejecutarAlgoritmo({ ...sinPrioridad, semillas: semanas(desde) })
      return ejecutarAlgoritmo({ ...base, semillas: semanas(aSem) })
    }
    const ejecutores: Record<Exclude<EstrategiaMultiArranque, 'actual'>, () => ResultadoSemanal> = {
      'desde-sin-prioridad': () => ejecutarAlgoritmo({ ...base, semillas: semanas(a0!) }),
      'full-fijos': () => ejecutarAlgoritmo({ ...base, semillas: { ...respaldo.r.jornadas_full } }),
      'alternada-1': () => alternar(respaldo.r),
      'alternada-2': () => alternar(resultados.get('alternada-1')!),
      'alternada-ms-1': () => alternar(resultados.get('desde-sin-prioridad')!),
      'alternada-ms-2': () => alternar(resultados.get('alternada-ms-1')!),
    }
    // Se corren las pedidas y aquellas de las que dependen (en el orden de la lista).
    const necesarias = new Set<EstrategiaMultiArranque>()
    for (const n of pedidas) for (let k: EstrategiaMultiArranque | undefined = n; k; k = DEPENDE_DE[k]) necesarias.add(k)
    for (const nombre of ESTRATEGIAS_MULTI_ARRANQUE) {
      if (nombre === 'actual' || !necesarias.has(nombre)) continue
      const previa = DEPENDE_DE[nombre]
      if (!hayTiempo() || (previa && !resultados.has(previa))) { if (pedidas.has(nombre)) omitidas.push(nombre); continue }
      const t = Date.now()
      const r = ejecutores[nombre]()
      evaluar(nombre, { r, ms: Date.now() - t }, pedidas.has(nombre))
    }
  }

  const elegibles = candidatos.filter(c => c.elegible)
  let elegido = candidatos[0]
  for (const c of elegibles) {
    if (c.coberturaPct > elegido.coberturaPct + EPS) elegido = c
    else if (Math.abs(c.coberturaPct - elegido.coberturaPct) <= EPS && c.sobrantesHoras < elegido.sobrantesHoras - EPS) elegido = c
  }
  const final = resultados.get(elegido.estrategia)!
  const resultadoV2: ResultadoSemanal = {
    ...final,
    impacto_horas: a0 ? compararImpactoHoras(base.demanda, final.metricas, a0.metricas, base.cobertura_objetivo_pct) : undefined,
  }
  const seleccion: SeleccionMultiArranque = {
    estrategia: elegido.estrategia,
    coberturaRespaldoPct: respaldo.r.metricas.cobertura_total_pct,
    coberturaElegidaPct: final.metricas.cobertura_total_pct,
    omitidas, candidatos, tiempoMs: Date.now() - t0,
  }
  // En el resultado visible se omiten los tiempos: la generación debe ser reproducible
  // (misma entrada → mismo resultado). Los tiempos quedan en `seleccion` para diagnóstico.
  const multiArranque: SeleccionMultiArranque = { ...seleccion, tiempoMs: 0, candidatos: candidatos.map(c => ({ ...c, ms: 0 })) }
  const resultado = { ...convertirOutputDeV2(resultadoV2, e.cajeros, e.auxiliares, e.eventuales), multiArranque }
  return { resultadoV2, resultado, seleccion }
}
