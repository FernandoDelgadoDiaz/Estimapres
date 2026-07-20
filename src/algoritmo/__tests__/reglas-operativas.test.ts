// Reglas operativas configurables: cada toggle cambia el comportamiento del
// motor cuando está activo, y con el flag ausente el resultado es idéntico al
// histórico (esto último ya lo garantizan los 45 tests base; acá se verifica
// que el flag ON realmente aplica la regla).
import { describe, it, expect } from "vitest";
import { ejecutarPasada1 } from "../pasada1-fullpart";
import { ejecutarPasada2 } from "../pasada2-auxiliares";
import type { InputAlgoritmo, MatrizPresencia, AsignacionAux } from "../types";
import {
  DEMANDA_REAL_PDF,
  ROSTER_REAL_PDF,
  PRESENCIA_AUX_REAL_PDF,
  DISPONIBILIDAD_EV_REAL_PDF,
} from "./fixtures";

const baseFixture = (): InputAlgoritmo => ({
  demanda: DEMANDA_REAL_PDF,
  colaboradores: ROSTER_REAL_PDF,
  presencia_aux: PRESENCIA_AUX_REAL_PDF,
  disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
});

// Presencia AUX 08:00-23:00 (todos los slots) los 7 días — cumple H-A1/H-A2 de input.
function presenciaFullDay(): MatrizPresencia {
  return Array.from({ length: 7 }, () => Array(30).fill("PARADO" as AsignacionAux));
}

const p1Vacia = (deficit: number[][]) => ({
  jornadas_full: {}, jornadas_part: {}, deficit_1: deficit, infactibles: [] as string[],
});

