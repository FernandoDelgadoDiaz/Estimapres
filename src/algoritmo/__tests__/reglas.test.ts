// src/algoritmo/__tests__/reglas.test.ts
// Tests mínimos de reglas duras H-F*, H-P*, H-D1, H-FR1.
// Referencia: ai/architecture.md §5.

import { describe, it, expect } from "vitest";
import type { Jornada, AsignacionAux, MatrizPresencia } from "../types";
import {
  validarSemanaFull,
  validarSemanaPart,
  validarDescansoEntreDias,
  validarFrancosPorDia,
  horasDeJornada,
  esJornadaCortada,
  validarPresenciaAux0809,
  validarCobertura0922,
  validarAsignacionAuxSlot,
} from "../reglas";
import { ejecutarPasada1 } from "../pasada1-fullpart";
import { ejecutarPasada2 } from "../pasada2-auxiliares";
import { ejecutarPasada3 } from "../pasada3-eventuales";
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

// ==================== TESTS PASADA 2 ====================

function presenciaVacia(): MatrizPresencia {
  return Array.from({ length: 7 }, () =>
    Array(30).fill("NO_PRESENTE" as AsignacionAux)
  );
}

function setPresente(matriz: MatrizPresencia, dia: number, slotInicio: number, slotFin: number): void {
  for (let s = slotInicio; s < slotFin; s++) {
    matriz[dia][s] = "PARADO";
  }
}

describe("Validadores H-A* (pre-input)", () => {
  it("H-A1: detecta dia sin aux 08-09", () => {
    const presencia: Record<string, MatrizPresencia> = { aux1: presenciaVacia() };
    setPresente(presencia.aux1, 0, 6, 22); // aux1 lunes 11-19, no 08-09
    const violaciones = validarPresenciaAux0809(presencia);
    expect(violaciones.length).toBeGreaterThan(0);
    expect(violaciones.some(v => v.regla === "H-A1" && v.dia === 0)).toBe(true);
  });

  it("H-A1: cumple si hay al menos 1 aux 08-09", () => {
    const presencia: Record<string, MatrizPresencia> = { aux1: presenciaVacia() };
    for (let d = 0; d < 7; d++) setPresente(presencia.aux1, d, 0, 16);
    const violaciones = validarPresenciaAux0809(presencia);
    expect(violaciones).toEqual([]);
  });

  it("H-A2 pre-check: detecta slot sin cobertura 09-22", () => {
    const presencia: Record<string, MatrizPresencia> = { aux1: presenciaVacia() };
    for (let d = 0; d < 7; d++) setPresente(presencia.aux1, d, 0, 2); // solo 08-09
    const violaciones = validarCobertura0922(presencia);
    expect(violaciones.length).toBeGreaterThan(0);
  });
});

describe("Validador H-A slot-por-slot", () => {
  it("H-A1: slot 0 con 0 auxes CAJA es violacion", () => {
    const viol = validarAsignacionAuxSlot(0, 0, [
      { colab_id: "a", asignacion: "PARADO" },
      { colab_id: "b", asignacion: "PARADO" },
    ]);
    expect(viol.some(v => v.regla === "H-A1")).toBe(true);
  });

  it("H-A1: slot 0 con 1 aux CAJA es valido", () => {
    const viol = validarAsignacionAuxSlot(0, 0, [
      { colab_id: "a", asignacion: "CAJA" },
      { colab_id: "b", asignacion: "PARADO" },
    ]);
    expect(viol.filter(v => v.regla === "H-A1")).toEqual([]);
  });

  it("H-A2: slot 10 con todos CAJA es violacion", () => {
    const viol = validarAsignacionAuxSlot(0, 10, [
      { colab_id: "a", asignacion: "CAJA" },
      { colab_id: "b", asignacion: "CAJA" },
    ]);
    expect(viol.some(v => v.regla === "H-A2")).toBe(true);
  });

  it("H-A2: slot 10 con 1 CAJA y 1 PARADO es valido", () => {
    const viol = validarAsignacionAuxSlot(0, 10, [
      { colab_id: "a", asignacion: "CAJA" },
      { colab_id: "b", asignacion: "PARADO" },
    ]);
    expect(viol.filter(v => v.regla === "H-A2")).toEqual([]);
  });

  it("H-A3: slot 28 con 1 CAJA es violacion", () => {
    const viol = validarAsignacionAuxSlot(0, 28, [
      { colab_id: "a", asignacion: "CAJA" },
    ]);
    expect(viol.some(v => v.regla === "H-A3")).toBe(true);
  });

  it("H-A3: slot 28 con todos PARADO es valido", () => {
    const viol = validarAsignacionAuxSlot(0, 28, [
      { colab_id: "a", asignacion: "PARADO" },
      { colab_id: "b", asignacion: "PARADO" },
    ]);
    expect(viol.filter(v => v.regla === "H-A3")).toEqual([]);
  });
});

