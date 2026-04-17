// src/algoritmo/__tests__/reglas.test.ts
// Tests mínimos de reglas duras H-F*, H-P*, H-D1, H-FR1.
// Referencia: ai/architecture.md §5.

import { describe, it, expect } from "vitest";
import type { Jornada } from "../types";
import {
  validarSemanaFull,
  validarSemanaPart,
  validarDescansoEntreDias,
  validarFrancosPorDia,
  horasDeJornada,
  esJornadaCortada,
} from "../reglas";
import { ejecutarPasada1 } from "../pasada1-fullpart";
import {
  ROSTER_REAL_PDF,
  DEMANDA_REAL_PDF,
  PRESENCIA_AUX_REAL_PDF,
  DISPONIBILIDAD_EV_REAL_PDF,
} from "./fixtures";

// ==================== HELPERS ====================

function jornadaCorrida(colab: string, dia: 0|1|2|3|4|5|6, inicio: number, fin: number): Jornada {
  return { colab_id: colab, dia, bloques: [{ slot_inicio: inicio, slot_fin: fin }] };
}

function jornadaCortada(
  colab: string,
  dia: 0|1|2|3|4|5|6,
  b1_inicio: number, b1_fin: number,
  b2_inicio: number, b2_fin: number
): Jornada {
  return {
    colab_id: colab,
    dia,
    bloques: [
      { slot_inicio: b1_inicio, slot_fin: b1_fin },
      { slot_inicio: b2_inicio, slot_fin: b2_fin },
    ],
  };
}

function jornadaFranco(colab: string, dia: 0|1|2|3|4|5|6): Jornada {
  return { colab_id: colab, dia, bloques: [] };
}

// Semana FULL válida: 3×9h + 2×8h + 1×5h + 1 franco, ≥2 mañanas, 2 cortados.
function semanaFullValida(colab: string): Jornada[] {
  return [
    jornadaCorrida(colab, 0, 0, 18),                 // L: 9h mañana (08-17)
    jornadaCorrida(colab, 1, 0, 16),                 // M: 8h mañana (08-16)
    jornadaCortada(colab, 2, 0, 8, 16, 26),          // X: cortado 08-12 + 16-21 (4h+5h=9h, descanso 8 slots)
    jornadaCortada(colab, 3, 0, 8, 16, 24),          // J: cortado 08-12 + 16-20 (4h+4h=8h)
    jornadaCorrida(colab, 4, 4, 22),                 // V: 9h (10-19)
    jornadaCorrida(colab, 5, 10, 20),                // S: 5h tarde (13-18)
    jornadaFranco(colab, 6),                         // D: franco
  ];
}

// Semana PART válida: ≤31h, ≥2 mañanas, 1 franco, corridas de 4-6h.
function semanaPartValida(colab: string): Jornada[] {
  return [
    jornadaCorrida(colab, 0, 0, 10),  // L: 5h mañana
    jornadaCorrida(colab, 1, 0, 10),  // M: 5h mañana
    jornadaCorrida(colab, 2, 10, 20), // X: 5h tarde
    jornadaCorrida(colab, 3, 10, 20), // J: 5h tarde
    jornadaCorrida(colab, 4, 18, 28), // V: 5h noche
    jornadaCorrida(colab, 5, 18, 28), // S: 5h noche
    jornadaFranco(colab, 6),          // D: franco (total = 30h ≤ 31h)
  ];
}

// ==================== TESTS UNITARIOS ====================

describe("Helpers", () => {
  it("horasDeJornada suma correctamente bloques", () => {
    expect(horasDeJornada(jornadaCorrida("x", 0, 0, 18))).toBe(9);
    expect(horasDeJornada(jornadaCortada("x", 0, 0, 8, 16, 26))).toBe(9);
    expect(horasDeJornada(jornadaFranco("x", 0))).toBe(0);
  });

  it("esJornadaCortada detecta 2 bloques", () => {
    expect(esJornadaCortada(jornadaCorrida("x", 0, 0, 18))).toBe(false);
    expect(esJornadaCortada(jornadaCortada("x", 0, 0, 8, 16, 26))).toBe(true);
    expect(esJornadaCortada(jornadaFranco("x", 0))).toBe(false);
  });
});

