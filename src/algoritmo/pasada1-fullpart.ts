// src/algoritmo/pasada1-fullpart.ts
// Generación de jornadas para colaboradores FULL y PART (pasada 1).
// Implementación greedy colaborador por colaborador con generadores y poda temprana.
// Prompt 1.6 – reescritura completa para evitar OOM.

import type { InputAlgoritmo, Jornada, DiaSemana, ExcepcionSemanal } from "./types";
import {
  CATALOGO_FULL_CORRIDAS,
  CATALOGO_FULL_CORTADAS,
  generarParesCortada
} from "./catalogos";
import {
  validarSemanaFull,
  validarSemanaPart,
  validarDescansoEntreDias
} from "./reglas";

export interface ResultadoPasada1 {
  jornadas_full: Record<string, Jornada[]>;
  jornadas_part: Record<string, Jornada[]>;
  deficit_1: number[][]; // 7 x 30
  infactibles: string[];
}

const DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];

// ============== FUNCIÓN PRINCIPAL ==============

export function ejecutarPasada1(input: InputAlgoritmo): ResultadoPasada1 {
  const fulls = input.colaboradores.filter(c => c.rol === "FULL");
  const parts = input.colaboradores.filter(c => c.rol === "PART");

  // Déficit actual [día][slot], inicializado con la demanda
  const deficit: number[][] = input.demanda.map(fila => [...fila]);

  const jornadas_full: Record<string, Jornada[]> = {};
  const jornadas_part: Record<string, Jornada[]> = {};
  const infactibles: string[] = [];

  // Contador de francos por día para H-FR1
  const francos_por_dia: number[] = [0, 0, 0, 0, 0, 0, 0];

  const excepciones = input.excepciones ?? [];

  // Procesar FULLs primero (más restricciones), luego PARTs
  for (const colab of fulls) {
    const mejor = buscarMejorSemanaFull(colab.id, deficit, francos_por_dia, excepciones, colab.nombre);
    if (!mejor) {
      infactibles.push(colab.id);
      jornadas_full[colab.id] = [];
      continue;
    }
    jornadas_full[colab.id] = mejor;
    aplicarJornadasADeficit(mejor, deficit);
    actualizarFrancos(mejor, francos_por_dia);
  }

  for (const colab of parts) {
    const mejor = buscarMejorSemanaPart(colab.id, deficit, francos_por_dia, excepciones, colab.nombre);
    if (!mejor) {
      infactibles.push(colab.id);
      jornadas_part[colab.id] = [];
      continue;
    }
    jornadas_part[colab.id] = mejor;
    aplicarJornadasADeficit(mejor, deficit);
    actualizarFrancos(mejor, francos_por_dia);
  }

  return {
    jornadas_full,
    jornadas_part,
    deficit_1: deficit,
    infactibles,
  };
}

// ============== FILTRO DE EXCEPCIONES ==============

function jornadaViolaExcepcion(
  jornada: Jornada,
  excepciones: ExcepcionSemanal[],
  nombre_colaborador: string
): boolean {
  const exc = excepciones.filter(e => e.colaboradorNombre === nombre_colaborador);
  if (exc.length === 0) return false;

  const es_franco = jornada.bloques.length === 0;

  for (const e of exc) {
    switch (e.tipo) {
      case "franco_dia": {
        const dia_forzado = parseInt(e.valor ?? "-1");
        if (jornada.dia === dia_forzado && !es_franco) return true;
        if (jornada.dia !== dia_forzado && es_franco) return true;
        break;
      }
      case "no_antes_de": {
        if (!es_franco && e.valor) {
          const [h, m] = e.valor.split(":").map(Number);
          const slot_minimo = (h - 8) * 2 + Math.floor(m / 30);
          if (jornada.bloques[0].slot_inicio < slot_minimo) return true;
        }
        break;
      }
      case "no_despues_de": {
        if (!es_franco && e.valor) {
          const [h, m] = e.valor.split(":").map(Number);
          const slot_maximo = (h - 8) * 2 + Math.floor(m / 30);
          const ultimo_bloque = jornada.bloques[jornada.bloques.length - 1];
          if (ultimo_bloque.slot_fin > slot_maximo) return true;
        }
        break;
      }
      case "siempre_cierre": {
        if (!es_franco) {
          const ultimo_bloque = jornada.bloques[jornada.bloques.length - 1];
          if (ultimo_bloque.slot_fin < 28) return true;
        }
        break;
      }
      case "solo_matutino": {
        if (!es_franco) {
          if (jornada.bloques[0].slot_inicio > 4) return true;
        }
        break;
      }
      case "solo_nocturno": {
        if (!es_franco) {
          if (jornada.bloques[0].slot_inicio < 18) return true;
        }
        break;
      }
    }
  }
  return false;
}