// ============ R1: apertura con supervisor ============
describe("R1 apertura_solo_aux", () => {
  it("ON: ningún cajero FULL cubre los slots 0-1 (08:00-09:00)", () => {
    const r = ejecutarPasada1({ ...baseFixture(), apertura_solo_aux: true });
    for (const jornadas of Object.values(r.jornadas_full)) {
      for (const j of jornadas) {
        for (const b of j.bloques) {
          expect(b.slot_inicio).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("OFF (fallback): se permite que las cortadas cubran la apertura", () => {
    const r = ejecutarPasada1({ ...baseFixture(), apertura_solo_aux: false });
    // Sigue siendo factible (produce jornadas FULL)
    expect(Object.keys(r.jornadas_full).length).toBeGreaterThan(0);
  });
});

// ============ R2: sin AUX en caja después de 22:00 ============
describe("R2 sin_aux_cierre", () => {
  const demandaSlot28 = () => {
    const d = Array.from({ length: 7 }, () => Array(30).fill(0));
    for (let dia = 0; dia < 7; dia++) d[dia][28] = 1; // 22:00-22:30
    return d;
  };
  const inputConAuxYDemanda = (): InputAlgoritmo => ({
    demanda: demandaSlot28(),
    colaboradores: [],
    presencia_aux: { aux1: presenciaFullDay(), aux2: presenciaFullDay() },
    disponibilidad_eventual: {},
  });

  it("ON (default): 0 AUX en caja en el slot 28", () => {
    const input = inputConAuxYDemanda();
    const r = ejecutarPasada2({ ...input, sin_aux_cierre: true }, p1Vacia(demandaSlot28()));
    for (const m of Object.values(r.asignacion_aux)) {
      for (let dia = 0; dia < 7; dia++) expect(m[dia][28]).not.toBe("CAJA");
    }
  });

  it("OFF: los AUX pueden cubrir el slot 28 (22:00-22:30)", () => {
    const input = inputConAuxYDemanda();
    const r = ejecutarPasada2({ ...input, sin_aux_cierre: false }, p1Vacia(demandaSlot28()));
    let hayCajaEn28 = false;
    for (const m of Object.values(r.asignacion_aux)) {
      for (let dia = 0; dia < 7; dia++) if (m[dia][28] === "CAJA") hayCajaEn28 = true;
    }
    expect(hayCajaEn28).toBe(true);
  });

  it("nunca hay AUX en caja en el slot 29 (fuera de operación), ni con la regla OFF", () => {
    const d = Array.from({ length: 7 }, () => Array(30).fill(0));
    for (let dia = 0; dia < 7; dia++) d[dia][29] = 1;
    const input: InputAlgoritmo = {
      demanda: d, colaboradores: [],
      presencia_aux: { aux1: presenciaFullDay(), aux2: presenciaFullDay() },
      disponibilidad_eventual: {},
    };
    const r = ejecutarPasada2({ ...input, sin_aux_cierre: false }, p1Vacia(d));
    for (const m of Object.values(r.asignacion_aux)) {
      for (let dia = 0; dia < 7; dia++) expect(m[dia][29]).not.toBe("CAJA");
    }
  });
});

// ============ R3: supervisor de jornada completa ============
describe("R3 supervisor_jornada_completa", () => {
  // Demanda 1 en slots 4..20 (09-... ) todos los días, 2 AUX presentes.
  const demanda = () => {
    const d = Array.from({ length: 7 }, () => Array(30).fill(0));
    for (let dia = 0; dia < 7; dia++) for (let s = 4; s <= 20; s++) d[dia][s] = 1;
    return d;
  };
  const input = (): InputAlgoritmo => ({
    demanda: demanda(),
    colaboradores: [],
    presencia_aux: { aux1: presenciaFullDay(), aux2: presenciaFullDay() },
    disponibilidad_eventual: {},
  });
  const cajaDelDia = (m: AsignacionAux[][], dia: number) => m[dia].filter(e => e === "CAJA").length;

  it("ON: el designado permanece SENTADO en caja toda su jornada, de forma continua", () => {
    const r = ejecutarPasada2({ ...input(), supervisor_jornada_completa: true }, p1Vacia(demanda()));
    // aux1 y aux2 tienen igual presencia → designado = aux1 (localeCompare)
    for (let dia = 0; dia < 7; dia++) {
      // El designado (aux1) está en CAJA de forma continua en todo 09:00-22:00 (slots 2..27)
      for (let slot = 2; slot <= 27; slot++) {
        expect(r.asignacion_aux.aux1[dia][slot]).toBe("CAJA");
      }
      // El otro (aux2) queda parado/disponible, no se sienta
      expect(cajaDelDia(r.asignacion_aux.aux2, dia)).toBe(0);
    }
  });

  it("ON: no viola H-A2 (≥1 parado 09-22) ni H-A3 (nada de caja en 28-29)", () => {
    const r = ejecutarPasada2({ ...input(), supervisor_jornada_completa: true }, p1Vacia(demanda()));
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 2; slot <= 27; slot++) {
        const parados = Object.values(r.asignacion_aux).filter(m => m[dia][slot] === "PARADO").length;
        expect(parados).toBeGreaterThanOrEqual(1);
      }
      for (const m of Object.values(r.asignacion_aux)) {
        expect(m[dia][28]).not.toBe("CAJA");
        expect(m[dia][29]).not.toBe("CAJA");
      }
    }
  });

  it("OFF (default): el balanceo reparte caja entre ambos AUX (aux1 también se sienta)", () => {
    const r = ejecutarPasada2({ ...input(), supervisor_jornada_completa: false }, p1Vacia(demanda()));
    let cajaAux1 = 0;
    for (let dia = 0; dia < 7; dia++) cajaAux1 += cajaDelDia(r.asignacion_aux.aux1, dia);
    expect(cajaAux1).toBeGreaterThan(0);
  });
});

// ============ R4: franco y medio franco corridos ============
describe("R4 franco_medio_corridos", () => {
  const totalSlots = (bloques: Array<{ slot_inicio: number; slot_fin: number }>) =>
    bloques.reduce((s, b) => s + (b.slot_fin - b.slot_inicio), 0);

  it("ON: en cada FULL, el día de 5h (medio franco) es adyacente al franco", () => {
    const r = ejecutarPasada1({ ...baseFixture(), franco_medio_corridos: true });
    const fulls = Object.values(r.jornadas_full);
    expect(fulls.length).toBeGreaterThan(0);
    for (const jornadas of fulls) {
      const diaFranco = jornadas.find(j => j.bloques.length === 0)!.dia;
      const dia5h = jornadas.find(j => j.bloques.length > 0 && totalSlots(j.bloques) === 10)!.dia;
      expect(Math.abs(diaFranco - dia5h)).toBe(1);
    }
  });

  it("ON: cada FULL sigue cumpliendo la composición dura (48h, 1 franco, 1 día de 5h)", () => {
    const r = ejecutarPasada1({ ...baseFixture(), franco_medio_corridos: true });
    for (const jornadas of Object.values(r.jornadas_full)) {
      const francos = jornadas.filter(j => j.bloques.length === 0).length;
      const dias5h = jornadas.filter(j => j.bloques.length > 0 && totalSlots(j.bloques) === 10).length;
      const horas = jornadas.reduce((s, j) => s + totalSlots(j.bloques) / 2, 0);
      expect(francos).toBe(1);
      expect(dias5h).toBe(1);
      expect(horas).toBe(48);
    }
  });
});
