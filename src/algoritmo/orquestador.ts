import {compilarDisponibilidadCaja} from './disponibilidadCajaEventual'
import {prevalidarCondiciones,ErrorCondiciones,costePreferencias,guiarPreferencias} from './condicionesSupervisor'
import {auditarEscenario} from './auditoriaV2'
// src/algoritmo/orquestador.ts
// Pipeline completo del algoritmo de horarios v2.
// Integra las tres pasadas y produce el ResultadoSemanal final.
// Referencia: ai/architecture.md §6.

import type { InputAlgoritmo, ResultadoSemanal } from './types';
import { ejecutarPasada1 } from './pasada1-fullpart';
import { ejecutarPasada2 } from './pasada2-auxiliares';
import { ejecutarPasada3 } from './pasada3-eventuales';
import { calcularMetricasCobertura } from './validador';
import type { ImpactoPrioridadHoras } from './contratos';

const COBERTURA_OBJETIVO_PCT = 95; // 091 (AH2-017); configurable por sucursal

function correrCascada(input: InputAlgoritmo, reoptimizar = true) {
  const p1 = ejecutarPasada1(input, reoptimizar);
  const p2 = ejecutarPasada2(input, p1);
  const p3 = ejecutarPasada3(input, p2);
  const metricas = calcularMetricasCobertura(input.demanda, p1.jornadas_full, p1.jornadas_part, p2.asignacion_aux, p3.asignacion_eventual, p3.deficit_3);
  return { p1, p2, p3, metricas };
}

type MetricasImpacto = Pick<ResultadoSemanal['metricas'], 'cobertura_total_pct' | 'deficit_por_slot' | 'exceso_por_slot'>;

/**
 * #7 · AH2-020: costo de la prioridad de horas objetivo PART frente a la misma cascada
 * SIN esa prioridad (mismas reglas, mismo tope). Compara dos resultados ya calculados:
 * cobertura, faltantes, sobrantes y franjas (marcando picos) que empeoran.
 */
export function compararImpactoHoras(
  demanda: number[][], conPrioridad: MetricasImpacto, sinPrioridad: MetricasImpacto, coberturaObjetivoPct = COBERTURA_OBJETIVO_PCT,
): ImpactoPrioridadHoras {
  const suma = (m: number[][]) => m.flat().reduce((a, b) => a + b, 0) / 2;
  const franjasPeores: ImpactoPrioridadHoras['franjasPeores'] = [];
  for (let d = 0; d < 7; d++) {
    const pico = Math.max(...demanda[d]);
    for (let s = 0; s < 30; s++) {
      const antes = sinPrioridad.deficit_por_slot[d][s];
      const despues = conPrioridad.deficit_por_slot[d][s];
      if (despues > antes) franjasPeores.push({ dia: d, slot: s, antes, despues, pico: pico > 0 && demanda[d][s] === pico });
    }
  }
  return {
    coberturaConPrioridadPct: conPrioridad.cobertura_total_pct,
    coberturaSinPrioridadPct: sinPrioridad.cobertura_total_pct,
    faltantesConPrioridadHoras: suma(conPrioridad.deficit_por_slot),
    faltantesSinPrioridadHoras: suma(sinPrioridad.deficit_por_slot),
    sobrantesConPrioridadHoras: suma(conPrioridad.exceso_por_slot),
    sobrantesSinPrioridadHoras: suma(sinPrioridad.exceso_por_slot),
    franjasPeores,
    coberturaObjetivoPct: coberturaObjetivoPct,
  };
}

/** Misma entrada, sin objetivo de horas PART (mismo tope y reglas). */
export function inputSinPrioridadHoras(input: InputAlgoritmo): InputAlgoritmo {
  const contratos = input.contratos ?? {};
  return { ...input, contratos: Object.fromEntries(Object.entries(contratos).map(([id, c]) => [id, { ...c, objetivoSlots: null }])) };
}

export function tieneObjetivoHoras(input: InputAlgoritmo): boolean {
  return Object.values(input.contratos ?? {}).some(c => c.objetivoSlots !== null);
}

