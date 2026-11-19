import {prevalidarCondiciones,ErrorCondiciones} from '../algoritmo/condicionesSupervisor'
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
// Con corte de eventuales se prueba un refinamiento sobre esa solución,
// sin aumentar el déficit en ningún slot y con validación independiente estricta.
import { slotLimiteCajaEventual } from '../algoritmo/reglasCajaEventual'
import { convertirOutputDeV2, asignarIdentidadesV2 } from '../algoritmo/adapter'
import { compararImpactoHoras, ejecutarAlgoritmo, generarSemillaExploratoria, evaluarSemanasFullPart, inputSinPrioridadHoras, tieneObjetivoHoras } from '../algoritmo/orquestador'
import { desplazamientosCierre } from '../algoritmo/pasada1-fullpart'
import type { InputAlgoritmo, Jornada, ResultadoSemanal } from '../algoritmo/types'
import type { Auxiliar, Colaborador, Eventual, ResultadoAsignacion } from '../types'
import { validarResultadoSemana, type ContextoValidacionSemana } from './validacionSemana'

export type EstrategiaMultiArranque = 'actual' | 'desde-sin-prioridad' | 'full-fijos' | 'alternada-1' | 'alternada-2' | 'alternada-ms-1' | 'alternada-ms-2' | 'anticipar-cierre'
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
  /** Violaciones totales del candidato según el validador independiente. */
  violaciones: number
  /** Violaciones que el respaldo NO tiene (si > 0, el candidato se descarta). */
  violacionesNuevas: number
  /** Violaciones que ya tenía el respaldo (heredadas; NO hacen válido al horario). */
  violacionesPreexistentes: number
  /**
   * Elegible = sin violaciones nuevas y sin bajar horas frente al respaldo. NO significa
   * válido: un candidato elegible puede conservar violaciones preexistentes.
   */
  elegible: boolean
  /** Totalmente válido: cero violaciones (el validador lo declara publicable). */
  totalmenteValido: boolean
  motivoDescarte?: string
  ms: number
}

/**
 * Validación de la solución elegida:
 *  - 'valida': cero violaciones (la pantalla puede declararla VALIDADO, salvo limitaciones de datos);
 *  - 'con-violaciones-preexistentes': hereda violaciones del respaldo → BORRADOR, nunca publicable.
 */
export type ValidacionElegida = 'valida' | 'con-violaciones-preexistentes' | 'sin-verificar'

export interface SeleccionMultiArranque {
  estrategia: EstrategiaMultiArranque
  coberturaRespaldoPct: number
  coberturaElegidaPct: number
  /** Estrategias pedidas que no se corrieron por agotar el presupuesto de tiempo. */
  omitidas: EstrategiaMultiArranque[]
  /** Por qué no hubo alternativas al respaldo (si no las hubo). */
  sinAlternativas?: 'sin-objetivo-horas' | 'presupuesto-agotado'
  validacion: ValidacionElegida
  /** Violaciones de la solución elegida (todas preexistentes en el respaldo). */
  violacionesElegida: number
  candidatos: CandidatoMultiArranque[]
  tiempoMs: number
  versionAlgoritmo: string
  descartadasPorCondiciones?:Array<{estrategia:EstrategiaMultiArranque;codigo:string}>
}

/**
 * Versión del algoritmo de generación que se persiste con cada semana.
 * Cambiarla cuando cambien las estrategias, la selección o las prioridades del motor.
 */
export const PREFIJO_AVISO_MULTI_ARRANQUE = 'Multi-arranque: '
export const VERSION_ALGORITMO = 'ah2-v2.1-multiarranque-2026-11-14'

/** Registro persistible (jsonb `horario_completo.generacion`) de cómo se generó la semana. */
export interface RegistroGeneracion {
  versionAlgoritmo: string
  estrategia: EstrategiaMultiArranque
  coberturaRespaldoPct: number
  coberturaElegidaPct: number
  /** Puntos porcentuales ganados frente al respaldo (≥ 0 por construcción). */
  mejoraPp: number
  omitidas: EstrategiaMultiArranque[]
  sinAlternativas?: SeleccionMultiArranque['sinAlternativas']
  validacion: ValidacionElegida
}

