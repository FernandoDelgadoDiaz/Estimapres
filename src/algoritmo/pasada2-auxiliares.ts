// src/algoritmo/pasada2-auxiliares.ts
// Pasada 2: activacion de auxiliares para cubrir deficit de Pasada 1.
// Referencia: ai/architecture.md §7.1 Pasada 2.
// Prompt 2.

import type {
  InputAlgoritmo,
  AsignacionAux,
  DiaSemana,
  SlotIdx,
  RegulaViolada,
} from "./types";
import { ejecutarPasada1, type ResultadoPasada1 } from "./pasada1-fullpart";
import {
  validarPresenciaAux0809,
  validarCobertura0922,
} from "./reglas";

export interface ResultadoPasada2 {
  asignacion_aux: Record<string, AsignacionAux[][]>; // [colab_id][dia][slot]
  deficit_2: number[][]; // 7 x 30
  auxes_activados_08_09: Record<number, string>; // dia -> colab_id elegido
  violaciones_input: RegulaViolada[]; // si hay, no se ejecuta la pasada
}

const DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];
const SLOTS_POR_DIA = 30;

export function ejecutarPasada2(
  input: InputAlgoritmo,
  resultado_pasada1: ResultadoPasada1
): ResultadoPasada2 {
  // === PASO 1: Validar input ===
  const viol_0809 = validarPresenciaAux0809(input.presencia_aux);
  const viol_0922 = validarCobertura0922(input.presencia_aux);
  const violaciones_input = [...viol_0809, ...viol_0922];

  if (violaciones_input.length > 0) {
    return {
      asignacion_aux: {},
      deficit_2: resultado_pasada1.deficit_1.map(fila => [...fila]),
      auxes_activados_08_09: {},
      violaciones_input,
    };
  }

  // === PASO 2: Inicializar asignacion_aux clonando presencia (valores PARADO/NO_PRESENTE) ===
  const asignacion_aux: Record<string, AsignacionAux[][]> = {};
  for (const [auxId, matriz] of Object.entries(input.presencia_aux)) {
    asignacion_aux[auxId] = matriz.map(fila => fila.map(estado => estado));
  }

  // === PASO 3: Forzar H-A1 en slots 0 y 1 cada dia ===
  const auxes_activados_08_09: Record<number, string> = {};

  for (const dia of DIAS) {
    const candidatos: string[] = [];
    for (const [auxId, matriz] of Object.entries(asignacion_aux)) {
      if (matriz[dia][0] !== "NO_PRESENTE" && matriz[dia][1] !== "NO_PRESENTE") {
        candidatos.push(auxId);
      }
    }

    if (candidatos.length === 0) continue;

    candidatos.sort((a, b) => {
      const hA = contarHorasCaja(asignacion_aux[a]);
      const hB = contarHorasCaja(asignacion_aux[b]);
      if (hA !== hB) return hA - hB;
      return a.localeCompare(b);
    });

    const elegido = candidatos[0];
    asignacion_aux[elegido][dia][0] = "CAJA";
    asignacion_aux[elegido][dia][1] = "CAJA";
    auxes_activados_08_09[dia] = elegido;
  }

  // === PASO 4: Activar auxes para cubrir deficit ===
  const deficit_actual: number[][] = resultado_pasada1.deficit_1.map(fila => [...fila]);

  for (const dia of DIAS) {
    const slots_con_deficit: Array<{ slot: SlotIdx; deficit: number }> = [];
    for (let slot = 0; slot < SLOTS_POR_DIA; slot++) {
      if (deficit_actual[dia][slot] > 0) {
        slots_con_deficit.push({ slot, deficit: deficit_actual[dia][slot] });
      }
    }
    slots_con_deficit.sort((a, b) => b.deficit - a.deficit);

    for (const { slot } of slots_con_deficit) {
      if (slot === 0 || slot === 1) continue; // ya resuelto por H-A1
      if (slot >= 28) continue;                // H-A3: no activar 22:00+
      if (slot < 2 || slot > 27) continue;     // solo aplicable 09-22

      const presentes: string[] = [];
      for (const [auxId, matriz] of Object.entries(asignacion_aux)) {
        if (matriz[dia][slot] === "PARADO") presentes.push(auxId);
      }

      if (presentes.length === 0) continue;

      const max_activables = presentes.length - 1; // H-A2: al menos 1 queda PARADO
      if (max_activables <= 0) continue;

      const deficit_slot = deficit_actual[dia][slot];
      if (deficit_slot <= 0) continue;

      const n_activar = Math.min(deficit_slot, max_activables);

      presentes.sort((a, b) => {
        const hA = contarHorasCaja(asignacion_aux[a]);
        const hB = contarHorasCaja(asignacion_aux[b]);
        if (hA !== hB) return hA - hB;
        return a.localeCompare(b);
      });

      for (let i = 0; i < n_activar; i++) {
        const auxElegido = presentes[i];
        asignacion_aux[auxElegido][dia][slot] = "CAJA";
        deficit_actual[dia][slot] = Math.max(0, deficit_actual[dia][slot] - 1);
      }
    }
  }

  return {
    asignacion_aux,
    deficit_2: deficit_actual,
    auxes_activados_08_09,
    violaciones_input: [],
  };
}

// ============== HELPERS ==============

function contarHorasCaja(matriz: AsignacionAux[][]): number {
  let count = 0;
  for (let dia = 0; dia < 7; dia++) {
    for (let slot = 0; slot < SLOTS_POR_DIA; slot++) {
      if (matriz[dia][slot] === "CAJA") count++;
    }
  }
  return count / 2;
}

// Wrapper para compatibilidad con orquestador.ts placeholder (Prompt 0).
// Sera eliminado cuando el orquestador se reescriba en Prompt 3.
export function activarAuxiliares(
  input: InputAlgoritmo,
  _jornadas_full_legacy: unknown,
  _jornadas_part_legacy: unknown
): ReturnType<typeof ejecutarPasada2> {
  const resultado_p1 = ejecutarPasada1(input);
  return ejecutarPasada2(input, resultado_p1);
}