function medirImpactoHoras(input: InputAlgoritmo, real: ReturnType<typeof correrCascada>): ImpactoPrioridadHoras | undefined {
  if (input.omitir_impacto_horas || !tieneObjetivoHoras(input)) return undefined;
  const alt = correrCascada({ ...inputSinPrioridadHoras(input), semillas: undefined });
  return compararImpactoHoras(input.demanda, real.metricas, alt.metricas, input.cobertura_objetivo_pct);
}

/**
 * CASCADA DE PRIORIDAD (estricta) para cubrir la demanda del PDF:
 *
 *  1. CAJEROS FULL/PART (Pasada 1). Aca se aplican TODAS las reglas del
 *     supervisor en el orden correcto:
 *       - reglas laborales duras: por construccion de la optimizacion
 *       - reglas por colaborador (franco fijo, no antes/despues, siempre
 *         manana/cierre): llegan como excepciones y se filtran DENTRO de
 *         la generacion de jornadas candidatas (nunca despues)
 *       - reglas de sucursal: min_cajeros_franja eleva la demanda ANTES de
 *         esta pasada (los cajeros la cubren primero); max_francos_dia
 *         clampa francos aca
 *       - preferencias blandas (rotacion/aprendizaje) y pesos de franja
 *         (criterios de cobertura): solo sesgan el score, nunca las duras
 *  2. AUX (Pasada 2): SOLO sobre el deficit residual de la Pasada 1, dentro
 *     de sus horarios predefinidos, siempre con >=1 AUX PARADO por slot
 *     (H-A2) y nunca en 22:00+ (H-A3).
 *  3. EVENTUALES (Pasada 3): SOLO sobre el deficit residual tras AUX,
 *     dentro de su disponibilidad, con distribucion equitativa (menos
 *     horas-caja acumuladas primero).
 */
/**
 * AH2-063 · La cobertura va primero: las preferencias blandas (rotación mensual, reparto de domingos, aprendizaje)
 * solo se aplican si el horario resultante no tiene más faltante que el mismo motor sin preferencias.
 */
export function ejecutarAlgoritmo(entrada: InputAlgoritmo): ResultadoSemanal {
  const prefs = entrada.preferencias_turno
  if (!prefs || !Object.keys(prefs).length) return ejecutarAlgoritmoBase(entrada)
  const faltante = (r: ResultadoSemanal) => r.metricas.deficit_por_slot.flat().reduce((a, b) => a + b, 0)
  let conPrefs: ResultadoSemanal | null = null, error: unknown = null
  try { conPrefs = ejecutarAlgoritmoBase(entrada) } catch (e) { error = e }
  let sinPrefs: ResultadoSemanal | null = null
  try { sinPrefs = ejecutarAlgoritmoBase({ ...entrada, preferencias_turno: undefined }) } catch (e) { if (!conPrefs) throw error ?? e }
  if (!conPrefs) return sinPrefs!
  if (!sinPrefs) return conPrefs
  return faltante(conPrefs) <= faltante(sinPrefs) ? conPrefs : { ...sinPrefs, preferencias_descartadas: true }
}

