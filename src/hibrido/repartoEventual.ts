/**
 * AH2-054 · Reparto parejo de las horas de caja de cada EVENTUAL entre los días (pedido del propietario).
 *
 * Paso posterior a la elección del horario: intercambia franjas de caja ENTRE DOS EVENTUALES
 * (a cede una franja de un día y toma una de b en otro día; b al revés). Así:
 *  - la cantidad de personas en caja por franja no cambia (cobertura, AUX y faltantes idénticos);
 *  - el total semanal de cada eventual no cambia (topes semanales y comparaciones intactos);
 *  - cada intercambio respeta disponibilidad, reservas de sector, hora límite y bloques por día,
 *    y nunca supera el máximo de bloques por día de la sucursal.
 * Se acepta solo si baja el coste convexo Σ k(k+1)/2 (k = medias horas de caja por persona y día)
 * más una penalización por cada bloque nuevo (para no fragmentar los turnos sin necesidad).
 * Quien lo usa vuelve a validar el resultado con los validadores independientes; si no valida, descarta.
 */
import type { InputAlgoritmo, ResultadoSemanal } from '../algoritmo/types'

const DIAS = 7, SLOTS = 30
/** Un bloque nuevo «cuesta» como 4 unidades del coste convexo. */
const PENALIZACION_BLOQUE = 4
const slotHora = (h: string) => { const [a, b] = h.split(':').map(Number); return (a - 8) * 2 + Math.floor(b / 30) }

/** Coste convexo del reparto diario de todos los eventuales (menor = más parejo). */
export function costeRepartoEventual(r: Pick<ResultadoSemanal, 'asignacion_eventual'>): number {
  let total = 0
  for (const semana of Object.values(r.asignacion_eventual)) for (const dia of semana) {
    const k = dia.filter(v => v === 'CAJA').length
    total += k * (k + 1) / 2
  }
  return total
}

const bloques = (fila: boolean[]) => fila.reduce((n, v, s) => n + (v && !fila[s - 1] ? 1 : 0), 0)

export function repartirEventuales(input: InputAlgoritmo, r: ResultadoSemanal, maxIteraciones = 500): ResultadoSemanal {
  const ids = Object.keys(r.asignacion_eventual).sort()
  if (ids.length < 2) return r
  const corte = input.eventuales_caja_hora_limite ? slotHora(input.eventuales_caja_hora_limite) : SLOTS
  const maxBloques = input.max_bloques_caja_eventual_dia ?? SLOTS
  const puede = (id: string, d: number, s: number) =>
    s < corte && input.disponibilidad_eventual[id]?.[d]?.[s] !== 'NO_DISPONIBLE' && !input.reservas_sector_eventual?.[id]?.[d]?.[s]
  // caja[id][d][s]
  const caja: Record<string, boolean[][]> = Object.fromEntries(ids.map(id => [id, r.asignacion_eventual[id].map(row => row.map(v => v === 'CAJA'))]))
  const k = (id: string, d: number) => caja[id][d].filter(Boolean).length
  let cambios = 0

  const intentar = (a: string, b: string): boolean => {
    for (let d = 0; d < DIAS; d++) for (let s = 0; s < SLOTS; s++) {
      if (!caja[a][d][s] || caja[b][d][s] || !puede(b, d, s)) continue
      for (let d2 = 0; d2 < DIAS; d2++) {
        if (d2 === d) continue
        // Ganancia convexa: a pasa de k(a,d)→−1 y k(a,d2)→+1; b al revés.
        const delta = (-k(a, d) + k(a, d2) + 1) + (k(b, d) + 1 - k(b, d2))
        if (delta >= 0) continue
        for (let s2 = 0; s2 < SLOTS; s2++) {
          if (!caja[b][d2][s2] || caja[a][d2][s2] || !puede(a, d2, s2)) continue
          const antes = bloques(caja[a][d]) + bloques(caja[b][d]) + bloques(caja[a][d2]) + bloques(caja[b][d2])
          caja[a][d][s] = false; caja[b][d][s] = true; caja[b][d2][s2] = false; caja[a][d2][s2] = true
          const filas = [caja[a][d], caja[b][d], caja[a][d2], caja[b][d2]]
          const despues = filas.reduce((n, f) => n + bloques(f), 0)
          if (delta + PENALIZACION_BLOQUE * (despues - antes) < 0 && filas.every(f => bloques(f) <= maxBloques)) return true
          caja[a][d][s] = true; caja[b][d][s] = false; caja[b][d2][s2] = true; caja[a][d2][s2] = false
        }
      }
    }
    return false
  }

  let mejoro = true
  while (mejoro && cambios < maxIteraciones) {
    mejoro = false
    for (const a of ids) for (const b of ids) if (a !== b && intentar(a, b)) { cambios++; mejoro = true }
  }
  if (!cambios) return r
  const asignacion_eventual = Object.fromEntries(ids.map(id => [id, r.asignacion_eventual[id].map((row, d) =>
    row.map((v, s) => caja[id][d][s] ? 'CAJA' as const : v === 'CAJA' ? 'NO_USADO' as const : v))]))
  return { ...r, asignacion_eventual }
}
