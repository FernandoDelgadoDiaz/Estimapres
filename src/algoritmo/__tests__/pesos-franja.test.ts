// Integración: los criterios de cobertura aprendidos (pesos_franja) LLEGAN al
// motor y afectan la propuesta. Cubre el cableado completo
// InputAlgoritmo.pesos_franja → Pasada 1 (prefijosUtilidad) → Pasadas 2/3.
import { describe, it, expect } from "vitest";
import { ejecutarPasada1 } from "../pasada1-fullpart";
import { ejecutarAlgoritmo } from "../orquestador";
import {
  DEMANDA_REAL_PDF,
  ROSTER_REAL_PDF,
  PRESENCIA_AUX_REAL_PDF,
  DISPONIBILIDAD_EV_REAL_PDF,
} from "./fixtures";

const inputBase = () => ({
  demanda: DEMANDA_REAL_PDF,
  colaboradores: ROSTER_REAL_PDF,
  presencia_aux: PRESENCIA_AUX_REAL_PDF,
  disponibilidad_eventual: DISPONIBILIDAD_EV_REAL_PDF,
});

// Banda cierre: slots 22..29 (19:00-23:00)
const SLOTS_CIERRE = [22, 23, 24, 25, 26, 27, 28, 29];

function deficitBanda(deficit: number[][], slots: number[]): number {
  let total = 0;
  for (let dia = 0; dia < 7; dia++) {
    for (const s of slots) total += deficit[dia][s];
  }
  return total;
}

describe("Integración pesos_franja → motor", () => {
  it("pesos uniformes (1.0) producen EXACTAMENTE el mismo resultado que sin pesos", () => {
    const sinPesos = ejecutarPasada1(inputBase());
    const conUnos = ejecutarPasada1({ ...inputBase(), pesos_franja: new Array(30).fill(1) });
    expect(JSON.stringify(conUnos.jornadas_full)).toBe(JSON.stringify(sinPesos.jornadas_full));
    expect(JSON.stringify(conUnos.jornadas_part)).toBe(JSON.stringify(sinPesos.jornadas_part));
    expect(JSON.stringify(conUnos.deficit_1)).toBe(JSON.stringify(sinPesos.deficit_1));
  });

  it("peso alto en cierre cambia la propuesta de Pasada 1 y no empeora el déficit de cierre", () => {
    const sinPesos = ejecutarPasada1(inputBase());

    const pesos = new Array(30).fill(1);
    for (const s of SLOTS_CIERRE) pesos[s] = 10; // criterio extremo para test
    const conPesos = ejecutarPasada1({ ...inputBase(), pesos_franja: pesos });

    // El peso LLEGÓ: la asignación es distinta (si no llegara, sería idéntica)
    const igualFull = JSON.stringify(conPesos.jornadas_full) === JSON.stringify(sinPesos.jornadas_full);
    const igualPart = JSON.stringify(conPesos.jornadas_part) === JSON.stringify(sinPesos.jornadas_part);
    expect(igualFull && igualPart).toBe(false);

    // Y empuja en la dirección correcta: el déficit del cierre no empeora
    expect(deficitBanda(conPesos.deficit_1, SLOTS_CIERRE))
      .toBeLessThanOrEqual(deficitBanda(sinPesos.deficit_1, SLOTS_CIERRE));
  });

  it("el pipeline completo (P1→P2→P3) acepta pesos y sigue cumpliendo H-A2/H-A3", () => {
    const pesos = new Array(30).fill(1);
    for (const s of SLOTS_CIERRE) pesos[s] = 1.5;
    const r = ejecutarAlgoritmo({ ...inputBase(), pesos_franja: pesos });

    for (let dia = 0; dia < 7; dia++) {
      // H-A3: nunca CAJA en 28-29
      for (const matriz of Object.values(r.asignacion_aux)) {
        expect(matriz[dia][28]).not.toBe("CAJA");
        expect(matriz[dia][29]).not.toBe("CAJA");
      }
      // H-A2: >=1 PARADO por slot 2..27 si hay presentes
      for (let slot = 2; slot <= 27; slot++) {
        const estados = Object.values(r.asignacion_aux).map(m => m[dia][slot]);
        const presentes = estados.filter(e => e !== "NO_PRESENTE");
        if (presentes.length > 0) {
          expect(estados.filter(e => e === "PARADO").length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});