// ============== BÚSQUEDA FULL ==============

function buscarMejorSemanaFull(
  colab_id: string,
  deficit: number[][],
  francos_por_dia: number[],
  excepciones: ExcepcionSemanal[],
  nombre_colaborador: string
): Jornada[] | null {
  let mejor: Jornada[] | null = null;
  let mejorScore = Infinity;

  // Generar candidatos de semana FULL uno por uno
  for (const semana of generarSemanasFull(colab_id, francos_por_dia)) {
    // Poda 0: filtrar por excepciones del colaborador (mas barato que H-F*)
    if (semana.some(j => jornadaViolaExcepcion(j, excepciones, nombre_colaborador))) continue;

    // Poda 1: validación rápida de reglas duras H-F* (estructura)
    if (validarSemanaFull(colab_id, semana).length > 0) continue;

    // Poda 2: validar H-D1 (descanso entre días)
    let violaD1 = false;
    for (let d = 0; d < 6; d++) {
      if (validarDescansoEntreDias(colab_id, semana[d], semana[d + 1]).length > 0) {
        violaD1 = true;
        break;
      }
    }
    if (violaD1) continue;

    // Calcular score (déficit ponderado tras aplicar esta semana)
    const score = calcularScoreSemana(semana, deficit);

    if (score < mejorScore) {
      mejorScore = score;
      mejor = semana;
    }
  }

  return mejor;
}

// ============== GENERADOR DE SEMANAS FULL ==============

function* generarSemanasFull(
  colab_id: string,
  francos_por_dia: number[]
): Generator<Jornada[]> {
  // Distribución requerida: 3×9h + 2×8h + 1×5h + 1 franco, 2 cortados
  // Patrones válidos de cortados:
  //   A) 2 × F-CORT-9 → restante: 1×9h + 2×8h + 1×5h en 4 días
  //   B) 1 × F-CORT-9 + 1 × F-CORT-8 → restante: 2×9h + 1×8h + 1×5h en 4 días

  // Para cada día de franco posible (0..6)
  for (let franco_dia = 0; franco_dia < 7; franco_dia++) {
    // Saltar si ya hay 2 francos en ese día (H-FR1)
    if (francos_por_dia[franco_dia] >= 2) continue;

    const dias_trabajados = DIAS.filter(d => d !== franco_dia);

    // Para cada par de días que van a ser cortados (entre los 6 trabajados)
    for (let i = 0; i < dias_trabajados.length; i++) {
      for (let j = i + 1; j < dias_trabajados.length; j++) {
        const dias_cortados: DiaSemana[] = [dias_trabajados[i], dias_trabajados[j]];
        const dias_corridos = dias_trabajados.filter(d => !dias_cortados.includes(d));

        // Para cada patrón de cortados (A o B)
        for (const patron of [{ cort1: "F-CORT-9", cort2: "F-CORT-9" }, { cort1: "F-CORT-9", cort2: "F-CORT-8" }] as const) {

          // Distribución de duraciones para los 4 días corridos
          // Patrón A (2 × F-CORT-9): restan 1×9 + 2×8 + 1×5 en los 4 corridos
          // Patrón B (1 × F-CORT-9 + 1 × F-CORT-8): restan 2×9 + 1×8 + 1×5 en los 4 corridos
          const duraciones_corridas: number[] =
            patron.cort1 === "F-CORT-9" && patron.cort2 === "F-CORT-9"
              ? [18, 16, 16, 10]   // 9+8+8+5 en slots
              : [18, 18, 16, 10];  // 9+9+8+5 en slots

          // Permutaciones de cómo asignar las duraciones a los 4 días corridos
          for (const perm of permutacionesUnicas(duraciones_corridas)) {

            // Generar jornadas corridas: elegir inicio que maximice cobertura del déficit local
            const jornadas_corridas_candidatas: Array<Jornada | null> = dias_corridos.map((dia, idx) => {
              return elegirJornadaCorrida(colab_id, dia, perm[idx]);
            });

            if (jornadas_corridas_candidatas.some(j => j === null)) continue;

            // Generar jornadas cortadas
            const cortada1 = elegirJornadaCortada(colab_id, dias_cortados[0], patron.cort1);
            const cortada2 = elegirJornadaCortada(colab_id, dias_cortados[1], patron.cort2);

            if (!cortada1 || !cortada2) continue;

            // Ensamblar semana ordenada por día
            const semana: Jornada[] = new Array(7);
            semana[franco_dia] = { colab_id, dia: franco_dia as DiaSemana, bloques: [] };
            dias_corridos.forEach((dia, idx) => {
              semana[dia] = jornadas_corridas_candidatas[idx]!;
            });
            semana[dias_cortados[0]] = cortada1;
            semana[dias_cortados[1]] = cortada2;

            yield semana;
          }
        }
      }
    }
  }
}

