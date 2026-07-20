// src/algoritmo/pasada1-fullpart.ts
// Pasada 1 v3 — optimización global de cobertura para FULL y PART.
//
// Problemas de raíz de la versión greedy anterior:
//   1. El score sumaba demanda bruta cuando había déficit y no penalizaba el
//      superávit → saturaba franjas de baja demanda y dejaba huecos en los picos.
//   2. Cada día se colapsaba a UN candidato por (día, duración, turno) antes de
//      armar la semana; H-D1 y las excepciones se filtraban después → semanas
//      buenas enteras se descartaban por un solo día mal elegido.
//   3. Una única pasada greedy por colaborador sin re-optimización → sin
//      complementariedad (el PART no podía re-acomodarse a lo que dejó el FULL).
//
// Diseño actual:
//   A. Utilidad marginal convexa por slot. Con x = déficit residual del slot:
//        gain(x) = 2x-1        si x ≥ 1  (cubrir déficit profundo vale más)
//        gain(x) = 0.5·(2x-1)  si x ≤ 0  (cubrir de más RESTA: superávit)
//      Es el descenso exacto del potencial Φ = Σ déficit² + 0.5·Σ superávit²,
//      por lo que minimiza simultáneamente déficit y superávit.
//   B. Por colaborador, programación dinámica EXACTA sobre los 7 días.
//      Estado: (fin de la jornada anterior → descanso 12h H-D1, franco usado,
//      mañanas corridas acumuladas, composición restante de jornadas).
//      Devuelve LA semana válida óptima contra la demanda residual, cumpliendo
//      por construcción H-F1..H-F7 / H-P1..H-P5 / H-D1 / H-FR1 y excepciones.
//   C. Pasadas de mejora (ruin & recreate): cada colaborador se quita de la
//      cobertura y se re-optimiza contra lo que dejan los demás. Solo se acepta
//      mejora estricta → el potencial decrece monótonamente y converge.

import type {
  InputAlgoritmo,
  Jornada,
  DiaSemana,
  ExcepcionSemanal,
  Bloque,
  Colaborador,
  SesgoTurno,
} from "./types";
import {
  CATALOGO_FULL_CORRIDAS,
  CATALOGO_FULL_CORTADAS,
  CATALOGO_PART,
  generarParesCortada,
} from "./catalogos";

export interface ResultadoPasada1 {
  jornadas_full: Record<string, Jornada[]>;
  jornadas_part: Record<string, Jornada[]>;
  deficit_1: number[][]; // 7 x 30
  infactibles: string[];
}

const PESO_SUPERAVIT = 0.5;   // cubrir de más cuesta la mitad de lo que rinde cubrir déficit
const PENALIZACION_FRANCO = 30; // por franco ya existente ese día (reparto suave, H-FR1 es dura)
const MAX_PASADAS = 8;
const PRESUPUESTO_MS = 6000;
const SESGO_MAX = 12; // tope del sesgo blando por jornada: desempata, no manda

const SESGO_NEUTRO: SesgoTurno = { manana: 0, tarde: 0, cierre: 0 };

function clampSesgo(v?: number): number {
  return Math.max(-SESGO_MAX, Math.min(SESGO_MAX, v ?? 0));
}

function normalizarSesgo(s?: Partial<SesgoTurno>): SesgoTurno {
  if (!s) return SESGO_NEUTRO;
  const norm: SesgoTurno = {
    manana: clampSesgo(s.manana),
    tarde: clampSesgo(s.tarde),
    cierre: clampSesgo(s.cierre),
  };
  if (s.porDia) {
    norm.porDia = {};
    for (const [diaStr, sd] of Object.entries(s.porDia)) {
      norm.porDia[Number(diaStr)] = {
        manana: clampSesgo(sd.manana),
        tarde: clampSesgo(sd.tarde),
        cierre: clampSesgo(sd.cierre),
        franco: clampSesgo(sd.franco),
      };
    }
  }
  return norm;
}

