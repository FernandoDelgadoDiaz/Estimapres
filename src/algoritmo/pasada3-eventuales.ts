// src/algoritmo/pasada3-eventuales.ts
// Asignación de eventuales (pasada 3).
// Responsabilidad: dado el horario de cajeros+AUX, activar eventuales para cubrir baches restantes.
// Respetar reglas H‑E*: solo cubrir baches, respetar disponibilidad.
// Referencia: ai/architecture.md §6.3.
// STATUS: placeholder — a implementar en Prompt 3.

import type { DiaSemana, SlotIdx } from './types';
import { AsignacionEv, AsignacionAux, InputAlgoritmo, ResultadoSemanal } from './types';

export function asignarEventuales(
  _input: InputAlgoritmo,
  _jornadas_full: Record<string, Array<{ dia: DiaSemana; bloques: Array<{ slot_inicio: SlotIdx; slot_fin: SlotIdx }> }>>,
  _jornadas_part: Record<string, Array<{ dia: DiaSemana; bloques: Array<{ slot_inicio: SlotIdx; slot_fin: SlotIdx }> }>>,
  _asignacion_aux: Record<string, AsignacionAux[][]>
): Pick<ResultadoSemanal, 'asignacion_eventual'> {
  // 1. Calcular cobertura por slot de cajeros + AUX
  // 2. Para cada slot donde demanda > cobertura, activar eventuales disponibles
  // 3. Respetar matriz de disponibilidad (NO_DISPONIBLE)
  // 4. Asignación final: matriz [dia][slot] de AsignacionEv por cada eventual

  const asignacion_eventual: Record<string, AsignacionEv[][]> = {};

  return { asignacion_eventual };
}