export function registroGeneracion(s: SeleccionMultiArranque): RegistroGeneracion {
  return {
    versionAlgoritmo: s.versionAlgoritmo,
    estrategia: s.estrategia,
    coberturaRespaldoPct: s.coberturaRespaldoPct,
    coberturaElegidaPct: s.coberturaElegidaPct,
    mejoraPp: Math.round((s.coberturaElegidaPct - s.coberturaRespaldoPct) * 100) / 100,
    omitidas: [...s.omitidas],
    ...(s.sinAlternativas ? { sinAlternativas: s.sinAlternativas } : {}),
    validacion: s.validacion,
  }
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
  /** Comparación offline contra la selección anterior. */
  omitirAnticipacionCierre?: boolean
  /** Solo pruebas: reloj en ms (para simular el agotamiento del presupuesto). */
  reloj?: () => number
}

export interface SalidaMultiArranque {
  resultadoV2: ResultadoSemanal
  resultado: ResultadoAsignacion
  seleccion: SeleccionMultiArranque
}

export function generarConMultiArranque(e: EntradaMultiArranque): SalidaMultiArranque {
  if(e.input.condiciones_supervisor){
    const p=prevalidarCondiciones(e.input);if(p.conflictos.length)throw new ErrorCondiciones('PREFLIGHT_BLOQUEADO',p.conflictos)
    // Keep the original identity map (including homonyms); filter only validation roster.
    const identOriginal=asignarIdentidadesV2([...e.cajeros,...e.auxiliares,...e.eventuales])
    const result=generarConMultiArranque({...e,input:p.input,contexto:{...e.contexto,excepciones:(p.input.excepciones??[]).map(x=>({...x,colaboradorId:x.colaboradorId?(identOriginal.uiPorV2.get(x.colaboradorId)?.id??x.colaboradorId):undefined})),maxFrancosPorDia:p.input.max_francos_por_dia}})
    return result
  }
  const ahora = e.reloj ?? Date.now
  const t0 = ahora()
  const presupuesto = e.presupuestoMs ?? PRESUPUESTO_MULTI_ARRANQUE_MS
  const pedidas = new Set(e.estrategias ?? ESTRATEGIAS_MULTI_ARRANQUE)
  const base: InputAlgoritmo = { ...e.input, semillas: undefined, omitir_impacto_horas: true }
  const conHoras = tieneObjetivoHoras(base)
  const sinPrioridad = inputSinPrioridadHoras(base)

  const correr = (inp: InputAlgoritmo) => { const t = ahora(); const r = base.auditoria_condiciones&&Object.entries(base.contratos??{}).some(([id,c])=>c.objetivoSlots!==null&&inp.contratos?.[id]?.objetivoSlots===null)?generarSemillaExploratoria(inp):ejecutarAlgoritmo(inp); return { r, ms: ahora() - t } }
  const ident = asignarIdentidadesV2([...e.cajeros,...e.auxiliares,...e.eventuales])
  const aUi=<T>(dict:Record<string,T>|undefined)=>dict && Object.fromEntries(Object.entries(dict).map(([id,v])=>[ident.uiPorV2.get(id)?.id??id,v]))
  const contexto = base.politica_recursos_version ? {...e.contexto,maxFrancosDia:base.max_francos_dia??e.contexto.maxFrancosDia,operativa:{...e.contexto.operativa,
    politica_recursos_version:base.politica_recursos_version,supervision_apertura_externa:base.supervision_apertura_externa,max_caja_eventual_slots:aUi(base.max_caja_eventual_slots),reservas_sector_eventual:aUi(base.reservas_sector_eventual),
    aperturaSoloAux:base.apertura_solo_aux??true,sinAuxCierre:base.sin_aux_cierre??true,supervisorJornadaCompleta:base.supervisor_jornada_completa??false,francoMedioCorridos:base.franco_medio_corridos??false,
    maxBloquesCajaEventualDia:base.max_bloques_caja_eventual_dia,eventualesCajaHoraLimite:base.eventuales_caja_hora_limite}}:e.contexto
  const automaticos=e.cajeros.filter(p=>!base.auditoria_condiciones?.excluidos.includes(ident.v2PorUi.get(p.id)??p.id))
  const validar = (r: ResultadoSemanal) => validarResultadoSemana(convertirOutputDeV2(r, e.cajeros, e.auxiliares, e.eventuales), automaticos, e.auxiliares, e.eventuales, contexto)

  const respaldo = correr(base)
  const vRespaldo = validar(respaldo.r)
  const permitidas = new Set(vRespaldo.violaciones.map(claveViolacion))
  const horasRespaldo = semanas(respaldo.r)

  const ficha = (estrategia: EstrategiaMultiArranque, x: { r: ResultadoSemanal; ms: number }, violaciones: number, nuevas: number, motivoDescarte?: string): CandidatoMultiArranque => ({
    estrategia, coberturaPct: x.r.metricas.cobertura_total_pct, sobrantesHoras: suma(x.r.metricas.exceso_por_slot), faltantesHoras: suma(x.r.metricas.deficit_por_slot),
    violaciones, violacionesNuevas: nuevas, violacionesPreexistentes: violaciones - nuevas,
    elegible: !motivoDescarte, totalmenteValido: violaciones === 0, motivoDescarte, ms: x.ms,
  })
  const candidatos: CandidatoMultiArranque[] = [ficha('actual', respaldo, vRespaldo.violaciones.length, 0, base.politica_recursos_version && vRespaldo.violaciones.length ? 'La política de recursos requiere una referencia válida' : undefined)]
  const resultados = new Map<EstrategiaMultiArranque, ResultadoSemanal>([['actual', respaldo.r]])
  const omitidas: EstrategiaMultiArranque[] = []
  const descartadasPorCondiciones:Array<{estrategia:EstrategiaMultiArranque;codigo:string}>=[]

  const evaluar = (estrategia: EstrategiaMultiArranque, x: { r: ResultadoSemanal; ms: number }, candidato = true) => {
    resultados.set(estrategia, x.r)
    if (!candidato) return
    const v = validar(x.r)
    const nuevas = v.violaciones.filter(w => !permitidas.has(claveViolacion(w)))
    const sem = semanas(x.r)
    const menosHoras = Object.keys(horasRespaldo).filter(id => slots(sem[id]) < slots(horasRespaldo[id]))
    const degradaFranja = base.politica_recursos_version && vRespaldo.violaciones.length===0 && x.r.metricas.deficit_por_slot.some((fila,d)=>fila.some((n,s)=>n>respaldo.r.metricas.deficit_por_slot[d][s]))
    const motivo = base.politica_recursos_version && v.violaciones.length ? 'La candidata no satisface la política de recursos' : degradaFranja ? 'Aumenta el déficit de una franja protegida' : nuevas.length
      ? `${nuevas.length} violación(es) que la solución de respaldo no tiene (${[...new Set(nuevas.map(w => w.codigo))].join(', ')})`
      : menosHoras.length ? `asigna menos horas que el respaldo a ${menosHoras.length} persona(s)` : undefined
    candidatos.push(ficha(estrategia, x, v.violaciones.length, nuevas.length, motivo))
  }
  const hayTiempo = () => ahora() - t0 < presupuesto
  const alternativas = ESTRATEGIAS_MULTI_ARRANQUE.filter(n => n !== 'actual' && pedidas.has(n))
  let sinAlternativas: SeleccionMultiArranque['sinAlternativas']

  // A0 en frío: punto de partida de «desde-sin-prioridad» y referencia del impacto de la prioridad.
  let a0: ResultadoSemanal | undefined
  if (!conHoras) sinAlternativas = 'sin-objetivo-horas'
  else if (!hayTiempo()) {
    // Presupuesto agotado con el respaldo: no se corre ninguna alternativa y TODAS se informan.
    sinAlternativas = 'presupuesto-agotado'
    omitidas.push(...alternativas)
  } else {
    a0 = correr(sinPrioridad).r
    const alternar = (desde: ResultadoSemanal) => {
      const aSem = (base.auditoria_condiciones?generarSemillaExploratoria:ejecutarAlgoritmo)({ ...sinPrioridad, semillas: semanas(desde) })
      return ejecutarAlgoritmo({ ...base, semillas: semanas(aSem) })
    }
    const ejecutores: Record<Exclude<EstrategiaMultiArranque, 'actual' | 'anticipar-cierre'>, () => ResultadoSemanal> = {
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
      if (nombre === 'actual' || nombre === 'anticipar-cierre' || !necesarias.has(nombre)) continue
      const previa = DEPENDE_DE[nombre]
      if (!hayTiempo() || (previa && !resultados.has(previa))) { if (pedidas.has(nombre)) omitidas.push(nombre); continue }
      const t = ahora()
      try {
        const r = ejecutores[nombre]()
        evaluar(nombre, { r, ms: ahora() - t }, pedidas.has(nombre))
      }catch(error){
        if(!base.auditoria_condiciones||!(error instanceof ErrorCondiciones))throw error
        descartadasPorCondiciones.push({estrategia:nombre,codigo:error.codigo})
      }
    }
    if (alternativas.length && omitidas.length === alternativas.length) sinAlternativas = 'presupuesto-agotado'
  }

  const elegibles = candidatos.filter(c => c.elegible)
  let elegido = base.politica_recursos_version ? (elegibles[0] ?? candidatos[0]) : candidatos[0]
  for (const c of elegibles) {
    if (c.coberturaPct > elegido.coberturaPct + EPS) elegido = c
    else if (Math.abs(c.coberturaPct - elegido.coberturaPct) <= EPS && c.sobrantesHoras < elegido.sobrantesHoras - EPS) elegido = c
  }
  if(base.politica_recursos_version) {
    const usos=(c:CandidatoMultiArranque)=>Object.values(resultados.get(c.estrategia)!.asignacion_eventual).flat(2).filter(s=>s==='CAJA').length
    for(const c of elegibles) if(Math.abs(c.coberturaPct-elegido.coberturaPct)<=EPS && Math.abs(c.sobrantesHoras-elegido.sobrantesHoras)<=EPS && usos(c)<usos(elegido)) elegido=c
  }
  if(base.auditoria_condiciones){
    const usos=(c:CandidatoMultiArranque)=>Object.values(resultados.get(c.estrategia)!.asignacion_eventual).flat(2).filter(s=>s==='CAJA').length
    for(const c of elegibles)if(Math.abs(c.coberturaPct-elegido.coberturaPct)<=EPS&&Math.abs(c.sobrantesHoras-elegido.sobrantesHoras)<=EPS&&(!base.politica_recursos_version||usos(c)===usos(elegido))&&(resultados.get(c.estrategia)!.preferencias_manuales_incumplidas??Infinity)<(resultados.get(elegido.estrategia)!.preferencias_manuales_incumplidas??Infinity))elegido=c
  }
  const referencia = resultados.get(elegido.estrategia)!
  const limite = slotLimiteCajaEventual(base.eventuales_caja_hora_limite)
  if (!e.omitirAnticipacionCierre && limite !== undefined &&
      referencia.metricas.deficit_por_slot.some(fila => fila.slice(limite).some(Boolean))) {
    if (!hayTiempo()) omitidas.push('anticipar-cierre')
    else {
      const inicioCierre = ahora()
      let mejor = referencia
      let agotado = false
      let sinMejora = 'ningún desplazamiento aceptable'
      // Cada movimiento aprobado se convierte en el nuevo piso de cobertura.
      // Una mejora estricta del déficit de cierre acota las iteraciones.
      for (;;) {
        const baseSemanas = semanas(mejor)
        let siguiente = mejor
        for (const jornada of desplazamientosCierre(base, baseSemanas, mejor.metricas.deficit_por_slot, limite)) {
          if (!hayTiempo()) { agotado = true; break }
          const propuestas = { ...baseSemanas, [jornada.colab_id]: baseSemanas[jornada.colab_id].map(j => j.dia === jornada.dia ? jornada : j) }
          const propuesta = evaluarSemanasFullPart(base, propuestas)
          const validacion = validar(propuesta)
          const motivo = motivoDescarteCierre(base, limite, mejor, propuesta, validacion.publicable)
          if (!motivo && suma(propuesta.metricas.deficit_por_slot) < suma(siguiente.metricas.deficit_por_slot)) siguiente = propuesta
          else if (motivo) sinMejora = motivo
        }
        if (siguiente === mejor) break
        mejor = siguiente
        if (agotado) break
      }
      if (agotado) omitidas.push('anticipar-cierre')
      const v = validar(mejor)
      candidatos.push(ficha('anticipar-cierre', { r: mejor, ms: ahora() - inicioCierre }, v.violaciones.length,
        v.violaciones.filter(w => !permitidas.has(claveViolacion(w))).length, mejor === referencia ? sinMejora : undefined))
      if (mejor !== referencia) {
        resultados.set('anticipar-cierre', mejor)
        elegido = candidatos[candidatos.length - 1]
      }
    }
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
    omitidas,
    ...(sinAlternativas ? { sinAlternativas } : {}),
    validacion: (base.politica_recursos_version||base.auditoria_condiciones) && elegido.totalmenteValido ? 'sin-verificar' : elegido.totalmenteValido ? 'valida' : 'con-violaciones-preexistentes',
    violacionesElegida: elegido.violaciones,
    candidatos, ...(descartadasPorCondiciones.length?{descartadasPorCondiciones}:{}), tiempoMs: ahora() - t0,
    versionAlgoritmo: base.politica_recursos_version ? `${VERSION_ALGORITMO}+recursos-v1` : base.max_bloques_caja_eventual_dia !== undefined || base.eventuales_caja_hora_limite !== undefined
      ? `${VERSION_ALGORITMO}+caja-eventual-v1${elegido.estrategia === 'anticipar-cierre' ? '+cierre-v1' : ''}`
      : VERSION_ALGORITMO,
  }
  // En el resultado visible se omiten los tiempos: la generación debe ser reproducible
  // (misma entrada → mismo resultado). Los tiempos quedan en `seleccion` para diagnóstico.
  if(base.auditoria_condiciones)seleccion.versionAlgoritmo+='+condiciones-v1'
  const multiArranque: SeleccionMultiArranque = { ...seleccion, tiempoMs: 0, candidatos: candidatos.map(c => ({ ...c, ms: 0 })) }
  const salida = convertirOutputDeV2(resultadoV2, e.cajeros, e.auxiliares, e.eventuales)
  if(base.politica_recursos_version) salida.alertas.push('Recursos v1: AH2-040 pendiente de homologación de comparabilidad individual. No publicable.')
  // Un candidato «sin violaciones nuevas» NO es un horario válido: si hereda violaciones
  // del respaldo se avisa expresamente; la pantalla lo deja en BORRADOR (validador independiente).
  if (seleccion.validacion === 'con-violaciones-preexistentes') {
    salida.alertas = [...salida.alertas, `${PREFIJO_AVISO_MULTI_ARRANQUE}la solución elegida («${elegido.estrategia}») no agrega violaciones, pero conserva ${elegido.violaciones} que ya tenía el motor de respaldo. No es publicable: queda en BORRADOR hasta corregirlas.`]
  }
  const resultado = { ...salida, multiArranque }
  return { resultadoV2, resultado, seleccion }
}

