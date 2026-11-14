// src/algoritmo/pasada2-auxiliares.ts
// Pasada 2: AUX (supervisores) en caja SOLO sobre el déficit real que deja la Pasada 1.
//
// #38 — Semántica vigente:
//   - El horario de un AUX es PRESENCIA (está en la tienda supervisando), no
//     obligación de caja. Por defecto queda PARADO; se sienta en CAJA solo en
//     los slots con déficit real y siempre dejando ≥1 AUX PARADO (H-A2).
//   - Apertura 08:00–09:00 (slots 0 y 1) según `apertura_solo_aux`:
//       ON  → exactamente UN AUX presente se sienta en caja; su cobertura se
//             DESCUENTA del déficit antes de pasar a la Pasada 3. Sin AUX
//             presente → violación bloqueante (nunca se sustituye).
//       OFF → la apertura la cubre un cajero FULL/PART (Pasada 1); ningún AUX
//             se sienta en 08:00–09:00.
//   - Huecos de supervisión (H-A1/H-A2 de entrada) se informan como
//     violaciones pero NO abortan la pasada: el resto de la semana se asigna.
//   - R3 `supervisor_jornada_completa`: si en el día hay 2+ AUX presentes a la
//     vez, el de mayor presencia queda PARADO supervisando toda su jornada (no
//     se sienta en caja). Excepción: si con ON es el único AUX presente en la
//     apertura, se sienta 08:00–09:00 (regla obligatoria).
//   - Nunca se convierte PARADO en CAJA sin déficit (sin "relleno" ni extensión
//     de bloques para alcanzar 1 hora).

import type { InputAlgoritmo, AsignacionAux, DiaSemana, SlotIdx, RegulaViolada } from "./types";
import { ejecutarPasada1, type ResultadoPasada1 } from "./pasada1-fullpart";
import { validarPresenciaAux0809, validarCobertura0922 } from "./reglas";

export interface ResultadoPasada2 {
  asignacion_aux: Record<string, AsignacionAux[][]>; // [colab_id][dia][slot]
  deficit_2: number[][]; // 7 x 30 — déficit REAL que queda para la Pasada 3
  auxes_activados_08_09: Record<number, string>; // dia -> AUX sentado en la apertura (solo ON)
  /** Supervisor de jornada completa designado por día (R3), o ausente. */
  supervisor_designado: Record<number, string>;
  /** Violaciones de reglas obligatorias detectadas (no abortan la pasada). */
  violaciones_input: RegulaViolada[];
}

const DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];
const SLOTS_POR_DIA = 30;
export const SLOTS_APERTURA: SlotIdx[] = [0, 1];