// Clasificación de una jornada para el sesgo blando:
// - cierre: termina 22:00 o después (incluye cortadas que cierran y PART noche)
// - mañana: corrida con inicio 09:00-11:00 (las cortadas no cuentan como mañana)
// - tarde: el resto. Franco: usa el sesgo `franco` del día si existe.
// Cada jornada suma el sesgo GLOBAL del turno + el sesgo FINO de ese día.
function sesgoDeJornada(bloques: Bloque[], sesgo: SesgoTurno, dia: number): number {
  const sd = sesgo.porDia?.[dia];
  if (bloques.length === 0) return sd?.franco ?? 0;
  const fin = bloques[bloques.length - 1].slot_fin;
  const esManana = bloques.length === 1 && bloques[0].slot_inicio >= 2 && bloques[0].slot_inicio <= 6;
  let s: number;
  if (fin >= 28) s = sesgo.cierre + (sd?.cierre ?? 0);
  else if (esManana) s = sesgo.manana + (sd?.manana ?? 0);
  else s = sesgo.tarde + (sd?.tarde ?? 0);
  return s;
}

// ============== FUNCIÓN PRINCIPAL ==============

export function ejecutarPasada1(input: InputAlgoritmo): ResultadoPasada1 {
  const fulls = input.colaboradores.filter(c => c.rol === "FULL");
  const parts = input.colaboradores.filter(c => c.rol === "PART");
  const excepciones = input.excepciones ?? [];
  const demanda = input.demanda;
  // Regla operativa configurable: máximo de francos FULL+PART por día.
  // Default 2 (comportamiento histórico); el supervisor puede subirlo/bajarlo
  // según su dotación. No es una ley laboral, así que no se topa en 2.
  const cap_francos = Math.max(1, Math.round(input.max_francos_dia ?? 2));
  // Criterios de cobertura aprendidos: peso por slot (default 1 = neutro).
  const pesos = input.pesos_franja;
  // Reglas operativas configurables (fallback = comportamiento histórico).
  const aperturaSoloAux = input.apertura_solo_aux ?? false;
  const francoMedioCorridos = input.franco_medio_corridos ?? false;

  const cobertura: number[][] = Array.from({ length: 7 }, () => new Array(30).fill(0));
  const francos_full: number[] = new Array(7).fill(0);
  const francos_part: number[] = new Array(7).fill(0);

  // FULLs primero (más restricciones estructurales), luego PARTs
  const orden: Colaborador[] = [...fulls, ...parts];
  const semanas = new Map<string, Jornada[] | null>();

  const t0 = Date.now();
  for (let pasada = 0; pasada < MAX_PASADAS; pasada++) {
    let cambios = 0;
    for (const colab of orden) {
      if (pasada > 0 && Date.now() - t0 > PRESUPUESTO_MS) break;
      const es_full = colab.rol === "FULL";
      const sesgo = normalizarSesgo(input.preferencias_turno?.[colab.id]);
      const previa = semanas.get(colab.id) ?? null;

      // Quitar la semana previa: el colaborador se re-optimiza contra
      // la demanda residual que dejan todos los demás.
      if (previa) quitarSemana(previa, cobertura, francos_full, francos_part, es_full);

      const pre = prefijosUtilidad(demanda, cobertura, pesos);
      const nueva = es_full
        ? optimizarSemanaFull(colab, pre, francos_full, francos_part, excepciones, sesgo, cap_francos, aperturaSoloAux, francoMedioCorridos)
        : optimizarSemanaPart(colab, pre, francos_full, francos_part, excepciones, sesgo, cap_francos);

      let elegida: Jornada[] | null = previa;
      if (nueva) {
        if (
          !previa ||
          utilidadSemana(nueva, pre, francos_full, francos_part, sesgo) >
            utilidadSemana(previa, pre, francos_full, francos_part, sesgo) + 1e-6
        ) {
          elegida = nueva;
          cambios++;
        }
      }

      if (elegida) {
        aplicarSemana(elegida, cobertura, francos_full, francos_part, es_full);
        semanas.set(colab.id, elegida);
      } else {
        semanas.set(colab.id, null);
      }
    }
    if (cambios === 0) break;
  }

  const jornadas_full: Record<string, Jornada[]> = {};
  const jornadas_part: Record<string, Jornada[]> = {};
  const infactibles: string[] = [];
  for (const c of fulls) {
    const sem = semanas.get(c.id) ?? null;
    jornadas_full[c.id] = sem ?? [];
    if (!sem) infactibles.push(c.id);
  }
  for (const c of parts) {
    const sem = semanas.get(c.id) ?? null;
    jornadas_part[c.id] = sem ?? [];
    if (!sem) infactibles.push(c.id);
  }

  const deficit_1 = demanda.map((fila, d) =>
    fila.map((v, s) => Math.max(0, v - cobertura[d][s]))
  );

  return { jornadas_full, jornadas_part, deficit_1, infactibles };
}

