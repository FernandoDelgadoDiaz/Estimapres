// src/algoritmo/orquestador.ts
// Pipeline completo del algoritmo de horarios v2.
// Integra las tres pasadas y produce el ResultadoSemanal final.
// Referencia: ai/architecture.md §6.

import type { InputAlgoritmo, ResultadoSemanal } from './types';
import { ejecutarPasada1 } from './pasada1-fullpart';
import { ejecutarPasada2 } from './pasada2-auxiliares';
import { ejecutarPasada3 } from './pasada3-eventuales';
import { calcularMetricasCobertura } from './validador';

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
  // Pasada 1: FULL + PART
  const p1 = ejecutarPasada1(input);

  // Pasada 2: AUX
  const p2 = ejecutarPasada2(input, p1);

  // Pasada 3: EVENTUAL (se ejecuta incluso si hay violaciones de input en P2 —
  // las violaciones se reportan pero no abortan el pipeline)
  const p3 = ejecutarPasada3(input, p2);

  // Metricas de cobertura
  const metricas = calcularMetricasCobertura(
    input.demanda,
    p1.jornadas_full,
    p1.jornadas_part,
    p2.asignacion_aux,
    p3.asignacion_eventual,
    p3.deficit_3
  );

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
  };
}
