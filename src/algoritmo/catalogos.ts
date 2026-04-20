// src/algoritmo/catalogos.ts
// Catálogos de jornadas válidas para FULL y PART según reglas duras.
// Referencia: ai/architecture.md §4.1 (FULL) y §4.2 (PART).
// Implementado en Prompt 1.

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
  // F9-M: duración 18 slots, inicios 0..4, turno "mañana"
  { tipo: "F9-M", duracion_slots: 18, slot_inicio_min: 0, slot_inicio_max: 4, turno: "mañana", rol: "FULL" },
  // F9-T: duración 18 slots, inicios 10..12, turno "tarde"
  { tipo: "F9-T", duracion_slots: 18, slot_inicio_min: 10, slot_inicio_max: 12, turno: "tarde", rol: "FULL" },
  // F8-M: duración 16 slots, inicios 0..6, turno "mañana"
  { tipo: "F8-M", duracion_slots: 16, slot_inicio_min: 0, slot_inicio_max: 6, turno: "mañana", rol: "FULL" },
  // F8-T: duración 16 slots, inicios 12..14, turno "tarde"
  { tipo: "F8-T", duracion_slots: 16, slot_inicio_min: 12, slot_inicio_max: 14, turno: "tarde", rol: "FULL" },
  // F5-M: duración 10 slots, inicios 0..10, turno "mañana"
  { tipo: "F5-M", duracion_slots: 10, slot_inicio_min: 0, slot_inicio_max: 10, turno: "mañana", rol: "FULL" },
  // F5-T: duración 10 slots, inicios 10..20, turno "tarde"
  { tipo: "F5-T", duracion_slots: 10, slot_inicio_min: 10, slot_inicio_max: 20, turno: "tarde", rol: "FULL" },
];

// Catálogo de jornadas válidas para PART
// PART: duraciones 8, 9, 10, 11, 12 slots
// P-M: inicios 0..8, turno "mañana"
// P-T: inicios 10..18, turno "tarde"
// P-N: inicios 18.., con slot_fin ≤ 30, turno "noche"
export const CATALOGO_PART: JornadaValida[] = [];
// Generar combinaciones
for (let duracion = 8; duracion <= 12; duracion++) {
  // P-M: 09:00 (slot 2) a 11:00 (slot 6)
  CATALOGO_PART.push({
    tipo: `P${duracion}-M`,
    duracion_slots: duracion,
    slot_inicio_min: 2,
    slot_inicio_max: 6,
    turno: "mañana",
    rol: "PART",
  });
  // P-T: 14:00 (slot 12) en adelante
  CATALOGO_PART.push({
    tipo: `P${duracion}-T`,
    duracion_slots: duracion,
    slot_inicio_min: 12,
    slot_inicio_max: 18,
    turno: "tarde",
    rol: "PART",
  });
  // P-N: slot_inicio_min = 18, slot_inicio_max = 30 - duracion (para que slot_fin <= 30)
  const slot_inicio_max = 30 - duracion;
  if (slot_inicio_max >= 18) {
    CATALOGO_PART.push({
      tipo: `P${duracion}-N`,
      duracion_slots: duracion,
      slot_inicio_min: 18,
      slot_inicio_max: slot_inicio_max,
      turno: "noche",
      rol: "PART",
    });
  }
}

export interface CortadaFull {
  tipo: "F-CORT-9" | "F-CORT-8";
  duracion_total_slots: 18 | 16;
  composiciones: Array<{ slots_b1: number; slots_b2: number }>;
}

export const CATALOGO_FULL_CORTADAS: CortadaFull[] = [
  {
    tipo: "F-CORT-9",
    duracion_total_slots: 18,
    composiciones: [
      { slots_b1: 8, slots_b2: 10 }, // 4h+5h
      { slots_b1: 10, slots_b2: 8 }, // 5h+4h
    ],
  },
  {
    tipo: "F-CORT-8",
    duracion_total_slots: 16,
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