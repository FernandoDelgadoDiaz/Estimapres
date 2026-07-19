// Capa de aprendizaje: criterios de cobertura con decay temporal.
import { describe, it, expect } from "vitest";
import { derivarCriteriosCobertura, pesosFranjaDeCriterios, pesoTemporal } from "../preferencias";
import type { CorreccionManual } from "../../types";

const AHORA = new Date("2026-07-19T00:00:00");

const corr = (id: string, semanaId: string, fecha: string): CorreccionManual => ({
  id, fecha: `${fecha}T10:00:00Z`, semanaId, colaboradorNombre: "Rosa", dia: 2,
  antes: { esFranco: false, turnos: [{ inicio: "10:00", fin: "16:00" }] },
  despues: { esFranco: false, turnos: [{ inicio: "16:00", fin: "22:00" }] }, // suma cierre, quita mediodía
});

describe("pesoTemporal (decay 0.5^(edad/8))", () => {
  it("0 semanas = 1.0, 4 semanas ≈ 0.707, 8 semanas = 0.5, 16 semanas = 0.25", () => {
    expect(pesoTemporal(0)).toBeCloseTo(1.0, 5);
    expect(pesoTemporal(4)).toBeCloseTo(0.7071, 3);
    expect(pesoTemporal(8)).toBeCloseTo(0.5, 5);
    expect(pesoTemporal(16)).toBeCloseTo(0.25, 5);
  });
});

describe("derivarCriteriosCobertura", () => {
  it("2 semanas RECIENTES con la misma señal → criterio ACTIVO y estable, con banda resignada", () => {
    const criterios = derivarCriteriosCobertura(
      [corr("a", "s1", "2026-07-06"), corr("b", "s2", "2026-07-13")],
      { ahora: AHORA }
    );
    const cierre = criterios.find(c => c.banda === "cierre")!;
    expect(cierre.estado).toBe("activo");
    expect(cierre.tendencia).toBe("estable");
    expect(cierre.semanas).toBe(2);
    expect(cierre.bandaResignada).toBe("mediodia");
    expect(cierre.score).toBeGreaterThanOrEqual(1.5);
  });

  it("las mismas 2 señales pero de hace 6 meses NO activan (el decay las degradó)", () => {
    const criterios = derivarCriteriosCobertura(
      [corr("a", "s1", "2026-01-05"), corr("b", "s2", "2026-01-12")],
      { ahora: AHORA }
    );
    const cierre = criterios.find(c => c.banda === "cierre")!;
    expect(cierre.estado).toBe("observacion");
    expect(cierre.score).toBeLessThan(0.5);
  });

  it("1 sola semana → en observación y SIN pesos para el motor", () => {
    const criterios = derivarCriteriosCobertura(
      [corr("a", "s1", "2026-07-06")],
      { ahora: AHORA }
    );
    expect(criterios.find(c => c.banda === "cierre")!.estado).toBe("observacion");
    expect(pesosFranjaDeCriterios(criterios)).toBeUndefined();
  });

  it("varias correcciones de la MISMA semana no activan (se exigen semanas distintas)", () => {
    const criterios = derivarCriteriosCobertura(
      [corr("a", "s1", "2026-07-06"), corr("b", "s1", "2026-07-06"), corr("c", "s1", "2026-07-06")],
      { ahora: AHORA }
    );
    const cierre = criterios.find(c => c.banda === "cierre")!;
    expect(cierre.estado).toBe("observacion");
    expect(cierre.semanas).toBe(1);
  });

  it("10 semanas seguidas sin las últimas 4 → sigue ACTIVO pero EN DECLIVE (baja gradual)", () => {
    const cs: CorreccionManual[] = [];
    for (let i = 0; i < 10; i++) {
      const f = new Date(Date.UTC(2026, 3, 6 + i * 7)).toISOString().slice(0, 10);
      cs.push(corr(`c${i}`, `s${i}`, f)); // última señal 2026-06-08 (~6 semanas atrás)
    }
    const criterios = derivarCriteriosCobertura(cs, { ahora: AHORA });
    const cierre = criterios.find(c => c.banda === "cierre")!;
    expect(cierre.estado).toBe("activo");
    expect(cierre.tendencia).toBe("declive");
  });
});

describe("pesosFranjaDeCriterios", () => {
  it("boost proporcional al score, con cap ×1.5, solo en la banda del criterio", () => {
    const cs: CorreccionManual[] = [];
    for (let i = 0; i < 10; i++) {
      const f = new Date(Date.UTC(2026, 4, 4 + i * 7)).toISOString().slice(0, 10);
      cs.push(corr(`c${i}`, `s${i}`, f));
    }
    const pesos = pesosFranjaDeCriterios(derivarCriteriosCobertura(cs, { ahora: AHORA }))!;
    expect(pesos[25]).toBeGreaterThan(1);          // cierre boosteado
    expect(pesos[25]).toBeLessThanOrEqual(1.5);    // cap
    expect(pesos[8]).toBe(1);                      // mediodía (resignada) queda neutra
    expect(pesos[0]).toBe(1);                      // apertura neutra
  });
});
