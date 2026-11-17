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
import { estadoObjetivoHoras, type ContratoSlots, type CumplimientoHoras } from "./contratos";
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
  /** #7: objetivo vs horas asignadas por PART (y FULL), con motivo si no se cumple. */
  cumplimiento_horas?: CumplimientoHoras[];
}

const PESO_SUPERAVIT = 0.5;   // cubrir de más cuesta la mitad de lo que rinde cubrir déficit
const PENALIZACION_FRANCO = 30; // por franco ya existente ese día (reparto suave, H-FR1 es dura)
const MAX_PASADAS = 8;
const PRESUPUESTO_MS = 6000;
const SESGO_MAX = 12; // tope del sesgo blando por jornada: desempata, no manda
// #7: cada media hora que falte para el objetivo de horas del contrato PART pesa
// más que cualquier ganancia de cobertura de una jornada → prioridad lexicográfica:
// primero cumplir las horas pactadas (si las reglas lo permiten), luego cobertura.
const PENALIZACION_HORA_FALTANTE = 1000;
/** Tope histórico del motor (31 h) cuando no llega contrato por persona (llamadas directas). */
export const MAX_SLOTS_PART_HISTORICO = 62;

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
        patron: sd.patron,
        trabajo: clampSesgo(sd.trabajo),
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
  const patron = sd?.patron;
  let delta = 0;
  if (patron) {
    for (let slot = 0; slot < 30; slot++) {
      const en = (periodos: Bloque[]) => periodos.some(b => b.slot_inicio <= slot && slot < b.slot_fin);
      delta += Number(en(patron) !== en(bloques));
    }
  }
  // La preferencia guía la búsqueda. La aceptación compara cobertura y horas antes del ciclo.
  const forma = -delta * SESGO_MAX / 30;
  if (bloques.length === 0) return (sd?.franco ?? 0) + forma;
  const fin = bloques[bloques.length - 1].slot_fin;
  const esManana = bloques.length === 1 && bloques[0].slot_inicio >= 2 && bloques[0].slot_inicio <= 6;
  let s: number;
  if (fin >= 28) s = sesgo.cierre + (sd?.cierre ?? 0);
  else if (esManana) s = sesgo.manana + (sd?.manana ?? 0);
  else s = sesgo.tarde + (sd?.tarde ?? 0);
  return s + forma + (sd?.trabajo ?? 0);
}

// ============== FUNCIÓN PRINCIPAL ==============

