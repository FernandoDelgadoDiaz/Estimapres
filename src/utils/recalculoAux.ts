// src/utils/recalculoAux.ts
// Recalcula los bloques en CAJA de los AUX cuando el supervisor edita la
// PRESENCIA de un AUX en "Último horario": el snapshot de la generación queda
// obsoleto, así que se re-ejecuta la lógica REAL de la Pasada 2 (con sus
// reglas H-A1/H-A2/H-A3 y agrupación mínima de 1 hora) sobre el déficit que
// dejan los cajeros del horario editado.

import type {
  HorarioColaborador,
  AsignacionCajaColaborador,
} from '../types'
import { HORAS_FRANJAS } from '../types'
import type { AsignacionAux, MatrizPresencia } from '../algoritmo/types'
import { ejecutarPasada2 } from '../algoritmo/pasada2-auxiliares'
import { horaASlotUI } from './preferencias'

function horaAMin(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Matriz de presencia 7×30 (PARADO/NO_PRESENTE) desde las jornadas de un AUX. */
function presenciaDesdeJornadas(h: HorarioColaborador): MatrizPresencia {
  const matriz: MatrizPresencia = Array.from({ length: 7 }, () =>
    Array(30).fill('NO_PRESENTE' as AsignacionAux)
  )
  for (const j of h.jornadas) {
    if (j.esFranco) continue
    for (const t of j.turnos) {
      const desde = Math.max(0, horaASlotUI(t.inicio))
      const hasta = Math.min(30, horaASlotUI(t.fin))
      for (let s = desde; s < hasta; s++) matriz[j.dia][s] = 'PARADO'
    }
  }
  return matriz
}

/**
 * Recalcula cajaAux para el horario editado.
 * - Déficit de entrada = necesidad del PDF − cobertura de los CAJEROS del
 *   horario actual (los eventuales van después en la cascada, como en el motor).
 * - Presencia de cada AUX = sus jornadas actuales (con la edición aplicada).
 * Devuelve null si no se puede recalcular con garantías (sin necesidad del
 * PDF, sin filas AUX, o si la presencia editada viola las precondiciones
 * duras de la Pasada 2) — en ese caso el caller conserva el snapshot previo.
 */
export function recalcularCajaAux(
  horarios: HorarioColaborador[],
  necesidadFranjas: number[][],
  nombrePorId: Record<string, string>
): AsignacionCajaColaborador[] | null {
  const filasAux = horarios.filter(h => h.rolGeneral === 'aux_supervisor')
  if (filasAux.length === 0) return null

  // Demanda 7×30 desde la necesidad por franja del PDF
  const demanda: number[][] = Array.from({ length: 7 }, () => Array(30).fill(0))
  let hayDemanda = false
  for (let fi = 0; fi < HORAS_FRANJAS.length; fi++) {
    const slot = horaASlotUI(HORAS_FRANJAS[fi])
    if (slot < 0 || slot >= 30) continue
    for (let dia = 0; dia < 7; dia++) {
      const v = necesidadFranjas[fi]?.[dia] ?? 0
      demanda[dia][slot] = v
      if (v > 0) hayDemanda = true
    }
  }
  if (!hayDemanda) return null

  // Déficit tras cajeros FULL/PART (cascada: AUX cubre lo que dejan los cajeros)
  const deficit_1: number[][] = demanda.map(fila => [...fila])
  const cajeros = horarios.filter(h => h.rolGeneral === 'cajero')
  for (const h of cajeros) {
    for (const j of h.jornadas) {
      if (j.esFranco) continue
      for (const t of j.turnos) {
        const desde = Math.max(0, Math.floor((horaAMin(t.inicio) - 8 * 60) / 30))
        const hasta = Math.min(30, Math.ceil((horaAMin(t.fin) - 8 * 60) / 30))
        for (let s = desde; s < hasta; s++) {
          deficit_1[j.dia][s] = Math.max(0, deficit_1[j.dia][s] - 1)
        }
      }
    }
  }

  // Presencia actual de cada AUX (con la edición aplicada)
  const presencia_aux: Record<string, MatrizPresencia> = {}
  for (const h of filasAux) {
    presencia_aux[h.colaboradorId] = presenciaDesdeJornadas(h)
  }

  const p2 = ejecutarPasada2(
    { demanda, colaboradores: [], presencia_aux, disponibilidad_eventual: {} },
    { jornadas_full: {}, jornadas_part: {}, deficit_1, infactibles: [] }
  )

  // Presencia editada rompe precondiciones duras (H-A1/H-A2 de input):
  // no hay recálculo confiable → el caller conserva el snapshot previo.
  if (p2.violaciones_input.length > 0) return null

  return Object.entries(p2.asignacion_aux)
    .map(([id, matriz]) => ({
      colaboradorId: id,
      nombre: nombrePorId[id] ?? id,
      slotsCajaPorDia: matriz.map(fila => fila.map(estado => estado === 'CAJA')),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}
