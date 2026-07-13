// src/algoritmo/catalogos.ts
// Catálogos de jornadas válidas para FULL y PART según reglas duras.
// Referencia: ai/architecture.md §4.1 (FULL) y §4.2 (PART).
//
// v3 — rangos alineados con las reglas de negocio:
//   - Jornada "mañana" = inicio 09:00-11:00 (slots 2..6). La franja 08:00-09:00
//     la cubre el AUX de apertura (H-A1), por eso los cajeros corridos no
//     arrancan antes de las 09:00.
//   - Jornadas "tarde" con inicio continuo desde 11:30 (slot 7) para poder
//     seguir la demanda real del PDF sin huecos artificiales de catálogo.
//   - Cortadas FULL: el bloque 1 cubre la apertura (inicio 08:00-09:30) y el
//     bloque 2 el pico de cierre. Los cortados existen precisamente para
//     cubrir ambos extremos del día con un solo colaborador.

import type { Bloque, SlotIdx } from "./types";

export interface JornadaValida {
  tipo: string;                  // "F9-M", "F8-T", "F5-M", etc.
  duracion_slots: number;        // 10, 16, 18, o 8..12 para PART
  slot_inicio_min: number;
  slot_inicio_max: number;
  turno: "mañana" | "tarde" | "noche";
  rol: "FULL" | "PART";
}

// Catálogo de jornadas válidas para FULL (corridas)
export const CATALOGO_FULL_CORRIDAS: JornadaValida[] = [
  // F9-M: 9h, inicio 09:00-11:00
  { tipo: "F9-M", duracion_slots: 18, slot_inicio_min: 2, slot_inicio_max: 6, turno: "mañana", rol: "FULL" },
  // F9-T: 9h, inicio 11:30-14:00 (fin ≤ 22:30)
  { tipo: "F9-T", duracion_slots: 18, slot_inicio_min: 7, slot_inicio_max: 12, turno: "tarde", rol: "FULL" },
  // F8-M: 8h, inicio 09:00-11:00
  { tipo: "F8-M", duracion_slots: 16, slot_inicio_min: 2, slot_inicio_max: 6, turno: "mañana", rol: "FULL" },
  // F8-T: 8h, inicio 11:30-15:00 (fin ≤ 22:30)
  { tipo: "F8-T", duracion_slots: 16, slot_inicio_min: 7, slot_inicio_max: 14, turno: "tarde", rol: "FULL" },
  // F5-M: 5h, inicio 09:00-11:00
  { tipo: "F5-M", duracion_slots: 10, slot_inicio_min: 2, slot_inicio_max: 6, turno: "mañana", rol: "FULL" },
  // F5-T: 5h, inicio 11:30-18:00 (fin ≤ 22:30)
  { tipo: "F5-T", duracion_slots: 10, slot_inicio_min: 7, slot_inicio_max: 20, turno: "tarde", rol: "FULL" },
];

// Catálogo de jornadas válidas para PART: corridas de 4-6h (8..12 slots).
// P-M: inicio 09:00-11:00 (cuenta como mañana para H-P3).
// P-T: inicio desde 11:30, continuo hasta donde permita el cierre (fin ≤ 22:30).
export const CATALOGO_PART: JornadaValida[] = [];
for (let duracion = 8; duracion <= 12; duracion++) {
  CATALOGO_PART.push({
    tipo: `P${duracion}-M`,
    duracion_slots: duracion,
    slot_inicio_min: 2,
    slot_inicio_max: 6,
    turno: "mañana",
    rol: "PART",
  });
  CATALOGO_PART.push({
    tipo: `P${duracion}-T`,
    duracion_slots: duracion,
    slot_inicio_min: 7,
    slot_inicio_max: 30 - duracion,
    turno: "tarde",
    rol: "PART",
  });
}

export interface CortadaFull {
  tipo: "F-CORT-9" | "F-CORT-8";
  duracion_total_slots: 18 | 16;
  // El bloque 1 debe cubrir la apertura: inicio 08:00-09:30.
  b1_inicio_min: number;
  b1_inicio_max: number;
  composiciones: Array<{ slots_b1: number; slots_b2: number }>;
}

export const CATALOGO_FULL_CORTADAS: CortadaFull[] = [
  {
    tipo: "F-CORT-9",
    duracion_total_slots: 18,
    b1_inicio_min: 0,
    b1_inicio_max: 3,
    composiciones: [
      { slots_b1: 8, slots_b2: 10 }, // 4h+5h
      { slots_b1: 10, slots_b2: 8 }, // 5h+4h
    ],
  },
  {
    tipo: "F-CORT-8",
    duracion_total_slots: 16,
    b1_inicio_min: 0,
    b1_inicio_max: 3,
    composiciones: [
      { slots_b1: 8, slots_b2: 8 }, // 4h+4h
    ],
  },
];

export function generarParesCortada(
  cortada: CortadaFull,
  slot_inicio_b1: number,
  composicionIdx: number
): Array<[Bloque, Bloque]> {
  const composicion = cortada.composiciones[composicionIdx];
  if (!composicion) return [];

  const { slots_b1, slots_b2 } = composicion;
  const slot_fin_b1 = slot_inicio_b1 + slots_b1;
  const descanso_min = 8; // 4h estrictos (8 slots)
  const slot_inicio_b2_min = slot_fin_b1 + descanso_min;
  const slot_fin_b2_max = 30; // slot_fin exclusivo, máximo 30

  const pares: Array<[Bloque, Bloque]> = [];
  for (let slot_inicio_b2 = slot_inicio_b2_min; slot_inicio_b2 + slots_b2 <= slot_fin_b2_max; slot_inicio_b2++) {
    const bloque1: Bloque = { slot_inicio: slot_inicio_b1, slot_fin: slot_fin_b1 };
    const bloque2: Bloque = { slot_inicio: slot_inicio_b2, slot_fin: slot_inicio_b2 + slots_b2 };
    pares.push([bloque1, bloque2]);
  }
  return pares;
}

export function clasificarTurno(slot_inicio: SlotIdx): "mañana" | "tarde" | "noche" {
  if (slot_inicio <= 8) return "mañana";
  if (slot_inicio <= 17) return "tarde";
  return "noche";
}
