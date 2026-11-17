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
export function ejecutarAlgoritmo(input: InputAlgoritmo): ResultadoSemanal {
  return construirResultado(input, correrCascada(input));
}

/** Evalúa una planificación FULL/PART del catálogo con las pasadas reales de apoyo. */
export function evaluarSemanasFullPart(input: InputAlgoritmo, semillas: NonNullable<InputAlgoritmo['semillas']>): ResultadoSemanal {
  const fijo = { ...input, semillas, omitir_impacto_horas: true };
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
  };
}
