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

function correrCascada(input: InputAlgoritmo) {
  const p1 = ejecutarPasada1(input);
  const p2 = ejecutarPasada2(input, p1);
  const p3 = ejecutarPasada3(input, p2);
  const metricas = calcularMetricasCobertura(input.demanda, p1.jornadas_full, p1.jornadas_part, p2.asignacion_aux, p3.asignacion_eventual, p3.deficit_3);
  return { p1, p2, p3, metricas };
}

/**
 * #7 · AH2-020 (PROPUESTO): la prioridad de las horas objetivo PART NO cambia, pero
 * se mide su costo frente a la misma cascada SIN esa prioridad (mismas reglas, mismo
 * tope). Se informa cobertura, faltantes, sobrantes y franjas (marcando picos) que
 * empeoran, y si la cobertura queda bajo el objetivo operativo solo por las horas.
 */
function medirImpactoHoras(input: InputAlgoritmo, real: ReturnType<typeof correrCascada>): ImpactoPrioridadHoras | undefined {
  const contratos = input.contratos ?? {};
  if (!Object.values(contratos).some(c => c.objetivoSlots !== null)) return undefined;
  const alt = correrCascada({
    ...input,
    contratos: Object.fromEntries(Object.entries(contratos).map(([id, c]) => [id, { ...c, objetivoSlots: null }])),
  });
  const suma = (m: number[][]) => m.flat().reduce((a, b) => a + b, 0) / 2;
  const franjasPeores: ImpactoPrioridadHoras['franjasPeores'] = [];
  for (let d = 0; d < 7; d++) {
    const pico = Math.max(...input.demanda[d]);
    for (let s = 0; s < 30; s++) {
      const antes = alt.metricas.deficit_por_slot[d][s];
      const despues = real.metricas.deficit_por_slot[d][s];
      if (despues > antes) franjasPeores.push({ dia: d, slot: s, antes, despues, pico: pico > 0 && input.demanda[d][s] === pico });
    }
  }
  return {
    coberturaConPrioridadPct: real.metricas.cobertura_total_pct,
    coberturaSinPrioridadPct: alt.metricas.cobertura_total_pct,
    faltantesConPrioridadHoras: suma(real.metricas.deficit_por_slot),
    faltantesSinPrioridadHoras: suma(alt.metricas.deficit_por_slot),
    sobrantesConPrioridadHoras: suma(real.metricas.exceso_por_slot),
    sobrantesSinPrioridadHoras: suma(alt.metricas.exceso_por_slot),
    franjasPeores,
    coberturaObjetivoPct: input.cobertura_objetivo_pct ?? COBERTURA_OBJETIVO_PCT,
  };
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
  const real = correrCascada(input);
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