describe("Pasada 2 sobre PDF real", () => {
  it("ejecutarPasada2 no reporta violaciones de input", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF,
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);
    if (p2.violaciones_input.length > 0) {
      console.error("Violaciones de input:", p2.violaciones_input);
    }
    expect(p2.violaciones_input).toEqual([]);
  });

  it("ejecutarPasada2 asigna 1 aux CAJA cada dia 08-09", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF,
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);
    for (let dia = 0; dia < 7; dia++) {
      expect(p2.auxes_activados_08_09[dia]).toBeDefined();
    }
  });

  it("Pasada 2 no viola H-A2 (siempre >=1 PARADO en 09-22)", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF,
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);

    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 2; slot <= 27; slot++) {
        const asignaciones = Object.entries(p2.asignacion_aux).map(([colab_id, matriz]) => ({
          colab_id,
          asignacion: matriz[dia][slot],
        }));
        const presentes = asignaciones.filter(a => a.asignacion !== "NO_PRESENTE");
        const parados = asignaciones.filter(a => a.asignacion === "PARADO");
        if (presentes.length > 0) {
          expect(parados.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("Pasada 2 no viola H-A3 (0 auxes CAJA en 22:00-22:30)", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF,
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);

    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 28; slot < 30; slot++) {
        for (const matriz of Object.values(p2.asignacion_aux)) {
          expect(matriz[dia][slot]).not.toBe("CAJA");
        }
      }
    }
  });

  it("Pasada 2 termina en <2 segundos", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF,
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
    const p1 = ejecutarPasada1(input);
    const t0 = Date.now();
    ejecutarPasada2(input, p1);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(2000);
  });
});

