// Efectividad: cobertura calculada (motor del panel en vivo), predicción,
// madurez por banda y recálculo de CAJA de AUX tras ediciones.
import { describe, it, expect } from "vitest";
import {
  calcularCoberturaHorarios,
  predecirCorrecciones,
  madurezPorBanda,
  type MetricaSemana,
} from "../efectividad";
import { recalcularCajaAux } from "../recalculoAux";
import { HORAS_FRANJAS } from "../../types";
import type { HorarioColaborador, AsignacionCajaColaborador, CorreccionManual } from "../../types";

// Helpers ---------------------------------------------------------------

const jornadaVacia = (dia: number) => ({ dia, turnos: [], horas: 0, esFranco: true, rol: 'franco' as const });

function fila(
  id: string,
  rolGeneral: HorarioColaborador['rolGeneral'],
  turnosPorDia: Record<number, Array<{ inicio: string; fin: string }>>
): HorarioColaborador {
  const jornadas = Array.from({ length: 7 }, (_, dia) => {
    const turnos = turnosPorDia[dia]
    if (!turnos) return jornadaVacia(dia)
    return { dia, turnos, horas: 0, esFranco: false, rol: 'cajero' as const }
  })
  return { colaboradorId: id, jornadas, totalHoras: 0, errores: [], rolGeneral }
}

/** Necesidad 31×7 toda en cero salvo las franjas indicadas (todos los días). */
function necesidad(porHora: Record<string, number>): number[][] {
  return HORAS_FRANJAS.map(h => Array(7).fill(porHora[h] ?? 0))
}

const fi = (hora: string) => HORAS_FRANJAS.indexOf(hora as (typeof HORAS_FRANJAS)[number])

// Tests ------------------------------------------------------------------

describe("calcularCoberturaHorarios", () => {
  it("cuenta cajeros y eventuales por franja; franco no cuenta", () => {
    const horarios = [
      fila("c1", "cajero", { 0: [{ inicio: "09:00", fin: "13:00" }] }),
      fila("e1", "eventual_sector", { 0: [{ inicio: "10:00", fin: "12:00" }] }),
    ]
    const r = calcularCoberturaHorarios(horarios, necesidad({ "10:00": 2 }))
    expect(r.cobertura[fi("10:00")][0]).toBe(2)  // cajero + eventual
    expect(r.cobertura[fi("09:00")][0]).toBe(1)  // solo cajero
    expect(r.cobertura[fi("10:00")][1]).toBe(0)  // otro día: franco
  })

  it("SUMA los bloques en CAJA de los AUX (snapshot)", () => {
    const cajaAux: AsignacionCajaColaborador[] = [{
      colaboradorId: "aux1",
      nombre: "Aux Uno",
      // CAJA en slots 4-5 (10:00-11:00) del día 0
      slotsCajaPorDia: Array.from({ length: 7 }, (_, d) =>
        Array.from({ length: 30 }, (_, s) => d === 0 && (s === 4 || s === 5))
      ),
    }]
    const r = calcularCoberturaHorarios([], necesidad({ "10:00": 1, "10:30": 1 }), cajaAux)
    expect(r.cobertura[fi("10:00")][0]).toBe(1)
    expect(r.cobertura[fi("10:30")][0]).toBe(1)
    expect(r.cobertura[fi("10:00")][1]).toBe(0)
    expect(r.pct).toBeCloseTo(100 * 2 / 14, 1) // cubre 2 de 14 celdas-caja necesarias
  })

  it("una fila AUX en horarios NO cuenta como caja (es presencia, no caja)", () => {
    const horarios = [fila("aux1", "aux_supervisor", { 0: [{ inicio: "09:00", fin: "13:00" }] })]
    const r = calcularCoberturaHorarios(horarios, necesidad({ "10:00": 1 }))
    expect(r.cobertura[fi("10:00")][0]).toBe(0)
  })
})