export function ejecutarPasada1(input: InputAlgoritmo, reoptimizar = true): ResultadoPasada1 {
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
  // #38: default del negocio = ON (DEFAULTS_OPERATIVOS.apertura_solo_aux).
  const aperturaSoloAux = input.apertura_solo_aux ?? true;
  // OFF: la apertura 08:00–09:00 la debe abrir un cajero FULL/PART (no AUX ni
  // eventual). Se refuerza el peso de esos slots para que la optimización la
  // cubra con las jornadas que el catálogo vigente permite (cortadas FULL).
  const pesosEfectivos = aperturaSoloAux ? pesos : reforzarApertura(pesos);
  const francoMedioCorridos = input.franco_medio_corridos ?? false;

  const cobertura: number[][] = Array.from({ length: 7 }, () => new Array(30).fill(0));
  const francos_full: number[] = new Array(7).fill(0);
  const francos_part: number[] = new Array(7).fill(0);

  // FULLs primero (más restricciones estructurales), luego PARTs
  const orden: Colaborador[] = [...fulls, ...parts];
  const semanas = new Map<string, Jornada[] | null>();
  // #7 · AH2-020: penalización experimental (offline) y semillas del multi-arranque.
  const PEN_HORA = input.experimental?.penalizacionHoraFaltante ?? PENALIZACION_HORA_FALTANTE;
  for (const colab of orden) {
    const semilla = input.semillas?.[colab.id];
    if (!semilla) continue;
    const minimoLunes = input.inicio_minimo_lunes_por_colaborador?.[colab.id] ?? 0;
    if (semilla.some(j => j.dia === 0 && j.bloques.length > 0 && j.bloques[0].slot_inicio < minimoLunes)) continue;
    aplicarSemana(semilla, cobertura, francos_full, francos_part, colab.rol === "FULL");
    semanas.set(colab.id, semilla);
  }

  const t0 = Date.now();
  for (let pasada = 0; reoptimizar && pasada < MAX_PASADAS; pasada++) {
    let cambios = 0;
    for (const colab of orden) {
      if (pasada > 0 && Date.now() - t0 > PRESUPUESTO_MS) break;
      const es_full = colab.rol === "FULL";
      const sesgo = normalizarSesgo(input.preferencias_turno?.[colab.id]);
      const previa = semanas.get(colab.id) ?? null;

      // Quitar la semana previa: el colaborador se re-optimiza contra
      // la demanda residual que dejan todos los demás.
      if (previa) quitarSemana(previa, cobertura, francos_full, francos_part, es_full);

      const pre = prefijosUtilidad(demanda, cobertura, pesosEfectivos);
      const contrato = contratoPart(input, colab.id);
      const nueva = es_full
        ? optimizarSemanaFull(colab, pre, francos_full, francos_part, excepciones, sesgo, cap_francos, aperturaSoloAux, francoMedioCorridos, input.inicio_minimo_lunes_por_colaborador?.[colab.id] ?? 0)
        : optimizarSemanaPart(colab, pre, francos_full, francos_part, excepciones, sesgo, cap_francos, contrato, PEN_HORA, input.inicio_minimo_lunes_por_colaborador?.[colab.id] ?? 0);
      const penal = (sem: Jornada[]) => (es_full ? 0 : penalizacionHoras(sem, contrato, PEN_HORA));

      let elegida: Jornada[] | null = previa;
      if (nueva) {
        if (
          !previa ||
          utilidadSemana(nueva, pre, francos_full, francos_part, sesgo) - penal(nueva) >
            utilidadSemana(previa, pre, francos_full, francos_part, sesgo) - penal(previa) + 1e-6
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

  // #7: cumplimiento de horas por contrato. Si un PART no llega a su objetivo,
  // se calcula cuántas horas permiten SUS reglas (sin mirar cobertura) para
  // explicar el motivo: restricciones de la persona/contrato o competencia.
  const cumplimiento_horas: CumplimientoHoras[] = [];
  for (const c of fulls) {
    const sem = jornadas_full[c.id];
    const asignadas = slotsSemana(sem) / 2;
    cumplimiento_horas.push({
      colab_id: c.id, nombre: c.nombre, tipo: "FULL", objetivoHoras: 48, maximoHoras: 48, asignadasHoras: asignadas,
      diferenciaHoras: 48 - asignadas, estadoObjetivo: estadoObjetivoHoras(48, asignadas),
      motivo: sem.length ? undefined : "Sin semana válida con las restricciones de la persona (composición FULL 48 h).",
    });
  }
  const ceros = Array.from({ length: 7 }, () => new Array(31).fill(0));
  for (const c of parts) {
    const contrato = contratoPart(input, c.id);
    const sem = jornadas_part[c.id];
    const asignadas = slotsSemana(sem) / 2;
    const objetivo = contrato.objetivoSlots === null ? null : contrato.objetivoSlots / 2;
    const fila: CumplimientoHoras = {
      colab_id: c.id, nombre: c.nombre, tipo: "PART", estadoFicha: contrato.estadoFicha,
      objetivoHoras: objetivo, maximoHoras: contrato.maximoSlots / 2,
      asignadasHoras: asignadas, diferenciaHoras: objetivo === null ? null : objetivo - asignadas,
    };
    if (objetivo === null) {
      fila.motivo = contrato.estadoFicha === "invalida"
        ? "La ficha informa un valor de horas no válido: se planificó sin objetivo de horas."
        : "La ficha no informa horas semanales: se planificó sin objetivo de horas.";
    } else if (fila.diferenciaHoras! > 0) {
      // AH2-020: cota individual exacta (demanda 0, sin francos de otros, tope de francos relajado).
      const cota = optimizarSemanaPart(c, ceros, new Array(7).fill(0), new Array(7).fill(0), excepciones, SESGO_NEUTRO, 7, contrato);
      fila.cotaHoras = cota ? slotsSemana(cota) / 2 : 0;
      // Máximo alcanzable por reglas: misma DP con utilidad de cobertura nula.
      const otros_ff = [...francos_full];
      const otros_fp = [...francos_part];
      for (const j of sem) if (j.bloques.length === 0) otros_fp[j.dia] -= 1;
      const maxima = optimizarSemanaPart(c, ceros, otros_ff, otros_fp, excepciones, SESGO_NEUTRO, cap_francos, contrato);
      fila.factibleHoras = maxima ? slotsSemana(maxima) / 2 : 0;
      const propias = excepciones.filter(x => x.colaboradorNombre === c.nombre).map(x => x.descripcion || x.tipo);
      fila.motivo = !maxima
        ? "No existe ninguna semana PART válida con sus restricciones (franco, ≥2 mañanas, 4–6 h por día, descanso 12 h)."
        : fila.factibleHoras < objetivo
          ? `Sus reglas permiten como máximo ${fila.factibleHoras} h esta semana (jornadas de 4–6 h, 1 franco, ≥2 mañanas, descanso 12 h${propias.length ? `; reglas propias: ${propias.join(", ")}` : ""}${cap_francos ? `; tope de ${cap_francos} francos por día` : ""}).`
          : "El motor no alcanzó el objetivo aunque las reglas lo permiten (límite de tiempo de optimización).";
    }
    fila.estadoObjetivo = estadoObjetivoHoras(objetivo, asignadas, fila.cotaHoras);
    cumplimiento_horas.push(fila);
  }

  return { jornadas_full, jornadas_part, deficit_1, infactibles, cumplimiento_horas };
}

function slotsSemana(semana: Jornada[] | undefined): number {
  return (semana ?? []).reduce((n, j) => n + j.bloques.reduce((m, b) => m + b.slot_fin - b.slot_inicio, 0), 0);
}

/** Contrato PART en slots: el informado por persona o el tope histórico (31 h). */
function contratoPart(input: InputAlgoritmo, id: string): ContratoSlots {
  return input.contratos?.[id] ?? { objetivoSlots: MAX_SLOTS_PART_HISTORICO, maximoSlots: MAX_SLOTS_PART_HISTORICO };
}

function penalizacionHoras(semana: Jornada[], contrato: ContratoSlots, pen = PENALIZACION_HORA_FALTANTE): number {
  if (contrato.objetivoSlots === null) return 0; // sin objetivo válido en la ficha: no se fuerzan horas
  return pen * Math.max(0, Math.min(contrato.objetivoSlots, contrato.maximoSlots) - slotsSemana(semana));
}

/** Peso de los slots de apertura cuando la abre un cajero (apertura_solo_aux OFF). */
export const PESO_APERTURA_CAJERO = 8;
function reforzarApertura(pesos?: number[]): number[] {
  const out = Array.from({ length: 30 }, (_, s) => pesos?.[s] ?? 1);
  out[0] *= PESO_APERTURA_CAJERO;
  out[1] *= PESO_APERTURA_CAJERO;
  return out;
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
  finB: number;        // bucket del fin: 0 = franco, 1 = fin ≤ 24, k = fin-23 para fin 25..30
  util: number;
  es_manana: boolean;  // corrida con inicio 09:00-11:00
  item: number;        // FULL: índice de ítem; PART: duración en slots; -1 = franco
}

// H-D1: el slot s empieza a las 08:00 + 30·s; de 23:00 (slot 30) a 08:00 hay 9 h = 18 slots.
// descanso = (30 - fin_prev) + 18 + inicio_sig ≥ 24  ⟺  inicio_sig ≥ fin_prev - 24.
// (Antes se contaban 19 slots nocturnos y se aceptaban descansos de 11,5 h: ver #10.)
// Como fin_prev ≤ 30, solo importan los fines 25..30 → bucket finB = max(fin,24) - 23.
// La transición es válida si finB_prev = 0 (franco) o inicio ≥ finB_prev - 1.
const NUM_BUCKETS_FIN = 8; // 0 = franco, 1 = fin ≤ 24, 2..7 = fin 25..30
function bucketFin(fin: number): number {
  return fin <= 24 ? 1 : fin - 23;
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
const NUM_ESTADOS_FULL = NUM_BUCKETS_FIN * 2 * 3 * CNT_FULL; // 10368

function optimizarSemanaFull(
  colab: Colaborador,
  pre: number[][],
  francos_full: number[],
  francos_part: number[],
  excepciones: ExcepcionSemanal[],
  sesgo: SesgoTurno,
  cap_francos: number,
  aperturaSoloAux: boolean,
  francoMedioCorridos: boolean,
  inicioMinimoLunes = 0,
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
      ).filter(c => d !== 0 || c.item === -1 || c.inicio >= inicioMinimoLunes)
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
      for (let finB = 0; finB < NUM_BUCKETS_FIN; finB++) {
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
  for (let finB = 0; finB < NUM_BUCKETS_FIN; finB++) {
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
// Estado PART: s = ((finB·2 + francoUsado)·3 + mañanas)·(max+1) + slotsUsados
// H-P1: slotsUsados ≤ tope del contrato (#7: objetivo de la ficha, nunca más que
// el máximo del perfil; 62 = 31 h si no llega contrato). Las duraciones 8..12
// garantizan H-P5. Al cerrar la semana se penaliza cada media hora que falte
// para el objetivo (PENALIZACION_HORA_FALTANTE).

function optimizarSemanaPart(
  colab: Colaborador,
  pre: number[][],
  francos_full: number[],
  francos_part: number[],
  excepciones: ExcepcionSemanal[],
  sesgo: SesgoTurno,
  cap_francos: number,
  contrato: ContratoSlots = { objetivoSlots: MAX_SLOTS_PART_HISTORICO, maximoSlots: MAX_SLOTS_PART_HISTORICO },
  penHora: number = PENALIZACION_HORA_FALTANTE,
  inicioMinimoLunes = 0,
): Jornada[] | null {
  const MAX_SLOTS_PART = Math.max(0, Math.floor(contrato.maximoSlots));
  const OBJETIVO = contrato.objetivoSlots === null ? 0 : Math.min(MAX_SLOTS_PART, Math.max(0, Math.floor(contrato.objetivoSlots)));
  const NUM_ESTADOS_PART = NUM_BUCKETS_FIN * 2 * 3 * (MAX_SLOTS_PART + 1);
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
      ).filter(c => d !== 0 || c.item === -1 || c.inicio >= inicioMinimoLunes)
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
    for (let finB = 0; finB < NUM_BUCKETS_FIN; finB++) {
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

  // Estados finales: 1 franco, ≥2 mañanas, total ≤ tope del contrato; se elige
  // la mejor utilidad descontando las medias horas que falten para el objetivo.
  let mejor_s = -1;
  let mejor_u = -Infinity;
  for (let finB = 0; finB < NUM_BUCKETS_FIN; finB++) {
    for (let usados = 0; usados <= MAX_SLOTS_PART; usados++) {
      const s = ((finB * 2 + 1) * 3 + 2) * USADOS + usados;
      if (cur[s] === -Infinity) continue;
      const v = cur[s] - penHora * Math.max(0, OBJETIVO - usados);
      if (v > mejor_u) {
        mejor_u = v;
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

/** Desplazamientos de media hora del último bloque, construidos con los catálogos vigentes. */
export function* desplazamientosCierre(
  input: InputAlgoritmo, semanas: Record<string, Jornada[]>, deficit: number[][], limite: number,
): Generator<Jornada> {
  const pre = Array.from({ length: 7 }, () => Array<number>(31).fill(0));
  for (const colab of input.colaboradores) {
    if (colab.rol !== "FULL" && colab.rol !== "PART") continue;
    const sesgo = normalizarSesgo(input.preferencias_turno?.[colab.id]);
    for (const jornada of semanas[colab.id] ?? []) {
      const { dia, bloques } = jornada;
      const ultimo = bloques[bloques.length - 1];
      if (!ultimo || ultimo.slot_fin < limite || !deficit[dia][ultimo.slot_fin]) continue;
      // La mañana, el franco, la duración y la composición se conservan.
      if (bloques.length === 1 && ultimo.slot_inicio <= 6) continue;
      const excepciones = input.excepciones ?? [];
      const catalogo = colab.rol === "FULL"
        ? candidatosDiaFull(colab, dia, pre, excepciones, false, 0, sesgo, input.apertura_solo_aux ?? true)
        : candidatosDiaPart(colab, dia, pre, excepciones, false, 0, sesgo);
      const compatible = catalogo.find(c => c.bloques.length === bloques.length && c.bloques.every((b, i) => {
        const delta = i === bloques.length - 1 ? 1 : 0;
        return b.slot_inicio === bloques[i].slot_inicio + delta && b.slot_fin === bloques[i].slot_fin + delta;
      }));
      if (compatible) yield { ...jornada, bloques: compatible.bloques };
    }
  }
}

/** Vecindad offline: misma duración y composición, en el catálogo de ese día. */
export function* desplazamientosConSobrante(
  input: InputAlgoritmo, semanas: Record<string, Jornada[]>, exceso: number[][],
): Generator<Jornada> {
  const pre = Array.from({ length: 7 }, () => Array<number>(31).fill(0))
  const excepciones = input.excepciones ?? []
  for (const colab of input.colaboradores) {
    if (colab.rol !== 'FULL' && colab.rol !== 'PART') continue
    const sesgo = normalizarSesgo(input.preferencias_turno?.[colab.id])
    for (const jornada of semanas[colab.id] ?? []) {
      const { bloques, dia } = jornada
      if (!bloques.length) continue
      const desplazamientos = [-1, 1].filter(delta => bloques.some(b =>
        exceso[dia][delta === 1 ? b.slot_inicio : b.slot_fin - 1] > 0))
      if (!desplazamientos.length) continue
      const catalogo = colab.rol === 'FULL'
        ? candidatosDiaFull(colab, dia, pre, excepciones, false, 0, sesgo, input.apertura_solo_aux ?? true)
        : candidatosDiaPart(colab, dia, pre, excepciones, false, 0, sesgo)
      for (const delta of desplazamientos) {
        const eraManana = bloques.length === 1 && bloques[0].slot_inicio <= 6
        const vecino = catalogo.find(c => c.es_manana === eraManana && c.bloques.length === bloques.length && c.bloques.every((b, i) =>
          b.slot_inicio === bloques[i].slot_inicio + delta && b.slot_fin === bloques[i].slot_fin + delta))
        if (vecino) yield { ...jornada, bloques: vecino.bloques }
      }
    }
  }
}
