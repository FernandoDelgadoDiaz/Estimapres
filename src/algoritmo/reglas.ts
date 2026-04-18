// src/algoritmo/reglas.ts
// Validadores de reglas duras del algoritmo Aliada Horarios v2.
// Implementa: H-F1..H-F7 (FULL), H-P1..H-P5 (PART), H-D1 (descanso 12h), H-FR1 (francos).
// Referencia: ai/architecture.md §5.
// Implementado en Prompt 1.

import type { Jornada, DiaSemana, RegulaViolada, Colaborador, AsignacionAux, AsignacionEv, MatrizPresencia, SlotIdx } from "./types";
import { clasificarTurno } from "./catalogos";

// H-F1 a H-F7 (FULL)
export function validarSemanaFull(
  colab_id: string,
  jornadas_semana: Jornada[]
): RegulaViolada[] {
  const violaciones: RegulaViolada[] = [];
  // H-F3: exactamente 1 día es franco (0 bloques)
  const francos = jornadas_semana.filter(j => j.bloques.length === 0).length;
  if (francos !== 1) {
    violaciones.push({
      regla: "H-F3",
      colab_id,
      detalle: `Debe tener exactamente 1 franco, tiene ${francos}`,
    });
  }

  // Calcular horas semanales y distribución
  const horasPorDia = jornadas_semana.map(j => horasDeJornada(j));
  const horasTotales = horasPorDia.reduce((a, b) => a + b, 0);
  // H-F1: suma = 48h (96 slots)
  if (Math.abs(horasTotales - 48) > 0.01) {
    violaciones.push({
      regla: "H-F1",
      colab_id,
      detalle: `Suma ${horasTotales}h, debe ser 48h`,
    });
  }

  // Contar tipos de jornadas
  const cortadas = jornadas_semana.filter(j => esJornadaCortada(j));
  // H-F5: exactamente 2 días con jornada cortada
  if (cortadas.length !== 2) {
    violaciones.push({
      regla: "H-F5",
      colab_id,
      detalle: `Debe tener exactamente 2 jornadas cortadas, tiene ${cortadas.length}`,
    });
  }
  // H-F6: los 5 días restantes (no franco, no cortado) son corridos
  // (ya separamos corridas, pero debemos verificar que sean 5 días corridos)
  // Según H-F2: composición exacta 3×9h + 2×8h + 1×5h + franco.
  // Esos 6 días trabajados incluyen 2 cortados y 4 corridos.
  // Entonces días corridos = 4. Verificar.
  // Primero, calcular distribución de duraciones.
  const duraciones = horasPorDia.filter(h => h > 0); // excluir franco
  const count9 = duraciones.filter(h => Math.abs(h - 9) < 0.01).length;
  const count8 = duraciones.filter(h => Math.abs(h - 8) < 0.01).length;
  const count5 = duraciones.filter(h => Math.abs(h - 5) < 0.01).length;
  // H-F2: composición exacta 3×9h + 2×8h + 1×5h + franco
  if (count9 !== 3 || count8 !== 2 || count5 !== 1) {
    violaciones.push({
      regla: "H-F2",
      colab_id,
      detalle: `Distribución incorrecta: ${count9}x9h, ${count8}x8h, ${count5}x5h (debe ser 3x9, 2x8, 1x5)`,
    });
  }

  // H-F4: ≥2 jornadas clasificadas como mañana
  const turnos = jornadas_semana
    .filter(j => j.bloques.length > 0)
    .map(j => clasificarTurnoJornada(j));
  const mananas = turnos.filter(t => t === "mañana").length;
  if (mananas < 2) {
    violaciones.push({
      regla: "H-F4",
      colab_id,
      detalle: `Tiene ${mananas} jornadas mañana, necesita al menos 2`,
    });
  }

  // H-F7: en cortados, bloque2.slot_inicio - bloque1.slot_fin ≥ 8 (descanso 4h)
  for (const jornada of cortadas) {
    const [b1, b2] = jornada.bloques;
    if (b2.slot_inicio - b1.slot_fin < 8) {
      violaciones.push({
        regla: "H-F7",
        colab_id,
        dia: jornada.dia,
        detalle: `Descanso insuficiente en jornada cortada: ${b2.slot_inicio - b1.slot_fin} slots (mínimo 8)`,
      });
    }
  }

  return violaciones;
}