// ============== UTILIDAD MARGINAL ==============

// pre[d][s] = suma acumulada de gains de los slots 0..s-1 del día d.
// La utilidad de un bloque [ini, fin) es pre[d][fin] - pre[d][ini] en O(1).
// `pesos` (criterios de cobertura aprendidos) amplifica SOLO el gain de
// cubrir déficit real (x >= 1): las franjas que el supervisor prioriza valen
// más al armar jornadas, sin distorsionar la penalización de superávit.
function prefijosUtilidad(
  demanda: number[][],
  cobertura: number[][],
  pesos?: number[]
): number[][] {
  const pre: number[][] = [];
  for (let d = 0; d < 7; d++) {
    const fila = new Array<number>(31);
    fila[0] = 0;
    for (let s = 0; s < 30; s++) {
      const x = demanda[d][s] - cobertura[d][s];
      const peso = pesos?.[s] ?? 1;
      const g = x >= 1 ? peso * (2 * x - 1) : PESO_SUPERAVIT * (2 * x - 1);
      fila[s + 1] = fila[s] + g;
    }
    pre.push(fila);
  }
  return pre;
}

function utilidadSemana(
  semana: Jornada[],
  pre: number[][],
  francos_full: number[],
  francos_part: number[],
  sesgo: SesgoTurno
): number {
  let u = 0;
  for (const j of semana) {
    if (j.bloques.length === 0) {
      u -= PENALIZACION_FRANCO * (2 * francos_full[j.dia] + francos_part[j.dia]);
      u += sesgoDeJornada(j.bloques, sesgo, j.dia); // empuje a franco del día, si hay
      continue;
    }
    for (const b of j.bloques) u += pre[j.dia][b.slot_fin] - pre[j.dia][b.slot_inicio];
    u += sesgoDeJornada(j.bloques, sesgo, j.dia);
  }
  return u;
}

function aplicarSemana(
  semana: Jornada[],
  cobertura: number[][],
  francos_full: number[],
  francos_part: number[],
  es_full: boolean
): void {
  for (const j of semana) {
    if (j.bloques.length === 0) {
      (es_full ? francos_full : francos_part)[j.dia]++;
      continue;
    }
    for (const b of j.bloques) {
      for (let s = b.slot_inicio; s < b.slot_fin; s++) cobertura[j.dia][s]++;
    }
  }
}

