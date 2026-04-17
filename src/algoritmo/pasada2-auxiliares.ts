// src/algoritmo/pasada2-auxiliares.ts
// Activación de auxiliares (pasada 2).
// Responsabilidad: dado el horario de cajeros (FULL+PART), activar AUX para cubrir baches.
// Respetar reglas H‑A*: 1 AUX en 08:00‑09:00, 2 AUX reservados para cierre 22:00‑23:00, etc.
// Referencia: ai/architecture.md §6.2.
// STATUS: placeholder — a implementar en Prompt 2.

import type { DiaSemana, SlotIdx } from './types';
import { AsignacionAux, InputAlgoritmo, ResultadoSemanal } from './types';

export function activarAuxiliares(
  _input: InputAlgoritmo,
  _jornadas_full: Record<string, Array<{ dia: DiaSemana; bloques: Array<{ slot_inicio: SlotIdx; slot_fin: SlotIdx }> }>>,
  _jornadas_part: Record<string, Array<{ dia: DiaSemana; bloques: Array<{ slot_inicio: SlotIdx; slot_fin: SlotIdx }> }>>
): Pick<ResultadoSemanal, 'asignacion_aux'> {
  // 1. Calcular cobertura por slot de cajeros (FULL+PART)
  // 2. Para cada slot donde demanda > cobertura, activar AUX disponibles (respetando presencia)
  // 3. Prioridad: franja 08:00‑09:00 solo 1 AUX
  // 4. Reservar hasta 2 AUX para cierre 22:00‑23:00 (si están disponibles)
  // 5. Asignación final: matriz [dia][slot] de AsignacionAux por cada AUX

  const asignacion_aux: Record<string, AsignacionAux[][]> = {};

  return { asignacion_aux };
}