describe("Reglas FULL", () => {
  it("semana FULL canónica no tiene violaciones", () => {
    expect(validarSemanaFull("test", semanaFullValida("test"))).toEqual([]);
  });

  it("H-F1: FULL con 47h es violación", () => {
    const sem = semanaFullValida("test");
    sem[0] = jornadaCorrida("test", 0, 0, 16); // cambiar L de 9h a 8h → total 47h
    const violaciones = validarSemanaFull("test", sem);
    expect(violaciones.some(v => v.regla === "H-F1")).toBe(true);
  });

  it("H-F5: FULL sin cortados es violación", () => {
    const sem: Jornada[] = [
      jornadaCorrida("t", 0, 0, 18),
      jornadaCorrida("t", 1, 0, 18),
      jornadaCorrida("t", 2, 0, 18),
      jornadaCorrida("t", 3, 0, 16),
      jornadaCorrida("t", 4, 0, 16),
      jornadaCorrida("t", 5, 0, 10),
      jornadaFranco("t", 6),
    ];
    const violaciones = validarSemanaFull("t", sem);
    expect(violaciones.some(v => v.regla === "H-F5")).toBe(true);
  });

  it("H-F7: cortado con descanso <8 slots es violación", () => {
    const sem = semanaFullValida("test");
    sem[2] = jornadaCortada("test", 2, 0, 8, 14, 24); // descanso = 6 slots (3h)
    const violaciones = validarSemanaFull("test", sem);
    expect(violaciones.some(v => v.regla === "H-F7")).toBe(true);
  });
});

describe("Reglas PART", () => {
  it("semana PART canónica no tiene violaciones", () => {
    expect(validarSemanaPart("test", semanaPartValida("test"))).toEqual([]);
  });

  it("H-P1: PART con 32h es violación", () => {
    const sem = semanaPartValida("test");
    sem[5] = jornadaCorrida("test", 5, 18, 30); // 6h en vez de 5h → total 31h + 1h = 32h
    // Ajustar otro día para llegar a 32h real
    sem[0] = jornadaCorrida("test", 0, 0, 12);  // 6h
    sem[1] = jornadaCorrida("test", 1, 0, 12);  // 6h
    const total = sem.reduce((a, j) => a + horasDeJornada(j), 0);
    expect(total).toBeGreaterThan(31);
    const violaciones = validarSemanaPart("test", sem);
    expect(violaciones.some(v => v.regla === "H-P1")).toBe(true);
  });

  it("H-P4: PART cortado es violación", () => {
    const sem = semanaPartValida("test");
    sem[0] = jornadaCortada("test", 0, 0, 6, 14, 20); // cortado en PART
    const violaciones = validarSemanaPart("test", sem);
    expect(violaciones.some(v => v.regla === "H-P4")).toBe(true);
  });

  it("H-P5: PART de 3h (6 slots) es violación", () => {
    const sem = semanaPartValida("test");
    sem[0] = jornadaCorrida("test", 0, 0, 6); // 3h
    const violaciones = validarSemanaPart("test", sem);
    expect(violaciones.some(v => v.regla === "H-P5")).toBe(true);
  });
});

