// #7 · AH2-020 — Generador DETERMINISTA de escenarios sintéticos (semilla fija) para el
// benchmark offline de prioridad de horas y sus pruebas de regresión. Sin datos reales.
// El escenario i depende de haber generado 0..i-1 (misma secuencia pseudoaleatoria):
// usar escenarioSintetico(i), que reinicia la semilla.
import { HORAS_FRANJAS, type Colaborador, type ExcepcionSemanal, type Franja } from '../../../types'

const SEMILLA = 20261114
let seed = SEMILLA
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const elegir = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]

export interface Escenario { id: number; modo: string; necesidad: Franja[]; cajeros: Colaborador[]; excepciones: ExcepcionSemanal[] }

export function generarEscenario(id: number): Escenario {
  const nF = 1 + Math.floor(rnd() * 3), nP = 2 + Math.floor(rnd() * 4)
  const cajeros: Colaborador[] = [
    ...Array.from({ length: nF }, (_, i) => ({ id: `f${i}`, nombre: `F${i}`, tipo: 'FULL' as const, horasSemanales: 48, activo: true })),
    ...Array.from({ length: nP }, (_, i) => ({ id: `p${i}`, nombre: `P${i}`, tipo: 'PART' as const, horasSemanales: 32, activo: true })),
  ]
  const modo = elegir(['pico-noche', 'uniforme-bajo', 'pico-mañana', 'doble-pico'])
  const necesidad = HORAS_FRANJAS.map(hora => {
    const h = Number(hora.slice(0, 2))
    return {
      hora, necesidad: Array.from({ length: 7 }, () => {
        if (h < 8) return 0
        if (modo === 'pico-noche') return h >= 18 && h < 21 ? 1 + Math.floor(rnd() * 4) : Math.floor(rnd() * 2)
        if (modo === 'uniforme-bajo') return Math.floor(rnd() * 3)
        if (modo === 'pico-mañana') return h >= 9 && h < 11 ? 2 + Math.floor(rnd() * 3) : rnd() < 0.3 ? 1 : 0
        return (h >= 9 && h < 11) || (h >= 18 && h < 20) ? 2 + Math.floor(rnd() * 2) : rnd() < 0.4 ? 1 : 0
      }),
    }
  })
  // Reglas propias: casi todas compatibles con 32 h; una familia restrictiva (≈ 6 %) las hace imposibles.
  const excepciones: ExcepcionSemanal[] = []
  for (let i = 0; i < nP; i++) {
    const r = rnd()
    if (r < 0.06) excepciones.push({ id: `e${i}`, colaboradorNombre: `P${i}`, tipo: 'no_despues_de', valor: elegir(['13:00', '14:00']), descripcion: 'sintética restrictiva' }) // 32 h imposibles
    else if (r < 0.2) excepciones.push({ id: `e${i}`, colaboradorNombre: `P${i}`, tipo: 'no_despues_de', valor: elegir(['15:00', '16:00', '17:00']), descripcion: 'sintética' })
    else if (r < 0.3) excepciones.push({ id: `e${i}`, colaboradorNombre: `P${i}`, tipo: 'no_antes_de', valor: '10:00', descripcion: 'sintética' })
    else if (r < 0.45) excepciones.push({ id: `e${i}`, colaboradorNombre: `P${i}`, tipo: 'franco_dia', valor: String(Math.floor(rnd() * 7)), descripcion: 'sintética' })
  }
  return { id, modo, necesidad, cajeros, excepciones }
}


/** Escenario i reproducible de forma aislada (reinicia la semilla y genera 0..i). */
export function escenarioSintetico(i: number): Escenario {
  seed = SEMILLA
  let e = generarEscenario(0)
  for (let k = 1; k <= i; k++) e = generarEscenario(k)
  return e
}