export function ejecutarPasada2(input: InputAlgoritmo, resultado_pasada1: ResultadoPasada1): ResultadoPasada2 {
  const aperturaSoloAux = input.apertura_solo_aux ?? true;
  const sinAuxCierre = input.sin_aux_cierre ?? true;
  const slotMaxCaja = sinAuxCierre ? 27 : 28; // inclusivo (27 = 21:30-22:00)
  const supervisorJornadaCompleta = input.supervisor_jornada_completa ?? false;

  // === PASO 1: reglas de presencia de entrada (se informan, no abortan) ===
  const violaciones_input: RegulaViolada[] = [
    ...(aperturaSoloAux ? validarPresenciaAux0809(input.presencia_aux) : []),
    ...validarCobertura0922(input.presencia_aux),
  ];

  // === PASO 2: asignación inicial = presencia (PARADO / NO_PRESENTE) ===
  const asignacion_aux: Record<string, AsignacionAux[][]> = {};
  for (const [auxId, matriz] of Object.entries(input.presencia_aux)) {
    asignacion_aux[auxId] = matriz.map(fila => fila.map(estado => (estado === "CAJA" ? "PARADO" : estado)));
  }
  const deficit_actual: number[][] = resultado_pasada1.deficit_1.map(fila => [...fila]);

  const supervisor_designado: Record<number, string> = {};
  if (supervisorJornadaCompleta) {
    for (const dia of DIAS) {
      const d = designarSupervisorJornadaCompleta(asignacion_aux, dia);
      if (d) supervisor_designado[dia] = d;
    }
  }

  // === PASO 3: apertura 08:00–09:00 ===
  const auxes_activados_08_09: Record<number, string> = {};
  if (aperturaSoloAux) {
    for (const dia of DIAS) {
      const candidatos = Object.keys(asignacion_aux).filter(id =>
        SLOTS_APERTURA.every(s => asignacion_aux[id][dia][s] !== "NO_PRESENTE"));
      if (candidatos.length === 0) continue; // ya informado como H-A1; nunca se sustituye
      const designado = supervisor_designado[dia];
      candidatos.sort((a, b) => {
        const dA = a === designado ? 1 : 0;
        const dB = b === designado ? 1 : 0;
        if (dA !== dB) return dA - dB; // el supervisor de jornada completa abre solo si es el único
        const hA = contarHorasCaja(asignacion_aux[a]);
        const hB = contarHorasCaja(asignacion_aux[b]);
        if (hA !== hB) return hA - hB;
        return a.localeCompare(b);
      });
      const elegido = candidatos[0];
      for (const s of SLOTS_APERTURA) {
        asignacion_aux[elegido][dia][s] = "CAJA";
        deficit_actual[dia][s] = Math.max(0, deficit_actual[dia][s] - 1); // la cobertura del AUX se descuenta
      }
      auxes_activados_08_09[dia] = elegido;
    }
  } else {
    // OFF: la apertura corresponde a FULL/PART. Si la Pasada 1 no la cubrió, es
    // un incumplimiento que el AUX/eventual no deben tapar.
    for (const dia of DIAS) {
      for (const s of SLOTS_APERTURA) {
        const dem = input.demanda[dia]?.[s] ?? 0;
        if (dem > 0 && resultado_pasada1.deficit_1[dia][s] >= dem) {
          violaciones_input.push({
            regla: "OP-APERTURA", dia,
            detalle: `Apertura sin cajero FULL/PART (slot ${s}): con «apertura solo AUX» desactivada, la abre un cajero.`,
          });
          break;
        }
      }
    }
  }

  // === PASO 4: AUX en caja solo donde hay déficit real (09:00 → slotMaxCaja) ===
  const peso = (s: SlotIdx) => input.pesos_franja?.[s] ?? 1;
  for (const dia of DIAS) {
    const slots: SlotIdx[] = [];
    for (let slot = 2; slot <= slotMaxCaja; slot++) if (deficit_actual[dia][slot] > 0) slots.push(slot);
    slots.sort((a, b) => deficit_actual[dia][b] * peso(b) - deficit_actual[dia][a] * peso(a) || a - b);

    for (const slot of slots) {
      const parados = Object.keys(asignacion_aux).filter(id => asignacion_aux[id][dia][slot] === "PARADO");
      const maxActivables = parados.length - 1; // H-A2: ≥1 AUX queda PARADO supervisando
      if (maxActivables <= 0) continue;
      const designado = supervisor_designado[dia];
      const elegibles = parados.filter(id => id !== designado); // R3: el designado no se sienta
      const continuo = (id: string) => {
        const fila = asignacion_aux[id][dia];
        return (fila[slot - 1] === "CAJA" || fila[slot + 1] === "CAJA") ? 1 : 0;
      };
      elegibles.sort((a, b) => continuo(b) - continuo(a)
        || contarHorasCaja(asignacion_aux[a]) - contarHorasCaja(asignacion_aux[b])
        || a.localeCompare(b));
      const n = Math.min(deficit_actual[dia][slot], maxActivables, elegibles.length);
      for (let i = 0; i < n; i++) {
        asignacion_aux[elegibles[i]][dia][slot] = "CAJA";
        deficit_actual[dia][slot] -= 1;
      }
    }
  }

  return { asignacion_aux, deficit_2: deficit_actual, auxes_activados_08_09, supervisor_designado, violaciones_input };
}

/**
 * R3: si en el día hay 2+ AUX presentes a la vez en algún slot, designa al de
 * mayor presencia (desempate por id) como supervisor de jornada completa: queda
 * PARADO supervisando. Devuelve su id, o null si no aplica.
 */
function designarSupervisorJornadaCompleta(asignacion_aux: Record<string, AsignacionAux[][]>, dia: DiaSemana): string | null {
  const horasPresencia: Record<string, number> = {};
  let maxSimultaneos = 0;
  for (let slot = 0; slot < SLOTS_POR_DIA; slot++) {
    let simultaneos = 0;
    for (const [auxId, matriz] of Object.entries(asignacion_aux)) {
      if (matriz[dia][slot] !== "NO_PRESENTE") {
        simultaneos++;
        horasPresencia[auxId] = (horasPresencia[auxId] ?? 0) + 1;
      }
    }
    if (simultaneos > maxSimultaneos) maxSimultaneos = simultaneos;
  }
  if (maxSimultaneos < 2) return null;
  const presentes = Object.keys(horasPresencia);
  presentes.sort((a, b) => horasPresencia[b] - horasPresencia[a] || a.localeCompare(b));
  return presentes[0] ?? null;
}

function contarHorasCaja(matriz: AsignacionAux[][]): number {
  let count = 0;
  for (let dia = 0; dia < 7; dia++) for (let slot = 0; slot < SLOTS_POR_DIA; slot++) if (matriz[dia][slot] === "CAJA") count++;
  return count / 2;
}

// Wrapper para compatibilidad con el orquestador histórico.
export function activarAuxiliares(input: InputAlgoritmo, _a: unknown, _b: unknown): ReturnType<typeof ejecutarPasada2> {
  return ejecutarPasada2(input, ejecutarPasada1(input));
}
