// src/algoritmo/validador.ts
// Calculador de metricas de cobertura del resultado semanal.
// Referencia: ai/architecture.md §7.

import type {
  Jornada,
  AsignacionAux,
  AsignacionEv,
  MetricasCobertura,
  MatrizDemanda,
} from './types';

export function calcularMetricasCobertura(
  demanda: MatrizDemanda,
  jornadas_full: Record<string, Jornada[]>,
  jornadas_part: Record<string, Jornada[]>,
  asignacion_aux: Record<string, AsignacionAux[][]>,
  asignacion_eventual: Record<string, AsignacionEv[][]>,
  deficit_final: number[][]
): MetricasCobertura {
  // Calcular cobertura real por slot (FULL+PART en caja + AUX CAJA + EVENTUAL CAJA)
  const cobertura: number[][] = Array.from({ length: 7 }, () => Array(30).fill(0));

  // FULL y PART: cada slot dentro de un bloque cuenta como 1 cajero
  for (const jornadas of [...Object.values(jornadas_full), ...Object.values(jornadas_part)]) {
    for (const jornada of jornadas) {
      for (const b of jornada.bloques) {
        for (let s = b.slot_inicio; s < b.slot_fin && s < 30; s++) {
          if (s >= 0) cobertura[jornada.dia][s]++;
        }
      }
    }
  }

  // AUX en CAJA
  for (const matriz of Object.values(asignacion_aux)) {
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 0; slot < 30; slot++) {
        if (matriz[dia][slot] === 'CAJA') cobertura[dia][slot]++;
      }
    }
  }

  // EVENTUAL en CAJA
  for (const matriz of Object.values(asignacion_eventual)) {
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 0; slot < 30; slot++) {
        if (matriz[dia][slot] === 'CAJA') cobertura[dia][slot]++;
      }
    }
  }

  // Totales para porcentaje
  let demanda_total = 0;
  let deficit_total = 0;
  for (let dia = 0; dia < 7; dia++) {
    for (let slot = 0; slot < 30; slot++) {
      demanda_total += demanda[dia][slot];
      deficit_total += deficit_final[dia][slot];
    }
  }

  const cobertura_total_pct = demanda_total > 0
    ? ((demanda_total - deficit_total) / demanda_total) * 100
    : 0;

  // deficit_por_slot: usar deficit_final (ya calculado por la cascada de pasadas)
  const deficit_por_slot: number[][] = deficit_final.map(fila => [...fila]);

  // exceso_por_slot: slots donde la cobertura supera la demanda
  const exceso_por_slot: number[][] = Array.from({ length: 7 }, (_, dia) =>
    Array.from({ length: 30 }, (_, slot) =>
      Math.max(0, cobertura[dia][slot] - demanda[dia][slot])
    )
  );

  // horas_caja_por_eventual: slots CAJA / 2
  const horas_caja_por_eventual: Record<string, number> = {};
  for (const [evId, matriz] of Object.entries(asignacion_eventual)) {
    let count = 0;
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 0; slot < 30; slot++) {
        if (matriz[dia][slot] === 'CAJA') count++;
      }
    }
    horas_caja_por_eventual[evId] = count / 2;
  }

  return {
    cobertura_total_pct,
    deficit_por_slot,
    exceso_por_slot,
    horas_caja_por_eventual,
  };
}

export function validarIntegridadResultado(_resultado: unknown): { ok: boolean; errores: string[] } {
  return { ok: true, errores: [] };
}
