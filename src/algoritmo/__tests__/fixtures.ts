// src/algoritmo/__tests__/fixtures.ts
// Datos de prueba extraídos del PDF real (semana 13/04/2026 a 19/04/2026).
// Tabla "Estimado de cajas necesarias" y "Programación por colaborador".

import type {
  Colaborador,
  MatrizDemanda,
  MatrizPresencia,
  MatrizDisponibilidad,
} from "../types";

// ==================== ROSTER REAL PDF ====================
export const ROSTER_REAL_PDF: Colaborador[] = [
  // FULL cajeros
  { id: "carlos_paz", nombre: "Carlos Paz", rol: "FULL" },
  { id: "gabriel_silva", nombre: "Gabriel Silva", rol: "FULL" },
  { id: "rosa_mansilla", nombre: "Rosa Mansilla", rol: "FULL" },
  { id: "selena_oyarzo", nombre: "Selena Oyarzo", rol: "FULL" },
  // PART
  { id: "claudia_altamirano", nombre: "Claudia Altamirano", rol: "PART" },
  { id: "giuliana_ciarlante", nombre: "Giuliana Ciarlante", rol: "PART" },
  { id: "jorgelina_nanez", nombre: "Jorgelina Nanez", rol: "PART" },
  { id: "mariana_soruco", nombre: "Mariana Soruco", rol: "PART" },
  { id: "martina_beron", nombre: "Martina Beron", rol: "PART" },
  // AUX (híbridos)
  { id: "fernando_mendez", nombre: "Fernando Mendez", rol: "AUX" },
  { id: "monica_enriquez", nombre: "Monica Enriquez", rol: "AUX" },
  { id: "natalia_martinez", nombre: "Natalia Martinez", rol: "AUX" },
  { id: "teresa_alanoca", nombre: "Teresa Alanoca", rol: "AUX" },
  { id: "azucena_quiroga", nombre: "Azucena Quiroga", rol: "EVENTUAL" },
];

// ==================== DEMANDA REAL PDF ====================
// Filas = 30 slots (08:00..22:30). Columnas = 7 días (Lun..Dom).
const DEMANDA_POR_SLOT: number[][] = [
  [1, 1, 1, 1, 1, 1, 1], // 0  08:00
  [1, 1, 1, 1, 1, 1, 1], // 1  08:30
  [2, 2, 2, 2, 2, 2, 2], // 2  09:00
  [2, 2, 2, 2, 2, 2, 2], // 3  09:30
  [3, 3, 3, 3, 3, 3, 3], // 4  10:00
  [3, 3, 3, 3, 3, 3, 3], // 5  10:30
  [3, 4, 4, 4, 4, 4, 4], // 6  11:00
  [4, 4, 4, 4, 4, 4, 4], // 7  11:30
  [4, 4, 4, 4, 4, 5, 4], // 8  12:00
  [4, 4, 4, 4, 4, 4, 4], // 9  12:30
  [4, 4, 4, 4, 4, 4, 4], // 10 13:00
  [3, 4, 4, 4, 4, 4, 4], // 11 13:30
  [4, 4, 4, 4, 4, 4, 4], // 12 14:00
  [3, 3, 3, 3, 4, 4, 4], // 13 14:30
  [3, 3, 3, 3, 4, 4, 4], // 14 15:00
  [3, 4, 3, 4, 4, 4, 4], // 15 15:30
  [4, 4, 4, 4, 4, 4, 4], // 16 16:00
  [4, 4, 4, 4, 4, 5, 4], // 17 16:30
  [4, 4, 4, 4, 4, 5, 4], // 18 17:00
  [4, 5, 4, 5, 5, 5, 5], // 19 17:30
  [5, 5, 5, 5, 5, 6, 5], // 20 18:00
  [5, 6, 5, 6, 6, 6, 6], // 21 18:30
  [6, 6, 6, 6, 6, 7, 6], // 22 19:00
  [6, 6, 6, 6, 7, 7, 6], // 23 19:30
  [6, 6, 6, 6, 7, 7, 6], // 24 20:00
  [6, 6, 6, 6, 7, 7, 6], // 25 20:30
  [6, 6, 6, 6, 6, 6, 6], // 26 21:00
  [5, 5, 5, 5, 6, 6, 5], // 27 21:30
  [2, 2, 2, 2, 3, 3, 2], // 28 22:00
  [0, 0, 0, 0, 0, 0, 0], // 29 22:30 (sin demanda)
];

// Matriz final [día][slot]
export const DEMANDA_REAL_PDF: MatrizDemanda = Array.from({ length: 7 }, (_, dia) =>
  Array.from({ length: 30 }, (_, slot) => DEMANDA_POR_SLOT[slot][dia])
);

// ==================== PRESENCIA DE AUX REAL PDF ====================
// Horarios tomados del PDF página 1 (tabla "Programación por colaborador")
// para las 5 personas con rol híbrido (AUX).
// Formato: por día, lista de bloques [slot_inicio, slot_fin). Franco = [].

type RangoSlot = [number, number]; // [inclusivo, exclusivo)

function horaASlot(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h - 8) * 2 + (m >= 30 ? 1 : 0);
}