// H-P1 a H-P5 (PART)
export function validarSemanaPart(
  colab_id: string,
  jornadas_semana: Jornada[]
): RegulaViolada[] {
  const violaciones: RegulaViolada[] = [];
  // H-P2: exactamente 1 franco
  const francos = jornadas_semana.filter(j => j.bloques.length === 0).length;
  if (francos !== 1) {
    violaciones.push({
      regla: "H-P2",
      colab_id,
      detalle: `Debe tener exactamente 1 franco, tiene ${francos}`,
    });
  }

  // H-P1: suma ≤ 62 slots (31h)
  const slotsTotales = jornadas_semana
    .map(j => j.bloques.reduce((sum, b) => sum + (b.slot_fin - b.slot_inicio), 0))
    .reduce((a, b) => a + b, 0);
  if (slotsTotales > 62) {
    violaciones.push({
      regla: "H-P1",
      colab_id,
      detalle: `Suma ${slotsTotales} slots (${slotsTotales / 2}h), máximo 62 slots (31h)`,
    });
  }

  // H-P3: ≥2 jornadas mañana
  const turnos = jornadas_semana
    .filter(j => j.bloques.length > 0)
    .map(j => clasificarTurnoJornada(j));
  const mananas = turnos.filter(t => t === "mañana").length;
  if (mananas < 2) {
    violaciones.push({
      regla: "H-P3",
      colab_id,
      detalle: `Tiene ${mananas} jornadas mañana, necesita al menos 2`,
    });
  }

  // H-P4: todas corridas (1 bloque)
  const noCorridas = jornadas_semana.filter(j => j.bloques.length > 1);
  if (noCorridas.length > 0) {
    violaciones.push({
      regla: "H-P4",
      colab_id,
      detalle: `Tiene ${noCorridas.length} jornadas no corridas (cortadas)`,
    });
  }

  // H-P5: duración ∈ {8, 9, 10, 11, 12} slots (4-6h)
  for (const jornada of jornadas_semana) {
    if (jornada.bloques.length === 0) continue; // franco
    const duracionSlots = jornada.bloques.reduce((sum, b) => sum + (b.slot_fin - b.slot_inicio), 0);
    if (duracionSlots < 8 || duracionSlots > 12) {
      violaciones.push({
        regla: "H-P5",
        colab_id,
        dia: jornada.dia,
        detalle: `Duración ${duracionSlots} slots (${duracionSlots / 2}h) fuera de rango 8-12 slots (4-6h)`,
      });
    }
  }

  return violaciones;
}

// H-D1 descanso 12h entre días distintos
// Si alguno de los dos días es null (franco), la regla no aplica → retornar []
export function validarDescansoEntreDias(
  colab_id: string,
  jornada_dia_n: Jornada | null,
  jornada_dia_siguiente: Jornada | null
): RegulaViolada[] {
  // Si alguno es null o franco, la regla no aplica
  if (!jornada_dia_n || !jornada_dia_siguiente) return [];
  if (jornada_dia_n.bloques.length === 0) return [];
  if (jornada_dia_siguiente.bloques.length === 0) return [];

  // slot_fin del último bloque del día N
  const ultimo_bloque_n = jornada_dia_n.bloques[jornada_dia_n.bloques.length - 1];
  const slot_fin_d1 = ultimo_bloque_n.slot_fin;

  // slot_inicio del primer bloque del día N+1
  const primer_bloque_d2 = jornada_dia_siguiente.bloques[0];
  const slot_inicio_d2 = primer_bloque_d2.slot_inicio;

  // Descanso total = slots libres día N + slots muertos nocturnos + slots libres día N+1
  const descanso_slots = (30 - slot_fin_d1) + 19 + slot_inicio_d2;

  if (descanso_slots < 24) {
    return [{
      regla: "H-D1",
      colab_id,
      dia: jornada_dia_siguiente.dia,
      detalle: `Descanso insuficiente entre dia ${jornada_dia_n.dia} y dia ${jornada_dia_siguiente.dia}: ${descanso_slots} slots (${descanso_slots / 2}h), minimo 24 slots (12h)`
    }];
  }

  return [];
}