describe("Metricas Pasada 2 (reporte)", () => {
  it("calcula metricas para reporte final", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF,
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };

    function demandaTotal(demanda: number[][]) {
      let total = 0;
      for (let dia = 0; dia < 7; dia++) {
        for (let slot = 0; slot < 30; slot++) {
          total += demanda[dia][slot];
        }
      }
      return total;
    }

    const t0 = Date.now();
    const p1 = ejecutarPasada1(input);
    const t1 = Date.now();
    const p2 = ejecutarPasada2(input, p1);
    const t2 = Date.now();

    const tiempo_p1 = t1 - t0;
    const tiempo_p2 = t2 - t1;

    let deficit_total_p1 = 0;
    let deficit_total_p2 = 0;
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 0; slot < 30; slot++) {
        deficit_total_p1 += p1.deficit_1[dia][slot];
        deficit_total_p2 += p2.deficit_2[dia][slot];
      }
    }

    const demanda_total = demandaTotal(input.demanda);
    const pct_reduccion_p2 = deficit_total_p1 > 0 ? ((deficit_total_p1 - deficit_total_p2) / deficit_total_p1) * 100 : 0;
    const pct_cobertura_acum = ((demanda_total - deficit_total_p2) / demanda_total) * 100;

    // Horas caja por aux
    const horasCajaPorAux: Record<string, number> = {};
    for (const [auxId, matriz] of Object.entries(p2.asignacion_aux)) {
      let count = 0;
      for (let dia = 0; dia < 7; dia++) {
        for (let slot = 0; slot < 30; slot++) {
          if (matriz[dia][slot] === "CAJA") count++;
        }
      }
      horasCajaPorAux[auxId] = count / 2;
    }

    const horasValues = Object.values(horasCajaPorAux);
    const minHoras = Math.min(...horasValues);
    const maxHoras = Math.max(...horasValues);
    const diffHoras = maxHoras - minHoras;

    console.log("=== METRICAS PASADA 2 ===");
    console.log("Demanda total:", demanda_total, "slots (" + (demanda_total/2) + " horas)");
    console.log("Déficit tras Pasada 1:", deficit_total_p1, "slots (" + (deficit_total_p1/2) + " horas)");
    console.log("Déficit tras Pasada 2:", deficit_total_p2, "slots (" + (deficit_total_p2/2) + " horas)");
    console.log("Reducción aportada por Pasada 2:", deficit_total_p1 - deficit_total_p2, "slots (" + pct_reduccion_p2.toFixed(1) + "%)");
    console.log("Cobertura acumulada FULL+PART+AUX:", demanda_total - deficit_total_p2, "slots (" + pct_cobertura_acum.toFixed(1) + "%)");
    console.log("Auxes activados 08-09 por día:");
    for (let dia = 0; dia < 7; dia++) {
      console.log("  Día " + dia + ": " + (p2.auxes_activados_08_09[dia] || "NONE"));
    }
    console.log("Equidad horas-caja auxes:");
    console.log("  min=" + minHoras + "h, max=" + maxHoras + "h, diferencia=" + diffHoras + "h");
    console.log("Tiempo ejecución Pasada 1:", tiempo_p1 + "ms");
    console.log("Tiempo ejecución Pasada 2:", tiempo_p2 + "ms");
    console.log("Violaciones H-A* detectadas:", p2.violaciones_input.length);

    // No assertions, just metrics
    expect(true).toBe(true);
  });
});

// ==================== TESTS PASADA 3 ====================

describe("Pasada 3 sobre PDF real (con Azucena como EVENTUAL)", () => {
  function makeInput() {
    return {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF,
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };
  }

  it("ejecutarPasada3 no toca slots NO_DISPONIBLE", () => {
    const input = makeInput();
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);
    const p3 = ejecutarPasada3(input, p2);

    for (const [evId, matrizOriginal] of Object.entries(input.disponibilidad_eventual)) {
      const matrizResultado = p3.asignacion_eventual[evId];
      for (let dia = 0; dia < 7; dia++) {
        for (let slot = 0; slot < 30; slot++) {
          if (matrizOriginal[dia][slot] === "NO_DISPONIBLE") {
            expect(matrizResultado[dia][slot]).not.toBe("CAJA");
          }
        }
      }
    }
  });

  it("ejecutarPasada3 solo activa dentro de la disponibilidad del eventual", () => {
    const input = makeInput();
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);
    const p3 = ejecutarPasada3(input, p2);

    for (const [evId, matrizResultado] of Object.entries(p3.asignacion_eventual)) {
      const matrizOriginal = input.disponibilidad_eventual[evId];
      for (let dia = 0; dia < 7; dia++) {
        for (let slot = 0; slot < 30; slot++) {
          if (matrizResultado[dia][slot] === "CAJA") {
            expect(matrizOriginal[dia][slot]).not.toBe("NO_DISPONIBLE");
          }
        }
      }
    }
  });

  it("Pasada 3 reduce el deficit de Pasada 2", () => {
    const input = makeInput();
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);
    const p3 = ejecutarPasada3(input, p2);

    let total_p2 = 0;
    let total_p3 = 0;
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 0; slot < 30; slot++) {
        total_p2 += p2.deficit_2[dia][slot];
        total_p3 += p3.deficit_3[dia][slot];
      }
    }
    expect(total_p3).toBeLessThanOrEqual(total_p2);
  });

  it("Cobertura final tras Pasada 3 es mayor que tras Pasada 2", () => {
    const input = makeInput();
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);
    const p3 = ejecutarPasada3(input, p2);

    let total_p2 = 0;
    let total_p3 = 0;
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 0; slot < 30; slot++) {
        total_p2 += p2.deficit_2[dia][slot];
        total_p3 += p3.deficit_3[dia][slot];
      }
    }
    // Azucena disponible L/M/J/V/S/D 08-14 debe cubrir parte del deficit de manana
    expect(total_p3).toBeLessThan(total_p2);
  });

  it("horas_caja_por_eventual es coherente con asignacion_eventual", () => {
    const input = makeInput();
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);
    const p3 = ejecutarPasada3(input, p2);

    for (const [evId, matriz] of Object.entries(p3.asignacion_eventual)) {
      let slots_caja = 0;
      for (let dia = 0; dia < 7; dia++) {
        for (let slot = 0; slot < 30; slot++) {
          if (matriz[dia][slot] === "CAJA") slots_caja++;
        }
      }
      expect(p3.horas_caja_por_eventual[evId]).toBe(slots_caja / 2);
    }
  });

  it("Pasada 3 termina en <1 segundo", () => {
    const input = makeInput();
    const p1 = ejecutarPasada1(input);
    const p2 = ejecutarPasada2(input, p1);
    const t0 = Date.now();
    ejecutarPasada3(input, p2);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(1000);
  });
});