function rango(inicioHora: string, finHora: string): RangoSlot {
  return [horaASlot(inicioHora), horaASlot(finHora)];
}

// Horarios reales del PDF por aux y día (L, M, X, J, V, S, D).
// Si el día está de franco, el array es vacío [].
const HORARIOS_AUX_PDF: Record<string, RangoSlot[][]> = {
  // Fernando Mendez: L 11-19 | M franco | X 08-13 + 19-23 | J 11-19 | V 11-20 | S 14-23 | D 18-23
  fernando_mendez: [
    [rango("11:00", "19:00")],
    [],
    [rango("08:00", "13:00"), rango("19:00", "22:30")],
    [rango("11:00", "19:00")],
    [rango("11:00", "20:00")],
    [rango("14:00", "22:30")],
    [rango("18:00", "22:30")],
  ],
  // Monica Enriquez: L 08-16 | M 08-14 + 20-23 | X 11-19 | J franco | V 08-13 + 19-23 | S 14-23 | D 12-17
  monica_enriquez: [
    [rango("08:00", "16:00")],
    [rango("08:00", "14:00"), rango("20:00", "22:30")],
    [rango("11:00", "19:00")],
    [],
    [rango("08:00", "13:00"), rango("19:00", "22:30")],
    [rango("14:00", "22:30")],
    [rango("12:00", "17:00")],
  ],
  // Natalia Martinez: L 14-23 | M 11-20 | X franco | J 08-14 + 20-23 | V 15-23 | S 11-16 | D 11-19
  natalia_martinez: [
    [rango("14:00", "22:30")],
    [rango("11:00", "20:00")],
    [],
    [rango("08:00", "14:00"), rango("20:00", "22:30")],
    [rango("15:00", "22:30")],
    [rango("11:00", "16:00")],
    [rango("11:00", "19:00")],
  ],
  // Teresa Alanoca: L 15-23 | M 14-23 | X 15-23 | J 14-23 | V franco | S 08-13 | D 08-14 + 20-23
  teresa_alanoca: [
    [rango("15:00", "22:30")],
    [rango("14:00", "22:30")],
    [rango("15:00", "22:30")],
    [rango("14:00", "22:30")],
    [],
    [rango("08:00", "13:00")],
    [rango("08:00", "14:00"), rango("20:00", "22:30")],
  ],
};

function construirMatrizAux(rangosPorDia: RangoSlot[][]): MatrizPresencia {
  const matriz: MatrizPresencia = Array.from({ length: 7 }, () =>
    Array(30).fill("NO_PRESENTE")
  );
  for (let dia = 0; dia < 7; dia++) {
    for (const [inicio, fin] of rangosPorDia[dia]) {
      for (let slot = inicio; slot < fin && slot < 30; slot++) {
        if (slot >= 0) matriz[dia][slot] = "PARADO";
      }
    }
  }
  return matriz;
}

export const PRESENCIA_AUX_REAL_PDF: Record<string, MatrizPresencia> = {};
for (const auxId of Object.keys(HORARIOS_AUX_PDF)) {
  PRESENCIA_AUX_REAL_PDF[auxId] = construirMatrizAux(HORARIOS_AUX_PDF[auxId]);
}

// ==================== DISPONIBILIDAD DE EVENTUAL ====================
// Horarios tomados del PDF para colaboradores con rol EVENTUAL.
// Formato: por dia, lista de bloques [slot_inicio, slot_fin). Franco = [].

// Azucena Quiroga: L 06-14 | M 06-14 | X franco | J 06-14 | V 06-14 | S 06-14 | D 06-14
// Nota: el PDF muestra 06:00-14:00 pero la operacion arranca a las 08:00.
// Tratamos 06:00-14:00 como disponible efectivo 08:00-14:00 (slots 0..12).
const HORARIOS_EVENTUAL_PDF: Record<string, RangoSlot[][]> = {
  azucena_quiroga: [
    [rango("08:00", "14:00")],
    [rango("08:00", "14:00")],
    [],
    [rango("08:00", "14:00")],
    [rango("08:00", "14:00")],
    [rango("08:00", "14:00")],
    [rango("08:00", "14:00")],
  ],
};

function construirMatrizEventual(rangosPorDia: RangoSlot[][]): MatrizDisponibilidad {
  const matriz: MatrizDisponibilidad = Array.from({ length: 7 }, () =>
    Array(30).fill("NO_DISPONIBLE")
  );
  for (let dia = 0; dia < 7; dia++) {
    for (const [inicio, fin] of rangosPorDia[dia]) {
      for (let slot = inicio; slot < fin && slot < 30; slot++) {
        if (slot >= 0) matriz[dia][slot] = "NO_USADO";
      }
    }
  }
  return matriz;
}

export const DISPONIBILIDAD_EV_REAL_PDF: Record<string, MatrizDisponibilidad> = {};
for (const evId of Object.keys(HORARIOS_EVENTUAL_PDF)) {
  DISPONIBILIDAD_EV_REAL_PDF[evId] = construirMatrizEventual(HORARIOS_EVENTUAL_PDF[evId]);
}
