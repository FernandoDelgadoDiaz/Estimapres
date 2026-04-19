// src/algoritmo/orquestador.ts
// Pipeline completo del algoritmo de horarios v2.
// Integra las tres pasadas y produce el ResultadoSemanal final.
// Referencia: ai/architecture.md §6.

import type { InputAlgoritmo, ResultadoSemanal } from './types';
import { ejecutarPasada1 } from './pasada1-fullpart';
import { ejecutarPasada2 } from './pasada2-auxiliares';
import { ejecutarPasada3 } from './pasada3-eventuales';
import { calcularMetricasCobertura } from './validador';

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
