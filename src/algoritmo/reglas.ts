// src/algoritmo/reglas.ts
// Validadores de reglas duras del algoritmo Aliada Horarios v2.
// Implementa: H-F1..H-F7 (FULL), H-P1..H-P5 (PART), H-D1 (descanso 12h), H-A1..H-A4 (AUX).
// Referencia: ai/architecture.md §5.
// STATUS: placeholder — a implementar en Prompts 1, 2 y 3.

import type { DiaSemana, Jornada, Colaborador, AsignacionAux, AsignacionEv } from './types';

export function validarReglasFull(
  _jornadas: Record<string, Jornada[]>,
  _colaboradores: Colaborador[]
): { duras_cumplidas: boolean; violaciones: Array<{ regla: string; colab_id?: string; dia?: DiaSemana; detalle: string }> } {
  // H‑F1: 48h semanales exactas por colaborador FULL
  // H‑F2: 6 días trabajados, 1 franco
  // H‑F3: máximo 2 francos por día (entre FULL+PART)
  // H‑F4: distribución 3x9h + 2x8h + 1x5h + franco
  // H‑F5: jornadas corridas o cortadas con descanso de 1h
  // H‑F6: inicio jornada ≥ 13:30 (9h) / 14:30 (8h) / 17:30 (5h)
  // H‑F7: fin jornada ≤ 22:30
  return { duras_cumplidas: false, violaciones: [] };
}

export function validarReglasPart(
  _jornadas: Record<string, Jornada[]>,
  _colaboradores: Colaborador[]
): { duras_cumplidas: boolean; violaciones: Array<{ regla: string; colab_id?: string; dia?: DiaSemana; detalle: string }> } {
  // H‑P1: 32h semanales exactas por colaborador PART
  // H‑P2: 6 días trabajados, 1 franco
  // H‑P3: turno fijo (mañana/tarde) por colaborador
  // H‑P4: jornadas de 5h o 6h, corridas o cortadas
  // H‑P5: franja mañana 09:00‑14:00/15:00, franja tarde 17:00‑22:00/22:30
  return { duras_cumplidas: false, violaciones: [] };
}

export function validarDescanso12h(
  _jornadas: Record<string, Jornada[]>
): { duras_cumplidas: boolean; violaciones: Array<{ regla: string; colab_id?: string; dia?: DiaSemana; detalle: string }> } {
  // H‑D1: descanso mínimo 12h entre fin de un día e inicio del siguiente (mismo colaborador)
  return { duras_cumplidas: false, violaciones: [] };
}

export function validarReglasAux(
  _asignacion: Record<string, AsignacionAux[][]>,
  _presencia: Record<string, AsignacionAux[][]>
): { duras_cumplidas: boolean; violaciones: Array<{ regla: string; colab_id?: string; dia?: DiaSemana; detalle: string }> } {
  // H‑A1: solo 1 AUX en franja 08:00‑09:00
  // H‑A2: máximo 2 AUX reservados para cierre 22:00‑23:00
  // H‑A3: AUX solo cubre baches (donde demanda > cajeros+AUX previos)
  // H‑A4: AUX respeta su matriz de presencia (PARADO/NO_PRESENTE)
  return { duras_cumplidas: false, violaciones: [] };
}

export function validarReglasEventual(
  _asignacion: Record<string, AsignacionEv[][]>,
  _disponibilidad: Record<string, AsignacionEv[][]>
): { duras_cumplidas: boolean; violaciones: Array<{ regla: string; colab_id?: string; dia?: DiaSemana; detalle: string }> } {
  // H‑E1: eventual solo cubre baches (demanda > cajeros+AUX+eventuales previos)
  // H‑E2: eventual respeta su matriz de disponibilidad (NO_DISPONIBLE)
  return { duras_cumplidas: false, violaciones: [] };
}