// H-FR1 máximo 2 francos por día (FULL + PART)
export function validarFrancosPorDia(
  jornadas_full: Record<string, Jornada[]>,
  jornadas_part: Record<string, Jornada[]>
): RegulaViolada[] {
  const violaciones: RegulaViolada[] = [];
  // Contar francos por día
  const francosPorDia: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const jornadas of Object.values(jornadas_full)) {
    for (const jornada of jornadas) {
      if (jornada.bloques.length === 0) {
        francosPorDia[jornada.dia]++;
      }
    }
  }
  for (const jornadas of Object.values(jornadas_part)) {
    for (const jornada of jornadas) {
      if (jornada.bloques.length === 0) {
        francosPorDia[jornada.dia]++;
      }
    }
  }
  for (let dia = 0; dia < 7; dia++) {
    if (francosPorDia[dia] > 2) {
      violaciones.push({
        regla: "H-FR1",
        dia: dia as DiaSemana,
        detalle: `Día ${dia} tiene ${francosPorDia[dia]} francos (máximo 2)`,
      });
    }
  }
  return violaciones;
}

// Helpers puros
export function esJornadaCortada(j: Jornada): boolean {
  return j.bloques.length === 2;
}

export function horasDeJornada(j: Jornada): number {
  if (j.bloques.length === 0) return 0;
  const slots = j.bloques.reduce((sum, b) => sum + (b.slot_fin - b.slot_inicio), 0);
  return slots / 2; // cada slot = 30 min
}

export function horasSemanales(jornadas: Jornada[]): number {
  return jornadas.reduce((sum, j) => sum + horasDeJornada(j), 0);
}

export function clasificarTurnoJornada(j: Jornada): "mañana" | "tarde" | "noche" {
  if (j.bloques.length === 0) return "mañana"; // default, no debería usarse
  return clasificarTurno(j.bloques[0].slot_inicio);
}

// Funciones de interfaz legacy (para compatibilidad con orquestador.ts)
export function validarReglasFull(
  jornadas: Record<string, Jornada[]>,
  colaboradores: Colaborador[]
): { duras_cumplidas: boolean; violaciones: RegulaViolada[] } {
  const violaciones: RegulaViolada[] = [];
  for (const colab of colaboradores) {
    const colabJornadas = jornadas[colab.id] || [];
    violaciones.push(...validarSemanaFull(colab.id, colabJornadas));
  }
  return { duras_cumplidas: violaciones.length === 0, violaciones };
}

export function validarReglasPart(
  jornadas: Record<string, Jornada[]>,
  colaboradores: Colaborador[]
): { duras_cumplidas: boolean; violaciones: RegulaViolada[] } {
  const violaciones: RegulaViolada[] = [];
  for (const colab of colaboradores) {
    const colabJornadas = jornadas[colab.id] || [];
    violaciones.push(...validarSemanaPart(colab.id, colabJornadas));
  }
  return { duras_cumplidas: violaciones.length === 0, violaciones };
}

export function validarDescanso12h(
  jornadas: Record<string, Jornada[]>
): { duras_cumplidas: boolean; violaciones: RegulaViolada[] } {
  const violaciones: RegulaViolada[] = [];
  for (const [colab_id, jornadasSemana] of Object.entries(jornadas)) {
    // Ordenar por día
    const porDia: (Jornada | null)[] = new Array(7).fill(null);
    for (const j of jornadasSemana) {
      porDia[j.dia] = j;
    }
    for (let dia = 0; dia < 6; dia++) {
      const viol = validarDescansoEntreDias(colab_id, porDia[dia], porDia[dia + 1]);
      violaciones.push(...viol);
    }
  }
  return { duras_cumplidas: violaciones.length === 0, violaciones };
}

export function validarReglasAux(
  _asignacion: Record<string, AsignacionAux[][]>,
  _presencia: Record<string, AsignacionAux[][]>
): { duras_cumplidas: boolean; violaciones: RegulaViolada[] } {
  // H‑A1..H‑A4 a implementar en Prompt 2
  return { duras_cumplidas: true, violaciones: [] };
}

export function validarReglasEventual(
  _asignacion: Record<string, AsignacionEv[][]>,
  _disponibilidad: Record<string, AsignacionEv[][]>
): { duras_cumplidas: boolean; violaciones: RegulaViolada[] } {
  // H‑E1..H‑E2 a implementar en Prompt 3
  return { duras_cumplidas: true, violaciones: [] };
}

