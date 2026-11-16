// AH2 · Tramo B1 — Comparación entre versiones (§5.5 del diseño v3) y verificación de días
// congelados para reemplazos parciales (§5.4). Puro; reutiliza la clasificación de turnos
// del motor y la UI (`clasificarJornadaUI`: mañana, tarde, cierre).
import type { JornadaAsignada } from '../types'
import { clasificarJornadaUI } from '../utils/preferencias'
import { type Resultado, falla, ok } from './errores'
import { type Fecha, sumarDias } from './fechas'
import { type SemanaPlan, jornadasPorFecha, mismaJornada, trabaja } from './semana'

export type TipoCambio = 'franco' | 'tipo-turno' | 'ajuste-horario' | 'alta' | 'baja'

export interface CambioDia {
  colaboradorId: string
  fecha: Fecha
  tipo: TipoCambio
  antes?: JornadaAsignada
  despues?: JornadaAsignada
  /** |Δ inicio| + |Δ fin| en minutos, cuando ambas jornadas trabajan. */
  desvioMinutos: number
}

export interface DiffHorarios {
  fechas: Fecha[]
  personasAfectadas: string[]
  francosMovidos: number
  cambiosTipoTurno: number
  /** Mismo tipo de turno con distinto horario (p. ej. 30 min): NO es un cambio de turno. */
  ajustesHorario: number
  desvioMinutos: number
  horas: Record<string, { antes: number; despues: number }>
  cambios: CambioDia[]
}

const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }
const horasDe = (j?: JornadaAsignada) => (trabaja(j) ? j!.horas : 0)

export interface Rango { desde: Fecha; hasta: Fecha }

/**
 * Compara dos horarios por FECHA (las semanas pueden ser la misma o solaparse). Con `rango`,
 * solo se comparan las fechas del intervalo (p. ej. el tramo replanificado).
 */
export function diffHorarios(a: SemanaPlan, b: SemanaPlan, rango?: Rango): DiffHorarios {
  const ia = jornadasPorFecha(a), ib = jornadasPorFecha(b)
  const fechas = new Set<Fecha>()
  for (const idx of [ia, ib]) for (const m of idx.values()) for (const f of m.keys()) fechas.add(f)
  const enRango = [...fechas].filter(f => !rango || (rango.desde <= f && f <= rango.hasta)).sort()
  const colaboradores = [...new Set([...ia.keys(), ...ib.keys()])].sort()
  const cambios: CambioDia[] = []
  const horas: DiffHorarios['horas'] = {}
  for (const c of colaboradores) {
    let hA = 0, hB = 0
    for (const f of enRango) {
      const ja = ia.get(c)?.get(f), jb = ib.get(c)?.get(f)
      hA += horasDe(ja); hB += horasDe(jb)
      if (!ia.has(c)) { if (trabaja(jb)) cambios.push({ colaboradorId: c, fecha: f, tipo: 'alta', despues: jb, desvioMinutos: 0 }); continue }
      if (!ib.has(c)) { if (trabaja(ja)) cambios.push({ colaboradorId: c, fecha: f, tipo: 'baja', antes: ja, desvioMinutos: 0 }); continue }
      if (mismaJornada(ja, jb)) continue
      if (trabaja(ja) !== trabaja(jb)) { cambios.push({ colaboradorId: c, fecha: f, tipo: 'franco', antes: ja, despues: jb, desvioMinutos: 0 }); continue }
      const desvio = Math.abs(minutos(ja!.turnos[0].inicio) - minutos(jb!.turnos[0].inicio))
        + Math.abs(minutos(ja!.turnos[ja!.turnos.length - 1].fin) - minutos(jb!.turnos[jb!.turnos.length - 1].fin))
      const tipo: TipoCambio = clasificarJornadaUI(ja!) === clasificarJornadaUI(jb!) ? 'ajuste-horario' : 'tipo-turno'
      cambios.push({ colaboradorId: c, fecha: f, tipo, antes: ja, despues: jb, desvioMinutos: desvio })
    }
    horas[c] = { antes: hA, despues: hB }
  }
  return {
    fechas: enRango,
    personasAfectadas: [...new Set(cambios.map(x => x.colaboradorId))].sort(),
    francosMovidos: cambios.filter(x => x.tipo === 'franco').length,
    cambiosTipoTurno: cambios.filter(x => x.tipo === 'tipo-turno').length,
    ajustesHorario: cambios.filter(x => x.tipo === 'ajuste-horario').length,
    desvioMinutos: cambios.reduce((s, x) => s + x.desvioMinutos, 0),
    horas,
    cambios,
  }
}

/**
 * Reemplazo parcial desde F: la versión nueva debe ser idéntica a la vigente en todos los días
 * de la semana anteriores a F (jornadas congeladas). Nunca se reescribe lo previo a F.
 */
export function verificarDiasCongelados(vigente: SemanaPlan, nueva: SemanaPlan, desde: Fecha): Resultado<true> {
  const d = diffHorarios(vigente, nueva, { desde: '0001-01-01', hasta: sumarDias(desde, -1) })
  if (d.cambios.length === 0) return ok(true)
  return falla('DIAS_CONGELADOS_MODIFICADOS', `La versión nueva modifica ${d.cambios.length} jornada(s) anteriores a ${desde}, que deben quedar congeladas.`, {
    cambios: d.cambios.map(c => ({ colaboradorId: c.colaboradorId, fecha: c.fecha, tipo: c.tipo })),
  })
}

