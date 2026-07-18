// src/algoritmo/adapter.ts
// Capa de conversión entre los tipos de la UI (algoritmo viejo) y el algoritmo v2.
// Responsabilidad: traducir ida y vuelta sin que la UI necesite conocer el formato v2.

import type {
  Franja,
  Colaborador as ColaboradorUI,
  Auxiliar,
  Eventual,
  ExcepcionSemanal,
  ResultadoAsignacion,
  HorarioColaborador,
  JornadaAsignada,
  AsignacionCajaColaborador,
} from '../types';
import { HORAS_FRANJAS } from '../types';

import type {
  InputAlgoritmo,
  ResultadoSemanal,
  AsignacionAux,
  AsignacionEv,
  Jornada as JornadaV2,
  Colaborador as ColaboradorV2,
  MatrizPresencia,
  MatrizDisponibilidad,
  SesgoTurno,
} from './types';

// ==================== HELPERS ====================

/** Convierte slot index a "H:MM" (slot 0 = "8:00", slot 1 = "8:30", slot 16 = "16:00") */
function slotAHora(slot: number): string {
  return `${8 + Math.floor(slot / 2)}:${slot % 2 === 0 ? '00' : '30'}`;
}

/** Convierte nombre a id determinístico: "Carlos Paz" → "carlos_paz" */
export function normalizarId(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

/** Convierte "HH:MM" a slot index (0 = 08:00). */
function horaStrASlot(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h - 8) * 2 + (m >= 30 ? 1 : 0);
}

/**
 * Parsea un string de horario como "08:00-16:00" o "08:00-13:00|19:00-23:00"
 * en pares [slot_inicio, slot_fin).
 */
function parsearRangos(horarioStr: string): Array<[number, number]> {
  if (!horarioStr || horarioStr.trim() === '') return [];
  return horarioStr.split('|').map(rango => {
    const partes = rango.trim().split('-');
    return [horaStrASlot(partes[0]), horaStrASlot(partes[1])] as [number, number];
  });
}

function construirMatrizAux(horarioSemanal: string[]): MatrizPresencia {
  const matriz: MatrizPresencia = Array.from({ length: 7 }, () =>
    Array(30).fill('NO_PRESENTE' as AsignacionAux)
  );
  for (let dia = 0; dia < 7; dia++) {
    for (const [inicio, fin] of parsearRangos(horarioSemanal[dia] ?? '')) {
      for (let s = Math.max(0, inicio); s < Math.min(30, fin); s++) {
        matriz[dia][s] = 'PARADO';
      }
    }
  }
  return matriz;
}

function construirMatrizEventual(horarioSemanal: string[]): MatrizDisponibilidad {
  const matriz: MatrizDisponibilidad = Array.from({ length: 7 }, () =>
    Array(30).fill('NO_DISPONIBLE' as AsignacionEv)
  );
  for (let dia = 0; dia < 7; dia++) {
    for (const [inicio, fin] of parsearRangos(horarioSemanal[dia] ?? '')) {
      for (let s = Math.max(0, inicio); s < Math.min(30, fin); s++) {
        matriz[dia][s] = 'NO_USADO';
      }
    }
  }
  return matriz;
}

// ==================== INPUT: UI → V2 ====================

/**
 * Convierte los datos de entrada de la UI al formato InputAlgoritmo del v2.
 * - cajeros: solo FULL y PART se incluyen en colaboradores v2 (los AUX se ignoran
 *   porque su info de horario viene de auxiliares[]).
 * - auxiliares: aportan presencia_aux y rol AUX.
 * - eventuales: aportan disponibilidad_eventual y rol EVENTUAL.
 */
/**
 * Opciones de generación provenientes de las capacidades configurables:
 * preferencias blandas (rotación + aprendizaje, keyed por NOMBRE), mínimos de
 * cajeros por franja (reglas del local) y tope de francos por día.
 */
