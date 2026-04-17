// src/algoritmo/__tests__/fixtures.ts
// Datos de prueba extraídos de un PDF real para validar el algoritmo.
// Semana 13/04/2026 (lunes) a 19/04/2026 (domingo).
// Implementado en Prompt 1.

import type { Colaborador, MatrizDemanda, MatrizPresencia, MatrizDisponibilidad } from '../types';

// ==================== ROSTER REAL PDF ====================
export const ROSTER_REAL_PDF: Colaborador[] = [
  // FULL cajeros
  { id: 'carlos_paz', nombre: 'Carlos Paz', rol: 'FULL' },
  { id: 'gabriel_silva', nombre: 'Gabriel Silva', rol: 'FULL' },
  { id: 'rosa_mansilla', nombre: 'Rosa Mansilla', rol: 'FULL' },
  { id: 'selena_oyarzo', nombre: 'Selena Oyarzo', rol: 'FULL' },
  // PART
  { id: 'claudia_altamirano', nombre: 'Claudia Altamirano', rol: 'PART' },
  { id: 'giuliana_ciarlante', nombre: 'Giuliana Ciarlante', rol: 'PART' },
  { id: 'jorgelina_nanez', nombre: 'Jorgelina Nanez', rol: 'PART' },
  { id: 'mariana_soruco', nombre: 'Mariana Soruco', rol: 'PART' },
  { id: 'martina_beron', nombre: 'Martina Beron', rol: 'PART' },
  // AUX (híbridos)
  { id: 'fernando_mendez', nombre: 'Fernando Mendez', rol: 'AUX' },
  { id: 'monica_enriquez', nombre: 'Monica Enriquez', rol: 'AUX' },
  { id: 'natalia_martinez', nombre: 'Natalia Martinez', rol: 'AUX' },
  { id: 'teresa_alanoca', nombre: 'Teresa Alanoca', rol: 'AUX' },
  { id: 'azucena_quiroga', nombre: 'Azucena Quiroga', rol: 'AUX' },
  // EVENTUAL (vacío por ahora)
];

// ==================== DEMANDA REAL PDF ====================
// Tabla "Estimado de cajas necesarias" del PDF.
// Slot 0 = 08:00-08:30, slot 28 = 22:00-22:30, slot 29 = 22:30-23:00 (no usado).
// Valores por día: L 13, M 14, M 15, J 16, V 17, S 18, D 19.
const demandaPorSlot: number[][] = [
  // slot 0 (08:00-08:30)
  [1, 1, 1, 1, 1, 1, 1],
  // slot 1 (08:30-09:00)
  [1, 1, 1, 1, 1, 1, 1],
  // slot 2 (09:00-09:30)
  [2, 2, 2, 2, 2, 2, 2],
  // slot 3 (09:30-10:00)
  [2, 2, 2, 2, 2, 2, 2],
  // slot 4 (10:00-10:30)
  [3, 3, 3, 3, 3, 3, 3],
  // slot 5 (10:30-11:00)
  [3, 3, 3, 3, 3, 3, 3],
  // slot 6 (11:00-11:30)
  [3, 4, 4, 4, 4, 4, 4],
  // slot 7 (11:30-12:00)
  [4, 4, 4, 4, 4, 4, 4],
  // slot 8 (12:00-12:30)
  [4, 4, 4, 4, 4, 5, 4],
  // slot 9 (12:30-13:00)
  [4, 4, 4, 4, 4, 4, 4],
  // slot 10 (13:00-13:30)
  [4, 4, 4, 4, 4, 4, 4],
  // slot 11 (13:30-14:00)
  [3, 4, 4, 4, 4, 4, 4],
  // slot 12 (14:00-14:30)
  [4, 4, 4, 4, 4, 4, 4],
  // slot 13 (14:30-15:00)
  [3, 3, 3, 3, 4, 4, 4],
  // slot 14 (15:00-15:30)
  [3, 3, 3, 3, 4, 4, 4],
  // slot 15 (15:30-16:00)
  [3, 4, 3, 4, 4, 4, 4],
  // slot 16 (16:00-16:30)
  [4, 4, 4, 4, 4, 4, 4],
  // slot 17 (16:30-17:00)
  [4, 4, 4, 4, 4, 5, 4],
  // slot 18 (17:00-17:30)
  [4, 4, 4, 4, 4, 5, 4],
  // slot 19 (17:30-18:00)
  [4, 5, 4, 5, 5, 5, 5],
  // slot 20 (18:00-18:30)
  [5, 5, 5, 5, 5, 6, 5],
  // slot 21 (18:30-19:00)
  [5, 6, 5, 6, 6, 6, 6],
  // slot 22 (19:00-19:30)
  [6, 6, 6, 6, 6, 7, 6],
  // slot 23 (19:30-20:00)
  [6, 6, 6, 6, 7, 7, 6],
  // slot 24 (20:00-20:30)
  [6, 6, 6, 6, 7, 7, 6],
  // slot 25 (20:30-21:00)
  [6, 6, 6, 6, 7, 7, 6],
  // slot 26 (21:00-21:30)
  [6, 6, 6, 6, 6, 6, 6],
  // slot 27 (21:30-22:00)
  [5, 5, 5, 5, 6, 6, 5],
  // slot 28 (22:00-22:30)
  [2, 2, 2, 2, 3, 3, 2],
  // slot 29 (22:30-23:00) - sin demanda
  [0, 0, 0, 0, 0, 0, 0],
];

