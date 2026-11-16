// Fixtures 100 % sintéticos para el núcleo de planificación (sin personas reales).
import type { HorarioColaborador, JornadaAsignada } from '../../types'
import type { CicloPlanificacion } from '../ciclos'
import type { PoliticaAprobacion, ResultadoValidacionTecnica, VersionPlan } from '../estados'
import type { SemanaPlan } from '../semana'

export const jornada = (dia: number, inicio?: string, fin?: string): JornadaAsignada =>
  inicio && fin
    ? { dia, turnos: [{ inicio, fin }], horas: (toMin(fin) - toMin(inicio)) / 60, esFranco: false, rol: 'cajero' }
    : { dia, turnos: [], horas: 0, esFranco: true, rol: 'franco' }
const toMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b }

/** 7 jornadas: `patron[d]` = [inicio, fin] o null (franco). */
export function horario(colaboradorId: string, patron: Array<[string, string] | null>): HorarioColaborador {
  const jornadas = patron.map((p, d) => (p ? jornada(d, p[0], p[1]) : jornada(d)))
  return { colaboradorId, jornadas, totalHoras: jornadas.reduce((s, j) => s + j.horas, 0), errores: [], rolGeneral: 'cajero' }
}

const M: [string, string] = ['09:00', '15:00']   // mañana
const T: [string, string] = ['13:00', '19:00']   // tarde
const C: [string, string] = ['16:00', '22:00']   // cierre
export const TURNOS = { M, T, C }

export function semana(fechaLunes: string, variante = 0): SemanaPlan {
  return {
    fechaLunes,
    horarios: [
      horario('c1', variante ? [M, M, C, C, M, null, M] : [M, M, M, M, M, null, M]),
      horario('c2', [C, C, C, null, C, C, C]),
      horario('c3', [T, null, T, T, T, T, T]),
    ],
  }
}

export const ciclo = (id: string, inicio: string, fin: string, modalidad: CicloPlanificacion['modalidad'] = 'mensual'): CicloPlanificacion =>
  ({ id, sucursalId: 's091', nombre: id, modalidad, inicio, fin, estado: 'planificado', origen: 'sucursal' })

export const POLITICA_091: PoliticaAprobacion = { aprobacionPropiaPermitida: true }

export const version = (id: string, fechaLunes: string, extra: Partial<VersionPlan> = {}): VersionPlan => ({
  id, sucursalId: 's091', cicloId: 'nov', fechaLunes, numero: 1, ambito: 'servidor', estado: 'BORRADOR',
  huellaEntradas: 'sha256:h1', creadaPor: 'sup-1', ...extra,
})

export const validacion = (huella: string, donde: 'cliente' | 'servidor' = 'cliente', estado: ResultadoValidacionTecnica['estado'] = 'VALIDADO'): ResultadoValidacionTecnica =>
  ({ estado, huella, validadorVersion: 'v-test', donde, en: '2026-11-15T10:00:00Z' })

/** PRNG determinista (mulberry32) para pruebas de propiedad reproducibles. */
export function prng(semilla: number) {
  let a = semilla >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