export interface OpcionesGeneracion {
  preferenciasPorNombre?: Record<string, Partial<SesgoTurno>>;
  demandaMinima?: Array<{ dia: number; slotDesde: number; slotHasta: number; cantidad: number }>;
  maxFrancosDia?: number;
}

export function convertirInputAV2(
  necesidad: Franja[],
  cajeros: ColaboradorUI[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  excepciones: ExcepcionSemanal[],
  opciones?: OpcionesGeneracion
): InputAlgoritmo {
  // 1. Demanda 7×30
  const demanda: number[][] = Array.from({ length: 7 }, () => Array(30).fill(0));
  for (const franja of necesidad) {
    const [h, m] = franja.hora.split(':').map(Number);
    if (h < 8) continue; // franjas antes del inicio de operaciones
    const slot = (h - 8) * 2 + (m >= 30 ? 1 : 0);
    if (slot < 0 || slot >= 30) continue;
    for (let dia = 0; dia < 7; dia++) {
      demanda[dia][slot] = franja.necesidad[dia] ?? 0;
    }
  }

  // 1b. Reglas del local "mínimo N cajeros en franja": elevan la demanda
  // efectiva; el algoritmo prioriza cubrirlas con la capacidad disponible.
  for (const min of opciones?.demandaMinima ?? []) {
    const dias = min.dia >= 0 ? [min.dia] : [0, 1, 2, 3, 4, 5, 6];
    for (const dia of dias) {
      for (let s = Math.max(0, min.slotDesde); s < Math.min(30, min.slotHasta); s++) {
        demanda[dia][s] = Math.max(demanda[dia][s], min.cantidad);
      }
    }
  }

  // 2. Colaboradores v2: solo FULL y PART desde cajeros
  const colaboradores: ColaboradorV2[] = [];
  for (const c of cajeros) {
    if (c.tipo === 'FULL' || c.tipo === 'PART') {
      colaboradores.push({ id: normalizarId(c.nombre), nombre: c.nombre, rol: c.tipo });
    }
  }

  // 3. AUX desde auxiliares (activos)
  const presencia_aux: Record<string, MatrizPresencia> = {};
  for (const aux of auxiliares) {
    if (!aux.activo) continue;
    const auxId = normalizarId(aux.nombre);
    colaboradores.push({ id: auxId, nombre: aux.nombre, rol: 'AUX' });
    presencia_aux[auxId] = construirMatrizAux(aux.horarioSemanal);
  }

  // 4. EVENTUAL desde eventuales (activos)
  const disponibilidad_eventual: Record<string, MatrizDisponibilidad> = {};
  for (const ev of eventuales) {
    if (!ev.activo) continue;
    const evId = normalizarId(ev.nombre);
    colaboradores.push({ id: evId, nombre: ev.nombre, rol: 'EVENTUAL' });
    disponibilidad_eventual[evId] = construirMatrizEventual(ev.horarioSemanal);
  }

  // 5. Preferencias blandas: nombre → id v2
  let preferencias_turno: InputAlgoritmo['preferencias_turno'];
  if (opciones?.preferenciasPorNombre) {
    preferencias_turno = {};
    for (const [nombre, sesgo] of Object.entries(opciones.preferenciasPorNombre)) {
      preferencias_turno[normalizarId(nombre)] = sesgo;
    }
  }

  return {
    demanda,
    colaboradores,
    presencia_aux,
    disponibilidad_eventual,
    excepciones,
    preferencias_turno,
    max_francos_dia: opciones?.maxFrancosDia,
  };
}

// ==================== OUTPUT: V2 → UI ====================

/**
 * Convierte el ResultadoSemanal del v2 al ResultadoAsignacion que espera la UI.
 * Solo incluye FULL y PART en horarios[]; AUX y EVENTUAL impactan las métricas de franja.
 */
export function convertirOutputDeV2(
  resultado: ResultadoSemanal,
  cajeros: ColaboradorUI[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[]
): ResultadoAsignacion {
  // Mapeo v2Id → UI id (para restaurar IDs numéricos originales)
  const idMap: Record<string, string> = {};
  for (const c of cajeros) idMap[normalizarId(c.nombre)] = c.id;
  for (const a of auxiliares) idMap[normalizarId(a.nombre)] = a.id;
  for (const e of eventuales) idMap[normalizarId(e.nombre)] = e.id;

  // Construir HorarioColaborador[] con FULL y PART
  const horarios: HorarioColaborador[] = [];

  const entradas: Array<[Record<string, JornadaV2[]>, 'cajero']> = [
    [resultado.jornadas_full, 'cajero'],
    [resultado.jornadas_part, 'cajero'],
  ];

  for (const [jornadasMap, rolGeneral] of entradas) {
    for (const [v2Id, jornadas] of Object.entries(jornadasMap)) {
      const uiId = idMap[v2Id] ?? v2Id;
      const jornadasOrdenadas = [...jornadas].sort((a, b) => a.dia - b.dia);

      const jornadasAsignadas: JornadaAsignada[] = jornadasOrdenadas.map(j => {
        const esFranco = j.bloques.length === 0;
        const horas = j.bloques.reduce((sum, b) => sum + (b.slot_fin - b.slot_inicio) / 2, 0);
        const turnos = j.bloques.map(b => ({
          inicio: slotAHora(b.slot_inicio),
          fin: slotAHora(b.slot_fin),
        }));
        return {
          dia: j.dia,
          turnos,
          horas,
          esFranco,
          rol: esFranco ? 'franco' : 'cajero',
        };
      });

      horarios.push({
        colaboradorId: uiId,
        jornadas: jornadasAsignadas,
        totalHoras: jornadasAsignadas.reduce((s, j) => s + j.horas, 0),
        errores: [],
        rolGeneral,
      });
    }
  }

  // Filas AUX y EVENTUAL en horarios[]: permiten verlas y EDITARLAS en la UI
  // (Último horario / resultado) igual que a los cajeros.
  //  - AUX: su jornada es toda la presencia (PARADO y CAJA son trabajo).
  //  - EVENTUAL: su jornada son los bloques en CAJA (el resto trabaja en su sector).
  const jornadasDesdeMatriz = (
    matriz: string[][],
    esTrabajo: (estado: string) => boolean,
    rolTrabajo: JornadaAsignada['rol']
  ): JornadaAsignada[] =>
    Array.from({ length: 7 }, (_, dia) => {
      const turnos: { inicio: string; fin: string }[] = [];
      let inicio = -1;
      for (let s = 0; s <= 30; s++) {
        const activo = s < 30 && esTrabajo(matriz[dia][s]);
        if (activo && inicio === -1) inicio = s;
        else if (!activo && inicio !== -1) {
          turnos.push({ inicio: slotAHora(inicio), fin: slotAHora(s) });
          inicio = -1;
        }
      }
      const horas = turnos.reduce((sum, t) => {
        const [hi, mi] = t.inicio.split(':').map(Number);
        const [hf, mf] = t.fin.split(':').map(Number);
        return sum + (hf * 60 + mf - hi * 60 - mi) / 60;
      }, 0);
      const esFranco = turnos.length === 0;
      return { dia, turnos, horas, esFranco, rol: esFranco ? ('franco' as const) : rolTrabajo };
    });

  for (const [v2Id, matriz] of Object.entries(resultado.asignacion_aux)) {
    const jornadas = jornadasDesdeMatriz(matriz, e => e !== 'NO_PRESENTE', 'aux_supervisor');
    horarios.push({
      colaboradorId: idMap[v2Id] ?? v2Id,
      jornadas,
      totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
      errores: [],
      rolGeneral: 'aux_supervisor',
    });
  }
  for (const [v2Id, matriz] of Object.entries(resultado.asignacion_eventual)) {
    const jornadas = jornadasDesdeMatriz(matriz, e => e === 'CAJA', 'eventual_sector');
    horarios.push({
      colaboradorId: idMap[v2Id] ?? v2Id,
      jornadas,
      totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
      errores: [],
      rolGeneral: 'eventual_sector',
    });
  }

  // Cobertura real por slot [dia][slot]
  const coberturaSlot: number[][] = Array.from({ length: 7 }, () => Array(30).fill(0));

  for (const jornadas of [...Object.values(resultado.jornadas_full), ...Object.values(resultado.jornadas_part)]) {
    for (const j of jornadas) {
      for (const b of j.bloques) {
        for (let s = b.slot_inicio; s < b.slot_fin && s < 30; s++) {
          if (s >= 0) coberturaSlot[j.dia][s]++;
        }
      }
    }
  }
  for (const matriz of Object.values(resultado.asignacion_aux)) {
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 0; slot < 30; slot++) {
        if (matriz[dia][slot] === 'CAJA') coberturaSlot[dia][slot]++;
      }
    }
  }
  for (const matriz of Object.values(resultado.asignacion_eventual)) {
    for (let dia = 0; dia < 7; dia++) {
      for (let slot = 0; slot < 30; slot++) {
        if (matriz[dia][slot] === 'CAJA') coberturaSlot[dia][slot]++;
      }
    }
  }

  // Mapear HORAS_FRANJAS → coberturaFranjas y faltantesFranjas
  const numFranjas = HORAS_FRANJAS.length;
  const coberturaFranjas: number[][] = Array.from({ length: numFranjas }, () => Array(7).fill(0));
  const faltantesFranjas: number[][] = Array.from({ length: numFranjas }, () => Array(7).fill(0));

  for (let fi = 0; fi < numFranjas; fi++) {
    const hora = HORAS_FRANJAS[fi];
    const [h, m] = hora.split(':').map(Number);
    if (h < 8) continue; // 07:00 y 07:30 estan fuera de la grilla v2
    const slot = (h - 8) * 2 + (m >= 30 ? 1 : 0);
    if (slot < 0 || slot >= 30) continue;

    for (let dia = 0; dia < 7; dia++) {
      coberturaFranjas[fi][dia] = coberturaSlot[dia][slot];
      faltantesFranjas[fi][dia] = Math.max(0, resultado.metricas.deficit_por_slot[dia][slot]);
    }
  }

  // Horarios de CAJA de AUX y EVENTUAL (Pasadas 2 y 3) para el PDF.
  // Mapa v2Id → nombre legible.
  const nombreMap: Record<string, string> = {};
  for (const c of cajeros) nombreMap[normalizarId(c.nombre)] = c.nombre;
  for (const a of auxiliares) nombreMap[normalizarId(a.nombre)] = a.nombre;
  for (const e of eventuales) nombreMap[normalizarId(e.nombre)] = e.nombre;

  const cajaAux: AsignacionCajaColaborador[] = Object.entries(resultado.asignacion_aux)
    .map(([v2Id, matriz]) => ({
      colaboradorId: idMap[v2Id] ?? v2Id,
      nombre: nombreMap[v2Id] ?? v2Id,
      slotsCajaPorDia: matriz.map(fila => fila.map(estado => estado === 'CAJA')),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const cajaEventual: AsignacionCajaColaborador[] = Object.entries(resultado.asignacion_eventual)
    .map(([v2Id, matriz]) => ({
      colaboradorId: idMap[v2Id] ?? v2Id,
      nombre: nombreMap[v2Id] ?? v2Id,
      slotsCajaPorDia: matriz.map(fila => fila.map(estado => estado === 'CAJA')),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Alertas desde el reporte de reglas
  const alertas: string[] = [
    ...resultado.reporte_reglas.advertencias,
    ...resultado.reporte_reglas.violaciones.map(v =>
      v.colab_id ? `${v.regla} (${v.colab_id}): ${v.detalle}` : `${v.regla}: ${v.detalle}`
    ),
  ];

  return {
    horarios,
    coberturaFranjas,
    faltantesFranjas,
    alertas,
    porcentajeCobertura: resultado.metricas.cobertura_total_pct,
    cajaAux,
    cajaEventual,
  };
}
