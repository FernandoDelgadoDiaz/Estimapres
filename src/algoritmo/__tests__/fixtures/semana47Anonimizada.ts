// #38 — Fixture ANONIMIZADO que reproduce la estructura de la semana 16–22/11/2026
// (sucursal 091, versión 3) que figuraba falsamente VALIDADO. No contiene nombres,
// identificadores ni horarios copiados: los patrones son sintéticos y conservan solo
// las propiedades que causaron la falla:
//   - 4 FULL y 5 PART (sin horario fijo: los planifica el motor);
//   - 3 AUX activos con patrones distintos, NO continuos (turnos partidos y franco);
//     cada día hay EXACTAMENTE un AUX presente en la apertura 08:00–09:00;
//   - un eventual disponible desde las 06:00 todos los días salvo el sábado
//     (en la semana real fue el que apareció en caja junto al AUX: cobertura 2/1);
//   - dos eventuales de tarde;
//   - configuración efectiva de la cuenta que generó la semana: apertura_solo_aux ON
//     (valor predeterminado, sin fila), sin_aux_cierre ON (predeterminado),
//     supervisor_jornada_completa ON, franco_medio_corridos OFF.
// La demanda es el POM sintético de referencia (31×7, 406 horas-caja).
import type { Auxiliar, Colaborador, Eventual } from '../../../types'

export const CAJEROS_S47: Colaborador[] = [
  ...['A', 'B', 'C', 'D'].map(l => ({ id: `full-${l}`, nombre: `Full ${l}`, tipo: 'FULL' as const, horasSemanales: 48, activo: true })),
  ...['A', 'B', 'C', 'D', 'E'].map(l => ({ id: `part-${l}`, nombre: `Part ${l}`, tipo: 'PART' as const, horasSemanales: 32, activo: true })),
]

//                         Lun                       Mar                        Mié                        Jue                        Vie            Sáb                        Dom
export const AUX_S47: Auxiliar[] = [
  { id: 'aux-A', nombre: 'Aux A', activo: true, horarioSemanal: ['08:00-14:00|20:00-23:00', '15:00-23:00', '14:00-23:00', '13:00-22:00', '17:00-23:00', '15:00-23:00', ''] },
  { id: 'aux-B', nombre: 'Aux B', activo: true, horarioSemanal: ['15:00-23:00', '11:00-16:00', '08:00-14:00|20:00-23:00', '', '08:00-16:00', '08:00-14:00|19:00-23:00', '14:00-23:00'] },
  { id: 'aux-C', nombre: 'Aux C', activo: true, horarioSemanal: ['11:00-19:00', '08:00-13:00|20:00-23:00', '', '08:00-14:00|20:00-23:00', '14:00-23:00', '11:00-16:00', '08:00-14:00|20:00-22:30'] },
]

export const EVENTUALES_S47: Eventual[] = [
  { id: 'ev-M', nombre: 'Eventual M', sector: 'S1', activo: true, horarioSemanal: ['06:00-14:00', '06:00-14:00', '06:00-14:00', '06:00-14:00', '06:00-14:00', '', '06:00-14:00'] },
  { id: 'ev-T1', nombre: 'Eventual T1', sector: 'S2', activo: true, horarioSemanal: ['15:00-23:00', '14:00-23:00', '', '15:00-23:00', '14:00-23:00', '18:00-23:00', '14:00-23:00'] },
  { id: 'ev-T2', nombre: 'Eventual T2', sector: 'S3', activo: true, horarioSemanal: ['', '14:00-23:00', '14:00-23:00', '14:00-23:00', '18:00-23:00', '15:00-23:00', '15:00-23:00'] },
]

/** AUX presente en la apertura de cada día (lun..dom), según los patrones de arriba. */
export const AUX_APERTURA_S47 = ['aux-A', 'aux-C', 'aux-B', 'aux-C', 'aux-B', 'aux-B', 'aux-C']

/** Configuración operativa efectiva de la cuenta que generó la semana real. */
export const OPERATIVA_S47 = {
  aperturaSoloAux: true,
  sinAuxCierre: true,
  supervisorJornadaCompleta: true,
  francoMedioCorridos: false,
}