function quitarSemana(
  semana: Jornada[],
  cobertura: number[][],
  francos_full: number[],
  francos_part: number[],
  es_full: boolean
): void {
  for (const j of semana) {
    if (j.bloques.length === 0) {
      (es_full ? francos_full : francos_part)[j.dia]--;
      continue;
    }
    for (const b of j.bloques) {
      for (let s = b.slot_inicio; s < b.slot_fin; s++) cobertura[j.dia][s]--;
    }
  }
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
          // Las jornadas de mañana corridas quedan permitidas (H-F4/H-P3 exigen
          // mínimo 2 mañanas, si no la regla sería siempre infactible).
          // Todo lo demás (tardes y cortadas) debe terminar en el cierre.
          const ultimo_bloque = jornada.bloques[jornada.bloques.length - 1];
          const es_manana_corrida =
            jornada.bloques.length === 1 && jornada.bloques[0].slot_inicio <= 6;
          if (!es_manana_corrida && ultimo_bloque.slot_fin < 28) return true;
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

// ============== CANDIDATOS POR DÍA ==============

interface Candidato {
  bloques: Bloque[];   // [] = franco
  inicio: number;      // slot_inicio del primer bloque (irrelevante para franco)
  finB: number;        // bucket del fin: 0 = franco, 1 = fin ≤ 25, k = fin-24 para fin 26..30
  util: number;
  es_manana: boolean;  // corrida con inicio 09:00-11:00
  item: number;        // FULL: índice de ítem; PART: duración en slots; -1 = franco
}

// H-D1: descanso = (30 - fin_prev) + 19 + inicio_sig ≥ 24  ⟺  inicio_sig ≥ fin_prev - 25.
// Como fin_prev ≤ 30, solo importan los fines 26..30 → bucket finB = max(fin,25) - 24.
// La transición es válida si finB_prev = 0 (franco) o inicio ≥ finB_prev - 1.
function bucketFin(fin: number): number {
  return fin <= 25 ? 1 : fin - 24;
}

function candidatosDiaFull(
  colab: Colaborador,
  dia: DiaSemana,
  pre: number[][],
  excepciones: ExcepcionSemanal[],
  franco_permitido: boolean,
  pen_franco: number,
  sesgo: SesgoTurno,
  aperturaSoloAux: boolean
): Candidato[] {
  const cands: Candidato[] = [];

  // Corridas: ítems 0=9h, 1=8h, 2=5h
  for (const jv of CATALOGO_FULL_CORRIDAS) {
    const item = jv.duracion_slots === 18 ? 0 : jv.duracion_slots === 16 ? 1 : 2;
    for (let ini = jv.slot_inicio_min; ini <= jv.slot_inicio_max; ini++) {
      const fin = ini + jv.duracion_slots;
      if (fin > 30) continue;
      const bloques: Bloque[] = [{ slot_inicio: ini, slot_fin: fin }];
      if (jornadaViolaExcepcion({ colab_id: colab.id, dia, bloques }, excepciones, colab.nombre)) continue;
      cands.push({
        bloques,
        inicio: ini,
        finB: bucketFin(fin),
        util: pre[dia][fin] - pre[dia][ini] + sesgoDeJornada(bloques, sesgo, dia),
        es_manana: jv.turno === "mañana",
        item,
      });
    }
  }

  // Cortadas: ítems 3=CORT-9h, 4=CORT-8h. No cuentan como mañana.
  // R1 "apertura con supervisor": si está activa, el bloque 1 no arranca
  // antes de las 09:00 (slot 2) → ningún cajero cubre la franja 08:00-09:00.
  const b1Min = aperturaSoloAux ? Math.max(2, 0) : 0;
  for (const cort of CATALOGO_FULL_CORTADAS) {
    const item = cort.tipo === "F-CORT-9" ? 3 : 4;
    for (let ci = 0; ci < cort.composiciones.length; ci++) {
      for (let b1 = Math.max(cort.b1_inicio_min, b1Min); b1 <= cort.b1_inicio_max; b1++) {
        for (const [x, y] of generarParesCortada(cort, b1, ci)) {
          const bloques: Bloque[] = [x, y];
          if (jornadaViolaExcepcion({ colab_id: colab.id, dia, bloques }, excepciones, colab.nombre)) continue;
          cands.push({
            bloques,
            inicio: x.slot_inicio,
            finB: bucketFin(y.slot_fin),
            util:
              (pre[dia][x.slot_fin] - pre[dia][x.slot_inicio]) +
              (pre[dia][y.slot_fin] - pre[dia][y.slot_inicio]) +
              sesgoDeJornada(bloques, sesgo, dia),
            es_manana: false,
            item,
          });
        }
      }
    }
  }

  if (franco_permitido && !jornadaViolaExcepcion({ colab_id: colab.id, dia, bloques: [] }, excepciones, colab.nombre)) {
    cands.push({ bloques: [], inicio: 0, finB: 0, util: -pen_franco + sesgoDeJornada([], sesgo, dia), es_manana: false, item: -1 });
  }

  return cands;
}

function candidatosDiaPart(
  colab: Colaborador,
  dia: DiaSemana,
  pre: number[][],
  excepciones: ExcepcionSemanal[],
  franco_permitido: boolean,
  pen_franco: number,
  sesgo: SesgoTurno
): Candidato[] {
  const cands: Candidato[] = [];

  for (const jv of CATALOGO_PART) {
    for (let ini = jv.slot_inicio_min; ini <= jv.slot_inicio_max; ini++) {
      const fin = ini + jv.duracion_slots;
      if (fin > 30) continue;
      const bloques: Bloque[] = [{ slot_inicio: ini, slot_fin: fin }];
      if (jornadaViolaExcepcion({ colab_id: colab.id, dia, bloques }, excepciones, colab.nombre)) continue;
      cands.push({
        bloques,
        inicio: ini,
        finB: bucketFin(fin),
        util: pre[dia][fin] - pre[dia][ini] + sesgoDeJornada(bloques, sesgo, dia),
        es_manana: jv.turno === "mañana",
        item: jv.duracion_slots,
      });
    }
  }

  if (franco_permitido && !jornadaViolaExcepcion({ colab_id: colab.id, dia, bloques: [] }, excepciones, colab.nombre)) {
    cands.push({ bloques: [], inicio: 0, finB: 0, util: -pen_franco + sesgoDeJornada([], sesgo, dia), es_manana: false, item: -1 });
  }

  return cands;
}

// ============== DP FULL ==============
// Composición semanal H-F2/H-F5: duraciones {3×9h, 2×8h, 1×5h} con exactamente
// 2 cortadas. Combinaciones de cortadas posibles: {9,9}, {9,8}, {8,8}.
// Contadores restantes (r9, r8, r5 corridas; c9, c8 cortadas) codificados en
// base mixta: cnt = r9·54 + r8·18 + r5·9 + c9·3 + c8  (216 combinaciones).

const CNT_FULL = 216;
const PASO_ITEM = [54, 18, 9, 3, 1]; // decremento de cnt por ítem 0..4

const TIENE_ITEM: boolean[][] = (() => {
  const t: boolean[][] = [[], [], [], [], []];
  for (let cnt = 0; cnt < CNT_FULL; cnt++) {
    t[0][cnt] = ((cnt / 54) | 0) % 4 > 0; // r9
    t[1][cnt] = ((cnt / 18) | 0) % 3 > 0; // r8
    t[2][cnt] = ((cnt / 9) | 0) % 2 > 0;  // r5
    t[3][cnt] = ((cnt / 3) | 0) % 3 > 0;  // c9
    t[4][cnt] = cnt % 3 > 0;              // c8
  }
  return t;
})();

const COMPOSICIONES_FULL = [
  { r9: 1, r8: 2, r5: 1, c9: 2, c8: 0 }, // cortadas 9h+9h
  { r9: 2, r8: 1, r5: 1, c9: 1, c8: 1 }, // cortadas 9h+8h
  { r9: 3, r8: 0, r5: 1, c9: 0, c8: 2 }, // cortadas 8h+8h
].map(c => c.r9 * 54 + c.r8 * 18 + c.r5 * 9 + c.c9 * 3 + c.c8);

// Estado FULL: s = ((finB·2 + francoUsado)·3 + mañanas)·216 + cnt
const NUM_ESTADOS_FULL = 7 * 2 * 3 * CNT_FULL; // 9072

function optimizarSemanaFull(
  colab: Colaborador,
  pre: number[][],
  francos_full: number[],
  francos_part: number[],
  excepciones: ExcepcionSemanal[],
  sesgo: SesgoTurno,
  cap_francos: number,
  aperturaSoloAux: boolean,
  francoMedioCorridos: boolean
): Jornada[] | null {
  const cands_por_dia: Candidato[][] = [];
  for (let d = 0; d < 7; d++) {
    cands_por_dia.push(
      candidatosDiaFull(
        colab,
        d as DiaSemana,
        pre,
        excepciones,
        francos_full[d] + francos_part[d] < cap_francos,
        PENALIZACION_FRANCO * (2 * francos_full[d] + francos_part[d]),
        sesgo,
        aperturaSoloAux
      )
    );
  }

  // R4 "franco y medio franco corridos": dimensión extra de "obligación de
  // adyacencia" que exige que el día de 5h (medio franco, item 2) sea
  // contiguo al franco. Con la regla OFF, nOblig=1 y el estado colapsa
  // exactamente al DP histórico (mismos resultados, mismos tiempos).
  //   oblig 0 = sin obligación pendiente
  //   oblig 1 = FORCE_MEDIO (ayer se puso el franco → hoy debe ir el 5h)
  //   oblig 2 = FORCE_FRANCO (ayer se puso el 5h → hoy debe ir el franco)
  const nOblig = francoMedioCorridos ? 3 : 1;
  const SB = NUM_ESTADOS_FULL;   // estados base (sin oblig)
  const S = SB * nOblig;

  let cur = new Float64Array(S).fill(-Infinity);
  for (const cnt of COMPOSICIONES_FULL) cur[cnt] = 0; // oblig=0, finB=0, franco=0, mañanas=0

  const eleccion = new Int32Array(7 * S).fill(-1);
  const previo = new Int32Array(7 * S);

  for (let d = 0; d < 7; d++) {
    const next = new Float64Array(S).fill(-Infinity);
    const cands = cands_por_dia[d];
    const base = d * S;
    for (let oblig = 0; oblig < nOblig; oblig++) {
      for (let finB = 0; finB < 7; finB++) {
        for (let fu = 0; fu < 2; fu++) {
          for (let man = 0; man < 3; man++) {
            const pref = oblig * SB + ((finB * 2 + fu) * 3 + man) * CNT_FULL;
            for (let cnt = 0; cnt < CNT_FULL; cnt++) {
              const u = cur[pref + cnt];
              if (u === -Infinity) continue;
              for (let ci = 0; ci < cands.length; ci++) {
                const c = cands[ci];

                // Adyacencia franco↔medio (sólo si la regla está activa).
                let obligNuevo = 0;
                if (nOblig > 1) {
                  const tipoPar = c.item === -1 ? 2 : c.item === 2 ? 1 : 0; // 2=franco, 1=medio, 0=otro
                  if (oblig === 1) {          // se debe poner el 5h HOY
                    if (tipoPar !== 1) continue;
                  } else if (oblig === 2) {   // se debe poner el franco HOY
                    if (tipoPar !== 2) continue;
                  } else {                    // sin obligación
                    if (tipoPar === 2) obligNuevo = 1;       // franco hoy → 5h mañana
                    else if (tipoPar === 1) obligNuevo = 2;  // 5h hoy → franco mañana
                  }
                }

                let nsBase: number;
                if (c.item === -1) {
                  if (fu === 1) continue;
                  nsBase = (3 + man) * CNT_FULL + cnt; // finB=0, fu=1
                } else {
                  if (finB !== 0 && c.inicio < finB - 1) continue; // H-D1
                  if (!TIENE_ITEM[c.item][cnt]) continue;
                  const man2 = c.es_manana && man < 2 ? man + 1 : man;
                  nsBase = ((c.finB * 2 + fu) * 3 + man2) * CNT_FULL + (cnt - PASO_ITEM[c.item]);
                }
                const ns = obligNuevo * SB + nsBase;
                const v = u + c.util;
                if (v > next[ns]) {
                  next[ns] = v;
                  eleccion[base + ns] = ci;
                  previo[base + ns] = pref + cnt;
                }
              }
            }
          }
        }
      }
    }
    cur = next;
  }

  // Estados finales: composición agotada (cnt=0), 1 franco, ≥2 mañanas
  // corridas y SIN obligación de adyacencia pendiente (oblig=0).
  let mejor_s = -1;
  let mejor_u = -Infinity;
  for (let finB = 0; finB < 7; finB++) {
    const s = ((finB * 2 + 1) * 3 + 2) * CNT_FULL; // oblig=0 implícito (0*SB)
    if (cur[s] > mejor_u) {
      mejor_u = cur[s];
      mejor_s = s;
    }
  }
  if (mejor_s < 0) return null;

  return reconstruirSemana(colab, mejor_s, S, eleccion, previo, cands_por_dia);
}

// ============== DP PART ==============
// Estado PART: s = ((finB·2 + francoUsado)·3 + mañanas)·63 + slotsUsados
// H-P1: slotsUsados ≤ 62 (31h). Las duraciones 8..12 garantizan H-P5.

const MAX_SLOTS_PART = 62;
const NUM_ESTADOS_PART = 7 * 2 * 3 * (MAX_SLOTS_PART + 1); // 2646

function optimizarSemanaPart(
  colab: Colaborador,
  pre: number[][],
  francos_full: number[],
  francos_part: number[],
  excepciones: ExcepcionSemanal[],
  sesgo: SesgoTurno,
  cap_francos: number
): Jornada[] | null {
  const cands_por_dia: Candidato[][] = [];
  for (let d = 0; d < 7; d++) {
    cands_por_dia.push(
      candidatosDiaPart(
        colab,
        d as DiaSemana,
        pre,
        excepciones,
        francos_full[d] + francos_part[d] < cap_francos,
        PENALIZACION_FRANCO * (2 * francos_full[d] + francos_part[d]),
        sesgo
      )
    );
  }

  const S = NUM_ESTADOS_PART;
  const USADOS = MAX_SLOTS_PART + 1;
  let cur = new Float64Array(S).fill(-Infinity);
  cur[0] = 0;

  const eleccion = new Int32Array(7 * S).fill(-1);
  const previo = new Int32Array(7 * S);

  for (let d = 0; d < 7; d++) {
    const next = new Float64Array(S).fill(-Infinity);
    const cands = cands_por_dia[d];
    const base = d * S;
    for (let finB = 0; finB < 7; finB++) {
      for (let fu = 0; fu < 2; fu++) {
        for (let man = 0; man < 3; man++) {
          const pref = ((finB * 2 + fu) * 3 + man) * USADOS;
          for (let usados = 0; usados <= MAX_SLOTS_PART; usados++) {
            const u = cur[pref + usados];
            if (u === -Infinity) continue;
            for (let ci = 0; ci < cands.length; ci++) {
              const c = cands[ci];
              let ns: number;
              if (c.item === -1) {
                if (fu === 1) continue;
                ns = (3 + man) * USADOS + usados; // finB=0, fu=1
              } else {
                if (finB !== 0 && c.inicio < finB - 1) continue; // H-D1
                const usados2 = usados + c.item;
                if (usados2 > MAX_SLOTS_PART) continue; // H-P1
                const man2 = c.es_manana && man < 2 ? man + 1 : man;
                ns = ((c.finB * 2 + fu) * 3 + man2) * USADOS + usados2;
              }
              const v = u + c.util;
              if (v > next[ns]) {
                next[ns] = v;
                eleccion[base + ns] = ci;
                previo[base + ns] = pref + usados;
              }
            }
          }
        }
      }
    }
    cur = next;
  }

  // Estados finales: 1 franco, ≥2 mañanas, cualquier total de horas ≤ 31
  let mejor_s = -1;
  let mejor_u = -Infinity;
  for (let finB = 0; finB < 7; finB++) {
    for (let usados = 0; usados <= MAX_SLOTS_PART; usados++) {
      const s = ((finB * 2 + 1) * 3 + 2) * USADOS + usados;
      if (cur[s] > mejor_u) {
        mejor_u = cur[s];
        mejor_s = s;
      }
    }
  }
  if (mejor_s < 0) return null;

  return reconstruirSemana(colab, mejor_s, S, eleccion, previo, cands_por_dia);
}

// ============== RECONSTRUCCIÓN ==============

function reconstruirSemana(
  colab: Colaborador,
  estado_final: number,
  num_estados: number,
  eleccion: Int32Array,
  previo: Int32Array,
  cands_por_dia: Candidato[][]
): Jornada[] {
  const semana: Jornada[] = new Array(7);
  let s = estado_final;
  for (let d = 6; d >= 0; d--) {
    const k = d * num_estados + s;
    const c = cands_por_dia[d][eleccion[k]];
    semana[d] = {
      colab_id: colab.id,
      dia: d as DiaSemana,
      bloques: c.bloques.map(b => ({ ...b })),
    };
    s = previo[k];
  }
  return semana;
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