describe("Metricas finales del pipeline completo (reporte)", () => {
  it("calcula metricas cascada P1 -> P2 -> P3", () => {
    const input = {
      demanda: DEMANDA_REAL_PDF,
      colaboradores: ROSTER_REAL_PDF,
      presencia_aux: PRESENCIA_AUX_REAL_PDF,
      disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
    };

    function sumarMatriz(m: number[][]): number {
      let total = 0;
      for (let dia = 0; dia < 7; dia++) {
        for (let slot = 0; slot < 30; slot++) total += m[dia][slot];
      }
      return total;
    }

    const t0 = Date.now();
    const p1 = ejecutarPasada1(input);
    const t1 = Date.now();
    const p2 = ejecutarPasada2(input, p1);
    const t2 = Date.now();
    const p3 = ejecutarPasada3(input, p2);
    const t3 = Date.now();

    const demanda_total = sumarMatriz(input.demanda);
    const deficit_p1 = sumarMatriz(p1.deficit_1);
    const deficit_p2 = sumarMatriz(p2.deficit_2);
    const deficit_p3 = sumarMatriz(p3.deficit_3);

    const cobertura_p1 = ((demanda_total - deficit_p1) / demanda_total) * 100;
    const cobertura_p2 = ((demanda_total - deficit_p2) / demanda_total) * 100;
    const cobertura_p3 = ((demanda_total - deficit_p3) / demanda_total) * 100;

    console.log("=== METRICAS PIPELINE COMPLETO P1 -> P2 -> P3 ===");
    console.log("Demanda total:          " + demanda_total + " slots (" + (demanda_total / 2) + "h)");
    console.log("Deficit tras P1:        " + deficit_p1 + " slots (" + (deficit_p1 / 2) + "h)  | Cobertura: " + cobertura_p1.toFixed(1) + "%");
    console.log("Deficit tras P2:        " + deficit_p2 + " slots (" + (deficit_p2 / 2) + "h)  | Cobertura: " + cobertura_p2.toFixed(1) + "%");
    console.log("Deficit tras P3:        " + deficit_p3 + " slots (" + (deficit_p3 / 2) + "h)  | Cobertura: " + cobertura_p3.toFixed(1) + "%");
    console.log("Tiempos:  P1=" + (t1 - t0) + "ms  P2=" + (t2 - t1) + "ms  P3=" + (t3 - t2) + "ms");

    console.log("--- Horas-caja por eventual ---");
    for (const [evId, horas] of Object.entries(p3.horas_caja_por_eventual)) {
      console.log("  " + evId + ": " + horas + "h");
    }

    console.log("--- Horas-caja por AUX ---");
    for (const [auxId, matriz] of Object.entries(p2.asignacion_aux)) {
      let count = 0;
      for (let dia = 0; dia < 7; dia++) {
        for (let slot = 0; slot < 30; slot++) {
          if (matriz[dia][slot] === "CAJA") count++;
        }
      }
      console.log("  " + auxId + ": " + (count / 2) + "h");
    }

    expect(true).toBe(true);
  });
});