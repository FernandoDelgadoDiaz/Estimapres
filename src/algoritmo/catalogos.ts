// src/algoritmo/catalogos.ts
// Catálogos de jornadas válidas para FULL y PART según reglas duras.
// Referencia: ai/architecture.md §4.1 (FULL) y §4.2 (PART).
// STATUS: placeholder — a implementar en Prompt 1.

// Catálogo de jornadas válidas para FULL (48h semanales)
// Cada jornada es una lista de bloques (slot_inicio, slot_fin) que suman la duración indicada.
// Las jornadas deben respetar: corrida (un bloque) o cortada (dos bloques con descanso de 1h).
export const CATALOGO_FULL = [
  // 9h corridas (13:30-22:30) -> 27 slots
  // 9h cortadas (???) -> a implementar
  // 8h corridas (14:30-22:30) -> 24 slots
  // 8h cortadas (???) -> a implementar
  // 5h corridas (17:30-22:30) -> 15 slots
];

// Catálogo de jornadas válidas para PART (32h semanales)
// Jornadas de 5h (10 slots) o 6h (12 slots), corridas o cortadas.
// Turno mañana (09:00-14:00/15:00) y turno tarde (17:00-22:00/22:30).
export const CATALOGO_PART_TARDE = [];
export const CATALOGO_PART_MANANA = [];

export function generarCatalogoFull(): Array<{ duracion: number; bloques: Array<{ slot_inicio: number; slot_fin: number }> }> {
  throw new Error('No implementado aún');
}

export function generarCatalogoPart(_turno: 'tarde' | 'manana'): Array<{ duracion: number; bloques: Array<{ slot_inicio: number; slot_fin: number }> }> {
  throw new Error('No implementado aún');
}