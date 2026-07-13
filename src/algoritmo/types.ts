// src/algoritmo/types.ts
// Tipos compartidos del algoritmo de horarios v2.
// Referencia: ai/architecture.md §3.

import type { ExcepcionSemanal } from "../types/index";
export type { ExcepcionSemanal };

export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;
// 0=LUN, 1=MAR, 2=MIE, 3=JUE, 4=VIE, 5=SAB, 6=DOM

export type SlotIdx = number; // 0..29, cada slot = 30 min, slot 0 = 08:00-08:30

export const SLOTS_POR_DIA = 30;
export const HORA_INICIO_OPERACION = 8;   // 08:00
export const HORA_FIN_OPERACION = 22.5;   // 22:30

export interface Bloque {
  slot_inicio: SlotIdx; // inclusivo
  slot_fin: SlotIdx;    // exclusivo, 1..30
}

export interface Jornada {
  colab_id: string;
  dia: DiaSemana;
  bloques: Bloque[]; // 1 elemento = corrida; 2 elementos = cortada
}

export type Rol = "FULL" | "PART" | "AUX" | "EVENTUAL";

export interface Colaborador {
  id: string;
  nombre: string;
  rol: Rol;
}

export type AsignacionAux = "CAJA" | "PARADO" | "NO_PRESENTE";
export type AsignacionEv  = "CAJA" | "NO_USADO" | "NO_DISPONIBLE";

// Matrices indexadas como [dia][slot]
export type MatrizDemanda = number[][]; // 7 x 30
export type MatrizPresencia = AsignacionAux[][]; // 7 x 30, por aux
export type MatrizDisponibilidad = AsignacionEv[][]; // 7 x 30, por eventual

// Sesgo blando por turno para un colaborador: puntos de utilidad que se suman
// a cada jornada candidata según su clasificación. Positivo = preferir,
// negativo = evitar. Magnitudes pequeñas (±12) frente a la utilidad de
// demanda (~decenas-cientos por jornada): desempatan, no mandan.
export interface SesgoDia {
  manana?: number;
  tarde?: number;
  cierre?: number;
  franco?: number; // empuje blando a franco ese día (rotación fin de semana)
}
export interface SesgoTurno {
  manana: number;
  tarde: number;
  cierre: number;
  // Sesgos que sólo aplican a un día concreto (0=Lun..6=Dom): aprendizaje
  // fino por día de semana y rotación de fines de semana.
  porDia?: Record<number, SesgoDia>;
}

// Inputs completos al algoritmo
export interface InputAlgoritmo {
  demanda: MatrizDemanda;
  colaboradores: Colaborador[];
  presencia_aux: Record<string, MatrizPresencia>;        // key = colab_id con rol=AUX
  disponibilidad_eventual: Record<string, MatrizDisponibilidad>; // key = colab_id con rol=EVENTUAL
  excepciones?: ExcepcionSemanal[];
  // Preferencias blandas por colab_id (rotación + aprendizaje de correcciones).
  preferencias_turno?: Record<string, Partial<SesgoTurno>>;
  // Regla configurable del local: máximo de francos FULL+PART por día.
  // Nunca puede superar 2 (H-FR1 es dura); se clampea a [1, 2].
  max_francos_dia?: number;
}

// Outputs del algoritmo
export interface RegulaViolada {
  regla: string;          // ej: "H-F1"
  colab_id?: string;
  dia?: DiaSemana;
  detalle: string;
}

export interface ReporteReglas {
  duras_cumplidas: boolean;
  violaciones: RegulaViolada[];
  advertencias: string[];
}

export interface MetricasCobertura {
  cobertura_total_pct: number;
  deficit_por_slot: number[][];         // 7 x 30
  exceso_por_slot: number[][];          // 7 x 30
  horas_caja_por_eventual: Record<string, number>;
}

export interface ResultadoSemanal {
  semana: { desde: Date; hasta: Date };
  jornadas_full: Record<string, Jornada[]>;
  jornadas_part: Record<string, Jornada[]>;
  asignacion_aux: Record<string, AsignacionAux[][]>;      // [dia][slot]
  asignacion_eventual: Record<string, AsignacionEv[][]>;  // [dia][slot]
  metricas: MetricasCobertura;
  reporte_reglas: ReporteReglas;
}

// Helpers de tiempo
export function slotAHora(slot: SlotIdx): string {
  const horas = 8 + Math.floor(slot / 2);
  const mins = (slot % 2) * 30;
  return `${String(horas).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function horaASlot(hora: string): SlotIdx {
  const [h, m] = hora.split(":").map(Number);
  return (h - 8) * 2 + (m >= 30 ? 1 : 0);
}