function ejecutarAlgoritmoBase(entrada: InputAlgoritmo): ResultadoSemanal {
  // Laboratorio AH2-037/040: perfiles de disponibilidad de caja EVENTUAL → reservas/topes existentes.
  const input = compilarDisponibilidadCaja(entrada).input
  if(!input.condiciones_supervisor&&!input.auditoria_condiciones)return construirResultado(input, correrCascada(input));
  const prepared=prevalidarCondiciones(input)
  if(prepared.conflictos.length)throw new ErrorCondiciones('PREFLIGHT_BLOQUEADO',prepared.conflictos)
  const base=construirResultado({...prepared.input,omitir_impacto_horas:true},correrCascada({...prepared.input,omitir_impacto_horas:true}))
  let chosen=base
  if(prepared.auditoria?.aplicadas.some(c=>c.modo==='PREFERIRIA')){
    const guide=guiarPreferencias(prepared.input),alt=construirResultado({...guide,omitir_impacto_horas:true},correrCascada({...guide,omitir_impacto_horas:true}))
    const bv=auditarEscenario(prepared.input,base),av=auditarEscenario(prepared.input,alt)
    const sum=(m:number[][])=>m.flat().reduce((a,b)=>a+b,0)
    const protectedSlots=alt.metricas.deficit_por_slot.every((row,d)=>row.every((n,s)=>n<=base.metricas.deficit_por_slot[d][s]))
    const ev=(r:ResultadoSemanal)=>Object.values(r.asignacion_eventual).flat(2).filter(v=>v==='CAJA').length
    const coverageGain=sum(alt.metricas.deficit_por_slot)<sum(base.metricas.deficit_por_slot)
    if(!av.violaciones.length && (bv.violaciones.length || protectedSlots && sum(alt.metricas.exceso_por_slot)<=sum(base.metricas.exceso_por_slot) && (coverageGain || (!prepared.input.politica_recursos_version||ev(alt)<=ev(base)) && (sum(alt.metricas.exceso_por_slot)<sum(base.metricas.exceso_por_slot) || costePreferencias(prepared.auditoria,alt)<costePreferencias(prepared.auditoria,base)))))chosen=alt
  }
  const validacion=auditarEscenario(prepared.input,chosen)
  if(validacion.violaciones.length)throw new ErrorCondiciones('GENERACION_SIN_PLAN_VALIDO',validacion.violaciones.map(v=>({codigo:v.codigo,causas:[],demostrado:false,detalle:v.detalle})))
  return {...chosen,auditoria_condiciones:prepared.auditoria,preferencias_manuales_incumplidas:costePreferencias(prepared.auditoria,chosen)}
}

/** Evalúa una planificación FULL/PART del catálogo con las pasadas reales de apoyo. */
export function evaluarSemanasFullPart(input: InputAlgoritmo, semillas: NonNullable<InputAlgoritmo['semillas']>): ResultadoSemanal {
  const prepared=prevalidarCondiciones(input)
  if(prepared.conflictos.length)throw new ErrorCondiciones("PREFLIGHT_BLOQUEADO",prepared.conflictos)
  const fijo = { ...prepared.input, semillas, omitir_impacto_horas: true };
  return construirResultado(fijo, correrCascada(fijo, false));
}

function construirResultado(input: InputAlgoritmo, real: ReturnType<typeof correrCascada>): ResultadoSemanal {
  const { p1, p2, p3, metricas } = real;
  const impacto_horas = medirImpactoHoras(input, real);

  // Reporte de reglas
  const todasViolaciones = [...p2.violaciones_input];

  return {
    semana: { desde: new Date(), hasta: new Date() },
    jornadas_full: p1.jornadas_full,
    jornadas_part: p1.jornadas_part,
    asignacion_aux: p2.asignacion_aux,
    asignacion_eventual: p3.asignacion_eventual,
    metricas,
    reporte_reglas: {
      duras_cumplidas: todasViolaciones.length === 0,
      violaciones: todasViolaciones,
      advertencias: p1.infactibles.map(id =>
        `Colaborador ${id} no pudo ser asignado con las restricciones dadas`
      ),
    },
    cumplimiento_horas: p1.cumplimiento_horas,
    impacto_horas,
    ...(input.auditoria_condiciones?{auditoria_condiciones:input.auditoria_condiciones}:{}),
  };
}

/** Solo exploración interna del multi-arranque: puede tener menos horas PART.
 * Nunca se selecciona ni se expone como propuesta; sus jornadas solo siembran
 * otra ejecución que restaura contratos y pasa la validación independiente.
 */
export function generarSemillaExploratoria(input:InputAlgoritmo):ResultadoSemanal{
 if(input.condiciones_supervisor)throw new Error('La semilla requiere condiciones previamente compiladas')
 const x={...input,omitir_impacto_horas:true}
 return construirResultado(x,correrCascada(x))
}