// ============== HELPERS ==============

function elegirJornadaCorrida(
  colab_id: string,
  dia: DiaSemana,
  duracion_slots: number
): Jornada | null {
  // Buscar entre las jornadas del catálogo con la duración pedida
  const candidatas = CATALOGO_FULL_CORRIDAS.filter(j => j.duracion_slots === duracion_slots);

  // Elegir el inicio determinístico: el menor slot_inicio_min del primer candidato que sea mañana
  // Simplificación: tomar el primer inicio válido del primer tipo de jornada mañana
  for (const jv of candidatas) {
    if (jv.turno === "mañana") {
      return {
        colab_id,
        dia,
        bloques: [{ slot_inicio: jv.slot_inicio_min, slot_fin: jv.slot_inicio_min + duracion_slots }]
      };
    }
  }

  // Fallback: primera tarde
  for (const jv of candidatas) {
    return {
      colab_id,
      dia,
      bloques: [{ slot_inicio: jv.slot_inicio_min, slot_fin: jv.slot_inicio_min + duracion_slots }]
    };
  }

  return null;
}

function elegirJornadaCortada(
  colab_id: string,
  dia: DiaSemana,
  tipo: "F-CORT-9" | "F-CORT-8"
): Jornada | null {
  const cortada = CATALOGO_FULL_CORTADAS.find(c => c.tipo === tipo);
  if (!cortada) return null;

  // Elegir primer inicio válido del primer bloque, primera composición
  for (let compIdx = 0; compIdx < cortada.composiciones.length; compIdx++) {
    for (let slot_inicio_b1 = 0; slot_inicio_b1 <= 30 - cortada.composiciones[compIdx].slots_b1; slot_inicio_b1++) {
      const pares = generarParesCortada(cortada, slot_inicio_b1, compIdx);
      if (pares.length > 0) {
        const [b1, b2] = pares[0];
        return { colab_id, dia, bloques: [b1, b2] };
      }
    }
  }

  return null;
}

function calcularScoreSemana(semana: Jornada[], deficit: number[][]): number {
  // Score = déficit ponderado tras aplicar la semana
  // Cada slot cubierto reduce déficit en 1
  let score = 0;
  const tmp: number[][] = deficit.map(f => [...f]);
  for (const jornada of semana) {
    for (const b of jornada.bloques) {
      for (let s = b.slot_inicio; s < b.slot_fin; s++) {
        if (tmp[jornada.dia][s] > 0) tmp[jornada.dia][s] -= 1;
      }
    }
  }
  // Sumar déficit restante total (penalización)
  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < 30; s++) {
      score += tmp[d][s];
    }
  }
  return score;
}

function aplicarJornadasADeficit(semana: Jornada[], deficit: number[][]): void {
  for (const jornada of semana) {
    for (const b of jornada.bloques) {
      for (let s = b.slot_inicio; s < b.slot_fin; s++) {
        if (deficit[jornada.dia][s] > 0) deficit[jornada.dia][s] -= 1;
      }
    }
  }
}

