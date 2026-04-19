// src/algoritmo/pasada3-eventuales.ts
// Pasada 3: activacion de eventuales para cubrir deficit residual de Pasada 2.
// Referencia: ai/architecture.md §7.1 Pasada 3.
// Prompt 3.a.

import type {
  InputAlgoritmo,
  AsignacionEv,
  DiaSemana,
  SlotIdx,
  ResultadoSemanal,
} from "./types";
import type { ResultadoPasada2 } from "./pasada2-auxiliares";

export interface ResultadoPasada3 {
  asignacion_eventual: Record<string, AsignacionEv[][]>; // [colab_id][dia][slot]
  deficit_3: number[][]; // 7 x 30, deficit residual final
  horas_caja_por_eventual: Record<string, number>;
}

const DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];
const SLOTS_POR_DIA = 30;

export function ejecutarPasada3(
  input: InputAlgoritmo,
  resultado_pasada2: ResultadoPasada2
): ResultadoPasada3 {
  // === PASO 1: Clonar disponibilidad_eventual como asignacion inicial ===
  // Preserva NO_DISPONIBLE / NO_USADO tal como vienen del input.
  const asignacion_eventual: Record<string, AsignacionEv[][]> = {};
  for (const [evId, matriz] of Object.entries(input.disponibilidad_eventual)) {
    asignacion_eventual[evId] = matriz.map(fila => [...fila] as AsignacionEv[]);
  }

  // === PASO 2: Inicializar contador horas-caja por eventual ===
  const horas_caja_por_eventual: Record<string, number> = {};
  for (const evId of Object.keys(asignacion_eventual)) {
    horas_caja_por_eventual[evId] = 0;
  }

  // === PASO 3: Clonar deficit_2 como deficit actual ===
  const deficit_actual: number[][] = resultado_pasada2.deficit_2.map(fila => [...fila]);

  // === PASO 4: Para cada dia, cubrir slots con deficit usando eventuales ===
  for (const dia of DIAS) {
    const slots_con_deficit: Array<{ slot: SlotIdx; deficit: number }> = [];
    for (let slot = 0; slot < SLOTS_POR_DIA; slot++) {
      if (deficit_actual[dia][slot] > 0) {
        slots_con_deficit.push({ slot, deficit: deficit_actual[dia][slot] });
      }
    }
    // Priorizar slots con mayor deficit
    slots_con_deficit.sort((a, b) => b.deficit - a.deficit);

    for (const { slot } of slots_con_deficit) {
      // Eventuales disponibles = aquellos con NO_USADO en este slot
      const disponibles: string[] = [];
      for (const [evId, matriz] of Object.entries(asignacion_eventual)) {
        if (matriz[dia][slot] === "NO_USADO") {
          disponibles.push(evId);
        }
      }

      if (disponibles.length === 0) continue;

      const n_activar = Math.min(deficit_actual[dia][slot], disponibles.length);

      // Equidad: menor horas acumuladas primero, desempate alfabetico
      disponibles.sort((a, b) => {
        const hA = horas_caja_por_eventual[a];
        const hB = horas_caja_por_eventual[b];
        if (hA !== hB) return hA - hB;
        return a.localeCompare(b);
      });

      for (let i = 0; i < n_activar; i++) {
        const evElegido = disponibles[i];
        asignacion_eventual[evElegido][dia][slot] = "CAJA";
        horas_caja_por_eventual[evElegido] += 0.5;
        deficit_actual[dia][slot] = Math.max(0, deficit_actual[dia][slot] - 1);
      }
    }
  }

  return { asignacion_eventual, deficit_3: deficit_actual, horas_caja_por_eventual };
}

// ============== COMPATIBILIDAD CON ORQUESTADOR (placeholder) ==============
// Wrapper legacy para el orquestador.ts placeholder. Sera eliminado cuando
// el orquestador se reescriba en Prompt 4+.

export function asignarEventuales(
  _input: InputAlgoritmo,
  _jornadas_full_legacy: unknown,
  _jornadas_part_legacy: unknown,
  _asignacion_aux_legacy: unknown
): Pick<ResultadoSemanal, "asignacion_eventual"> {
  return { asignacion_eventual: {} };
}