describe("Regla H-D1 (descanso 12h)", () => {
  it("descanso exacto de 12h es válido", () => {
    // Día N fin 22:30 (slot_fin=30), Día N+1 inicio 10:30 (slot_inicio=5)
    const d1 = jornadaCorrida("t", 0, 20, 30);
    const d2 = jornadaCorrida("t", 1, 5, 15);
    expect(validarDescansoEntreDias("t", d1, d2)).toEqual([]);
  });

  it("descanso de 11h es violación", () => {
    // Día N fin 22:30 (slot_fin=30), Día N+1 inicio 09:30 (slot_inicio=3)
    const d1 = jornadaCorrida("t", 0, 20, 30);
    const d2 = jornadaCorrida("t", 1, 3, 13);
    const violaciones = validarDescansoEntreDias("t", d1, d2);
    expect(violaciones.some(v => v.regla === "H-D1")).toBe(true);
  });

  it("franco en día N o N+1 no aplica la regla", () => {
    expect(validarDescansoEntreDias("t", jornadaFranco("t", 0), jornadaCorrida("t", 1, 0, 10))).toEqual([]);
    expect(validarDescansoEntreDias("t", jornadaCorrida("t", 0, 20, 30), jornadaFranco("t", 1))).toEqual([]);
  });
});

describe("Regla H-FR1 (máx 2 francos/día FULL+PART)", () => {
  it("2 francos el mismo día es válido", () => {
    const jornadas_full = {
      a: [jornadaFranco("a", 0), ...Array(6).fill(null).map((_, i) => jornadaCorrida("a", (i+1) as any, 0, 18))],
    };
    const jornadas_part = {
      b: [jornadaFranco("b", 0), ...Array(6).fill(null).map((_, i) => jornadaCorrida("b", (i+1) as any, 0, 10))],
    };
    expect(validarFrancosPorDia(jornadas_full, jornadas_part)).toEqual([]);
  });

  it("3 francos el mismo día es violación", () => {
    const jornadas_full = {
      a: [jornadaFranco("a", 0), ...Array(6).fill(null).map((_, i) => jornadaCorrida("a", (i+1) as any, 0, 18))],
      c: [jornadaFranco("c", 0), ...Array(6).fill(null).map((_, i) => jornadaCorrida("c", (i+1) as any, 0, 18))],
    };
    const jornadas_part = {
      b: [jornadaFranco("b", 0), ...Array(6).fill(null).map((_, i) => jornadaCorrida("b", (i+1) as any, 0, 10))],
    };
    const violaciones = validarFrancosPorDia(jornadas_full, jornadas_part);
    expect(violaciones.some(v => v.regla === "H-FR1")).toBe(true);
  });
});

// ==================== INTEGRACIÓN PASADA 1 ====================

describe("Pasada 1 sobre PDF real", () => {
  it("ejecutarPasada1 produce jornadas FULL que cumplen H-F*", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF.filter(c => c.rol === "FULL" || c.rol === "PART"),
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const resultado = ejecutarPasada1(input);

    for (const [colab_id, jornadas] of Object.entries(resultado.jornadas_full)) {
      const violaciones = validarSemanaFull(colab_id, jornadas);
      if (violaciones.length > 0) {
        console.error(`FULL ${colab_id} violaciones:`, violaciones);
      }
      expect(violaciones).toEqual([]);
    }
  });

  it("ejecutarPasada1 produce jornadas PART que cumplen H-P*", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF.filter(c => c.rol === "FULL" || c.rol === "PART"),
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const resultado = ejecutarPasada1(input);

    for (const [colab_id, jornadas] of Object.entries(resultado.jornadas_part)) {
      const violaciones = validarSemanaPart(colab_id, jornadas);
      if (violaciones.length > 0) {
        console.error(`PART ${colab_id} violaciones:`, violaciones);
      }
      expect(violaciones).toEqual([]);
    }
  });

  it("ejecutarPasada1 respeta H-FR1 globalmente", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF.filter(c => c.rol === "FULL" || c.rol === "PART"),
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const resultado = ejecutarPasada1(input);
    const violaciones = validarFrancosPorDia(resultado.jornadas_full, resultado.jornadas_part);
    if (violaciones.length > 0) {
      console.error("H-FR1 violaciones:", violaciones);
    }
    expect(violaciones).toEqual([]);
  });

  it("ejecutarPasada1 termina en < 10 segundos", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF.filter(c => c.rol === "FULL" || c.rol === "PART"),
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const t0 = Date.now();
    ejecutarPasada1(input);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(10000);
  });
});