function actualizarFrancos(semana: Jornada[], francos_por_dia: number[]): void {
  for (const jornada of semana) {
    if (jornada.bloques.length === 0) francos_por_dia[jornada.dia] += 1;
  }
}

function* permutacionesUnicas(arr: number[]): Generator<number[]> {
  if (arr.length === 0) { yield []; return; }
  const used = new Array(arr.length).fill(false);
  const current: number[] = [];

  function* helper(): Generator<number[]> {
    if (current.length === arr.length) {
      yield [...current];
      return;
    }
    const seen = new Set<number>();
    for (let i = 0; i < arr.length; i++) {
      if (used[i]) continue;
      if (seen.has(arr[i])) continue;
      seen.add(arr[i]);
      used[i] = true;
      current.push(arr[i]);
      yield* helper();
      current.pop();
      used[i] = false;
    }
  }
  yield* helper();
}

// ============== BÚSQUEDA PART ==============

function buscarMejorSemanaPart(
  colab_id: string,
  deficit: number[][],
  francos_por_dia: number[],
  excepciones: ExcepcionSemanal[],
  nombre_colaborador: string
): Jornada[] | null {
  let mejor: Jornada[] | null = null;
  let mejorScore = Infinity;

  for (const semana of generarSemanasPart(colab_id, francos_por_dia)) {
    // Poda 0: filtrar por excepciones del colaborador
    if (semana.some(j => jornadaViolaExcepcion(j, excepciones, nombre_colaborador))) continue;

    if (validarSemanaPart(colab_id, semana).length > 0) continue;

    let violaD1 = false;
    for (let d = 0; d < 6; d++) {
      if (validarDescansoEntreDias(colab_id, semana[d], semana[d + 1]).length > 0) {
        violaD1 = true;
        break;
      }
    }
    if (violaD1) continue;

    const score = calcularScoreSemana(semana, deficit);
    if (score < mejorScore) {
      mejorScore = score;
      mejor = semana;
    }
  }

  return mejor;
}

function* generarSemanasPart(
  colab_id: string,
  francos_por_dia: number[]
): Generator<Jornada[]> {
  // PART: 6 jornadas + 1 franco, ≤31h, corridas 4-6h, ≥2 mañanas
  // Estrategia simple: para cada día de franco, asignar 6 jornadas de 5h (30h total)
  //   con turno alternado para cumplir ≥2 mañanas

  for (let franco_dia = 0; franco_dia < 7; franco_dia++) {
    if (francos_por_dia[franco_dia] >= 2) continue;

    const dias_trabajados = DIAS.filter(d => d !== franco_dia);

    // Configuración simple: 2 primeras mañanas, 2 siguientes tarde, 2 últimas noche
    // Inicios: mañana=0 (08:00), tarde=10 (13:00), noche=18 (17:00)
    const patrones = [
      [0, 0, 10, 10, 18, 18],  // 2M, 2T, 2N
      [0, 0, 0, 10, 10, 18],   // 3M, 2T, 1N
      [0, 0, 10, 10, 10, 18],  // 2M, 3T, 1N
    ];

    for (const inicios of patrones) {
      const semana: Jornada[] = new Array(7);
      semana[franco_dia] = { colab_id, dia: franco_dia as DiaSemana, bloques: [] };
      dias_trabajados.forEach((dia, idx) => {
        const ini = inicios[idx];
        semana[dia] = {
          colab_id,
          dia,
          bloques: [{ slot_inicio: ini, slot_fin: ini + 10 }]  // 5h = 10 slots
        };
      });
      yield semana;
    }
  }
}

// Función legacy para compatibilidad con orquestador.ts
export function generarJornadasFullPart(
  input: InputAlgoritmo
): Pick<import("./types").ResultadoSemanal, 'jornadas_full' | 'jornadas_part'> {
  const resultado = ejecutarPasada1(input);
  return {
    jornadas_full: resultado.jornadas_full,
    jornadas_part: resultado.jornadas_part,
  };
}