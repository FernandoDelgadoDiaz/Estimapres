// src/algoritmo/orquestador.ts
// Pipeline completo del algoritmo de horarios v2.
// Integra las tres pasadas y produce el ResultadoSemanal final.
// Referencia: ai/architecture.md §6.
// STATUS: placeholder — a implementar después de los Prompts 1, 2 y 3.

import { InputAlgoritmo, ResultadoSemanal } from './types';
import { generarJornadasFullPart } from './pasada1-fullpart';
import { activarAuxiliares } from './pasada2-auxiliares';
import { asignarEventuales } from './pasada3-eventuales';
import { validarReglasFull, validarReglasPart, validarDescanso12h, validarReglasAux, validarReglasEventual } from './reglas';
import { calcularMetricasCobertura } from './validador';

export function ejecutarAlgoritmo(input: InputAlgoritmo): ResultadoSemanal {
  // 1. Pasada 1: FULL + PART
  const { jornadas_full, jornadas_part } = generarJornadasFullPart(input);

  // 2. Pasada 2: AUX
  const { asignacion_aux } = activarAuxiliares(input, jornadas_full, jornadas_part);

  // 3. Pasada 3: EVENTUAL
  const { asignacion_eventual } = asignarEventuales(input, jornadas_full, jornadas_part, asignacion_aux);

  // 4. Validación reglas duras
  const violacionesFull = validarReglasFull(jornadas_full, input.colaboradores.filter(c => c.rol === 'FULL'));
  const violacionesPart = validarReglasPart(jornadas_part, input.colaboradores.filter(c => c.rol === 'PART'));
  const violacionesDescanso = validarDescanso12h({ ...jornadas_full, ...jornadas_part });
  const violacionesAux = validarReglasAux(asignacion_aux, input.presencia_aux);
  const violacionesEv = validarReglasEventual(asignacion_eventual, input.disponibilidad_eventual);

  const todasViolaciones = [
    ...violacionesFull.violaciones,
    ...violacionesPart.violaciones,
    ...violacionesDescanso.violaciones,
    ...violacionesAux.violaciones,
    ...violacionesEv.violaciones,
  ];
  const duras_cumplidas = todasViolaciones.length === 0;

  // 5. Métricas de cobertura
  const metricas = calcularMetricasCobertura(input.demanda, jornadas_full, jornadas_part, asignacion_aux, asignacion_eventual);

  // 6. Construir resultado final
  const resultado: ResultadoSemanal = {
    semana: { desde: new Date(), hasta: new Date() }, // TODO: calcular desde fechas
    jornadas_full,
    jornadas_part,
    asignacion_aux,
    asignacion_eventual,
    metricas,
    reporte_reglas: {
      duras_cumplidas,
      violaciones: todasViolaciones,
      advertencias: [], // TODO: generar advertencias suaves
    },
  };

  return resultado;
}