// Convertir a matriz 7x30 (día x slot)
export const DEMANDA_REAL_PDF: MatrizDemanda = Array.from({ length: 7 }, (_, dia) =>
  Array.from({ length: 30 }, (_, slot) => demandaPorSlot[slot][dia])
);

// ==================== PRESENCIA DE AUX REAL PDF ====================
// Basado en tabla "Programación por colaborador" del PDF.
// Convertir horarios a slots PARADO.
// Ejemplo: Fernando Mendez lunes 11:00-19:00 -> slots 6..21 PARADO.
// Por simplicidad, asignamos horarios fijos para cada AUX (inventados).
// En un entorno real, se extraerían del PDF.

function horarioASlots(inicioHora: number, inicioMin: number, finHora: number, finMin: number): number[] {
  const slotInicio = (inicioHora - 8) * 2 + (inicioMin >= 30 ? 1 : 0);
  const slotFin = (finHora - 8) * 2 + (finMin >= 30 ? 1 : 0);
  const slots: number[] = [];
  for (let s = slotInicio; s < slotFin; s++) {
    if (s >= 0 && s < 30) slots.push(s);
  }
  return slots;
}

export const PRESENCIA_AUX_REAL_PDF: Record<string, MatrizPresencia> = {};

// Inicializar todas las matrices con NO_PRESENTE
for (const aux of ROSTER_REAL_PDF.filter(c => c.rol === 'AUX')) {
  const matriz: MatrizPresencia = Array.from({ length: 7 }, () => Array(30).fill('NO_PRESENTE'));
  PRESENCIA_AUX_REAL_PDF[aux.id] = matriz;
}

// Asignar horarios ficticios (basados en patrones típicos del PDF)
const horariosAux: Record<string, { inicio: string, fin: string }[]> = {
  fernando_mendez: [
    { inicio: '11:00', fin: '19:00' }, // lunes
    { inicio: '11:00', fin: '19:00' }, // martes
    { inicio: '11:00', fin: '19:00' }, // miércoles
    { inicio: '11:00', fin: '19:00' }, // jueves
    { inicio: '11:00', fin: '19:00' }, // viernes
    { inicio: '11:00', fin: '19:00' }, // sábado
    { inicio: '11:00', fin: '19:00' }, // domingo
  ],
  monica_enriquez: [
    { inicio: '09:00', fin: '17:00' },
    { inicio: '09:00', fin: '17:00' },
    { inicio: '09:00', fin: '17:00' },
    { inicio: '09:00', fin: '17:00' },
    { inicio: '09:00', fin: '17:00' },
    { inicio: '09:00', fin: '17:00' },
    { inicio: '09:00', fin: '17:00' },
  ],
  natalia_martinez: [
    { inicio: '13:00', fin: '21:00' },
    { inicio: '13:00', fin: '21:00' },
    { inicio: '13:00', fin: '21:00' },
    { inicio: '13:00', fin: '21:00' },
    { inicio: '13:00', fin: '21:00' },
    { inicio: '13:00', fin: '21:00' },
    { inicio: '13:00', fin: '21:00' },
  ],
  teresa_alanoca: [
    { inicio: '08:00', fin: '16:00' },
    { inicio: '08:00', fin: '16:00' },
    { inicio: '08:00', fin: '16:00' },
    { inicio: '08:00', fin: '16:00' },
    { inicio: '08:00', fin: '16:00' },
    { inicio: '08:00', fin: '16:00' },
    { inicio: '08:00', fin: '16:00' },
  ],
  azucena_quiroga: [
    { inicio: '14:00', fin: '22:00' },
    { inicio: '14:00', fin: '22:00' },
    { inicio: '14:00', fin: '22:00' },
    { inicio: '14:00', fin: '22:00' },
    { inicio: '14:00', fin: '22:00' },
    { inicio: '14:00', fin: '22:00' },
    { inicio: '14:00', fin: '22:00' },
  ],
};

for (const [auxId, horarios] of Object.entries(horariosAux)) {
  const matriz = PRESENCIA_AUX_REAL_PDF[auxId];
  for (let dia = 0; dia < 7; dia++) {
    const { inicio, fin } = horarios[dia];
    const [h1, m1] = inicio.split(':').map(Number);
    const [h2, m2] = fin.split(':').map(Number);
    const slots = horarioASlots(h1, m1, h2, m2);
    for (const slot of slots) {
      matriz[dia][slot] = 'PARADO';
    }
  }
}

// ==================== DISPONIBILIDAD DE EVENTUAL REAL PDF ====================
// No hay eventuales en el PDF de muestra.
export const DISPONIBILIDAD_EV_REAL_PDF: Record<string, MatrizDisponibilidad> = {};