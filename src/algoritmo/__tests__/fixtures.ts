// src/algoritmo/__tests__/fixtures.ts
// Datos de prueba extraídos de un PDF real para validar el algoritmo.
// STATUS: placeholder — a completar con datos reales.

import { MatrizDemanda, Colaborador, AsignacionAux, AsignacionEv } from '../types';

// Demanda semanal (7 días × 30 slots) basada en PDF real
export const DEMANDA_PDF: MatrizDemanda = Array.from({ length: 7 }, () => Array(30).fill(0));

// Colaboradores de prueba (FULL, PART, AUX, EVENTUAL)
export const COLABORADORES_PRUEBA: Colaborador[] = [
  { id: 'full1', nombre: 'Carlos Paz', rol: 'FULL' },
  { id: 'full2', nombre: 'Gabriel Silva', rol: 'FULL' },
  { id: 'part1', nombre: 'Claudia Altamirano', rol: 'PART' },
  { id: 'part2', nombre: 'Giuliana Ciarlante', rol: 'PART' },
  { id: 'aux1', nombre: 'Fernando Mendez', rol: 'AUX' },
  { id: 'aux2', nombre: 'Monica Enriquez', rol: 'AUX' },
  { id: 'ev1', nombre: 'Eventual 1', rol: 'EVENTUAL' },
];

// Matrices de presencia de auxiliares (PARADO/NO_PRESENTE)
export const PRESENCIA_AUX: Record<string, AsignacionAux[][]> = {
  aux1: Array.from({ length: 7 }, () => Array(30).fill('NO_PRESENTE')),
  aux2: Array.from({ length: 7 }, () => Array(30).fill('NO_PRESENTE')),
};

// Matrices de disponibilidad de eventuales (NO_DISPONIBLE/NO_USADO)
export const DISPONIBILIDAD_EV: Record<string, AsignacionEv[][]> = {
  ev1: Array.from({ length: 7 }, () => Array(30).fill('NO_DISPONIBLE')),
};