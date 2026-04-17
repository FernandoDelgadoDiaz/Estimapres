// src/algoritmo/pasada1-fullpart.ts
// Generación de jornadas para colaboradores FULL y PART (pasada 1).
// Responsabilidad: asignar francos, seleccionar jornadas del catálogo, respetar reglas H‑F* y H‑P*.
// Referencia: ai/architecture.md §6.1.
// STATUS: placeholder — a implementar en Prompt 1.

import type { Jornada, InputAlgoritmo, ResultadoSemanal } from './types';

export function generarJornadasFullPart(
  _input: InputAlgoritmo
): Pick<ResultadoSemanal, 'jornadas_full' | 'jornadas_part'> {
  // 1. Separar colaboradores por rol
  // const _fulls = input.colaboradores.filter(c => c.rol === 'FULL');
  // const _parts = input.colaboradores.filter(c => c.rol === 'PART');

  // 2. Asignar francos (máximo 2 por día entre FULL+PART)
  // 3. Para cada FULL: seleccionar 6 jornadas del catálogo (3x9h, 2x8h, 1x5h) respetando descanso 12h
  // 4. Para cada PART: turno fijo, seleccionar 6 jornadas del catálogo (2x6h + 4x5h) respetando descanso 12h
  // 5. Retornar mapas colab_id → jornadas[]

  const jornadas_full: Record<string, Jornada[]> = {};
  const jornadas_part: Record<string, Jornada[]> = {};

  return { jornadas_full, jornadas_part };
}