// src/algoritmo/validador.ts
// Validador independiente y calculador de métricas de cobertura.
// Referencia: ai/architecture.md §7.
// STATUS: placeholder — a implementar después de los Prompts 1, 2 y 3.

import type { DiaSemana, SlotIdx } from './types';
import { MatrizDemanda, AsignacionAux, AsignacionEv, MetricasCobertura } from './types';

export function calcularMetricasCobertura(
  _demanda: MatrizDemanda,
  _jornadas_full: Record<string, Array<{ dia: DiaSemana; bloques: Array<{ slot_inicio: SlotIdx; slot_fin: SlotIdx }> }>>,
  _jornadas_part: Record<string, Array<{ dia: DiaSemana; bloques: Array<{ slot_inicio: SlotIdx; slot_fin: SlotIdx }> }>>,
  _asignacion_aux: Record<string, AsignacionAux[][]>,
  _asignacion_eventual: Record<string, AsignacionEv[][]>
): MetricasCobertura {
  // 1. Calcular cobertura total por slot (suma de cajeros + AUX + eventuales)
  // 2. Calcular déficit = max(0, demanda - cobertura)
  // 3. Calcular exceso = max(0, cobertura - demanda)
  // 4. Calcular porcentaje de cobertura global
  // 5. Calcular horas de caja por eventual (slots donde asignacion_eventual = "CAJA")

  const cobertura_total_pct = 0;
  const deficit_por_slot: number[][] = Array.from({ length: 7 }, () => Array(30).fill(0));
  const exceso_por_slot: number[][] = Array.from({ length: 7 }, () => Array(30).fill(0));
  const horas_caja_por_eventual: Record<string, number> = {};

  return {
    cobertura_total_pct,
    deficit_por_slot,
    exceso_por_slot,
    horas_caja_por_eventual,
  };
}

export function validarIntegridadResultado(_resultado: any): { ok: boolean; errores: string[] } {
  // Validaciones de consistencia entre las estructuras del resultado
  // (ej: jornadas_full solo contiene ids de colaboradores FULL, etc.)
  return { ok: false, errores: [] };
}