describe("recalcularCajaAux (edición de presencia AUX)", () => {
  it("re-ejecuta Pasada 2: el AUX se sienta donde queda déficit tras cajeros", () => {
    // Demanda 2 cajas en 10:00-12:00; 1 cajero cubre 1 → déficit 1 → el AUX
    // presente debería sentarse... pero H-A2 exige >=1 PARADO: con 2 AUX
    // presentes, uno se sienta y el otro queda PARADO.
    const horarios = [
      fila("c1", "cajero", {
        0: [{ inicio: "08:00", fin: "13:00" }], 1: [{ inicio: "08:00", fin: "13:00" }],
        2: [{ inicio: "08:00", fin: "13:00" }], 3: [{ inicio: "08:00", fin: "13:00" }],
        4: [{ inicio: "08:00", fin: "13:00" }], 5: [{ inicio: "08:00", fin: "13:00" }],
        6: [{ inicio: "08:00", fin: "13:00" }],
      }),
      // Presencia completa 08:00-22:00: la Pasada 2 exige >=1 AUX presente en
      // todo 09-22 (precondición dura); si la edición la rompe, recalcularCajaAux
      // devuelve null y se conserva el snapshot (cubierto en el test siguiente).
      fila("aux1", "aux_supervisor", Object.fromEntries(
        Array.from({ length: 7 }, (_, d) => [d, [{ inicio: "08:00", fin: "22:00" }]])
      )),
      fila("aux2", "aux_supervisor", Object.fromEntries(
        Array.from({ length: 7 }, (_, d) => [d, [{ inicio: "08:00", fin: "22:00" }]])
      )),
    ]
    const nec = necesidad({ "10:00": 2, "10:30": 2, "11:00": 2, "11:30": 2 })
    const caja = recalcularCajaAux(horarios, nec, { aux1: "Aux Uno", aux2: "Aux Dos" })
    expect(caja).not.toBeNull()
    // En cada día, exactamente 1 de los 2 AUX está en CAJA en los slots 4..7
    for (let dia = 0; dia < 7; dia++) {
      for (const slot of [4, 5, 6, 7]) {
        const enCaja = caja!.filter(a => a.slotsCajaPorDia[dia][slot]).length
        expect(enCaja).toBe(1) // cubre el déficit dejando 1 PARADO (H-A2)
      }
    }
  })

  it("sin filas AUX o sin necesidad devuelve null (conservar snapshot)", () => {
    expect(recalcularCajaAux([fila("c1", "cajero", {})], necesidad({ "10:00": 1 }), {})).toBeNull()
    expect(recalcularCajaAux([fila("a1", "aux_supervisor", {})], necesidad({}), {})).toBeNull()
  })
})

describe("predicción y madurez", () => {
  const mk = (i: number, c: number): MetricaSemana => ({
    semanaId: `s${i}`, descripcion: `Sem ${i}`, fechaLunes: `2026-06-${String(1 + i * 7).padStart(2, "0")}`,
    version: 1, correcciones: c, pctMotor: 90, pctFinal: 95,
    criteriosActivosAlGenerar: [], criteriosNuevos: [],
  })

  it("serie decreciente proyecta menos correcciones, nunca negativas", () => {
    const pred = predecirCorrecciones([mk(0, 8), mk(1, 6), mk(2, 5), mk(3, 3)])!
    expect(pred.pendiente).toBeLessThan(0)
    expect(pred.en4Semanas).toBeGreaterThanOrEqual(0)
    expect(pred.en4Semanas).toBeLessThan(3)
  })

  it("con menos de 3 semanas no hay predicción", () => {
    expect(predecirCorrecciones([mk(0, 5), mk(1, 4)])).toBeNull()
  })

  it("banda con correcciones hace 5+ semanas = madura; reciente = en ajuste; nunca = sin datos", () => {
    const AHORA = new Date("2026-07-19T00:00:00")
    const corr = (fecha: string): CorreccionManual => ({
      id: "x", fecha: `${fecha}T10:00:00Z`, semanaId: "s", colaboradorNombre: "R", dia: 0,
      antes: { esFranco: false, turnos: [{ inicio: "19:00", fin: "22:00" }] },
      despues: { esFranco: true, turnos: [] }, // toca SOLO cierre
    })
    const vieja = madurezPorBanda([corr("2026-06-12")], AHORA)
    expect(vieja.find(m => m.banda === "cierre")!.estado).toBe("madura")
    expect(vieja.find(m => m.banda === "apertura")!.estado).toBe("sin_datos")

    const reciente = madurezPorBanda([corr("2026-07-15")], AHORA)
    expect(reciente.find(m => m.banda === "cierre")!.estado).toBe("en_ajuste")
  })
})