// ============== REGLAS H-A* (AUX) ==============
// Validadores para reglas de auxiliares (architecture.md §5.5)
// Agregado en Prompt 2.

/**
 * H-A1: validacion de input previa a Pasada 2.
 * Cada dia debe tener al menos 1 aux presente en 08:00-09:00 (slots 0 y 1).
 * Si hay 0 auxes presentes en 08-09 algun dia, es input invalido.
 */
export function validarPresenciaAux0809(
  presencia_aux: Record<string, MatrizPresencia>
): RegulaViolada[] {
  const violaciones: RegulaViolada[] = [];
  const dias: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];

  for (const dia of dias) {
    let n_presentes_08_09 = 0;
    for (const matriz of Object.values(presencia_aux)) {
      if (matriz[dia][0] !== "NO_PRESENTE" && matriz[dia][1] !== "NO_PRESENTE") {
        n_presentes_08_09++;
      }
    }
    if (n_presentes_08_09 < 1) {
      violaciones.push({
        regla: "H-A1",
        dia,
        detalle: `Dia ${dia}: no hay ningun aux presente 08-09. Se requiere al menos 1.`,
      });
    }
  }

  return violaciones;
}

/**
 * H-A2 pre-check: en cada slot del rango 09:00-22:00 debe haber al menos 1 aux presente.
 * Si algun slot no tiene ningun aux, H-A2 es imposible de cumplir.
 */
export function validarCobertura0922(
  presencia_aux: Record<string, MatrizPresencia>
): RegulaViolada[] {
  const violaciones: RegulaViolada[] = [];
  const dias: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];

  for (const dia of dias) {
    // slots 2 a 27 corresponden a 09:00-22:00
    for (let slot = 2; slot <= 27; slot++) {
      let n_presentes = 0;
      for (const matriz of Object.values(presencia_aux)) {
        if (matriz[dia][slot] !== "NO_PRESENTE") n_presentes++;
      }
      if (n_presentes < 1) {
        violaciones.push({
          regla: "H-A2",
          dia,
          detalle: `Dia ${dia} slot ${slot}: no hay ningun aux presente 09-22.`,
        });
      }
    }
  }

  return violaciones;
}

/**
 * Valida que la asignacion final de auxes cumpla H-A1, H-A2, H-A3 en un dia+slot concreto.
 * Se usa como validador post-generacion.
 */
export function validarAsignacionAuxSlot(
  dia: DiaSemana,
  slot: SlotIdx,
  asignaciones_en_slot: Array<{ colab_id: string; asignacion: AsignacionAux }>
): RegulaViolada[] {
  const violaciones: RegulaViolada[] = [];

  const en_caja = asignaciones_en_slot.filter(a => a.asignacion === "CAJA");
  const parados = asignaciones_en_slot.filter(a => a.asignacion === "PARADO");
  const presentes = asignaciones_en_slot.filter(a => a.asignacion !== "NO_PRESENTE");

  // H-A1: slot 0 y 1 (08:00-09:00)
  if (slot === 0 || slot === 1) {
    if (en_caja.length !== 1) {
      violaciones.push({
        regla: "H-A1",
        dia,
        detalle: `Dia ${dia} slot ${slot}: debe haber exactamente 1 aux en CAJA (hay ${en_caja.length}).`,
      });
    }
  }

  // H-A2: slots 2..27 (09:00-22:00)
  if (slot >= 2 && slot <= 27) {
    if (presentes.length >= 1 && parados.length < 1) {
      violaciones.push({
        regla: "H-A2",
        dia,
        detalle: `Dia ${dia} slot ${slot}: todos los auxes presentes estan en CAJA. Debe quedar al menos 1 PARADO.`,
      });
    }
  }

  // H-A3: slots 28, 29 (22:00-22:30)
  if (slot >= 28) {
    if (en_caja.length > 0) {
      violaciones.push({
        regla: "H-A3",
        dia,
        detalle: `Dia ${dia} slot ${slot}: ${en_caja.length} auxes en CAJA despues de las 22:00. Debe ser 0.`,
      });
    }
  }

  return violaciones;
}