/** Compara cascadas completas por slot: un faltante en otra franja no se compensa. */
function motivoDescarteCierre(
  input: InputAlgoritmo, limite: number, antes: ResultadoSemanal, despues: ResultadoSemanal, valido: boolean,
): string | undefined {
  if (!valido) return 'el candidato de cierre no supera la validación independiente'
  const jornadas = semanas(despues)
  const previas = semanas(antes)
  for (const persona of input.colaboradores) {
    if (persona.rol !== 'FULL' && persona.rol !== 'PART') continue
    const contrato = input.contratos?.[persona.id]
    const objetivo = persona.rol === 'PART' ? contrato?.objetivoSlots : undefined
    const asignado = slots(jornadas[persona.id])
    if (asignado !== slots(previas[persona.id]) || (objetivo != null && asignado !== objetivo)) {
      return 'el candidato de cierre no conserva todas las horas contractuales'
    }
  }
  const faltantes = antes.metricas.deficit_por_slot
  const nuevos = despues.metricas.deficit_por_slot
  if (nuevos.some((fila, d) => fila.some((n, s) => n > faltantes[d][s]))) {
    return 'el candidato de cierre traslada faltantes a otra franja'
  }
  if (suma(despues.metricas.exceso_por_slot) > suma(antes.metricas.exceso_por_slot)) {
    return 'el candidato de cierre aumenta los sobrantes'
  }
  if (!nuevos.some((fila, d) => fila.some((n, s) => s >= limite && n < faltantes[d][s]))) {
    return 'el candidato no mejora la cobertura de cierre'
  }
}
