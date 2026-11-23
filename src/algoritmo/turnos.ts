/**
 * AH2-056 · Pedido de turno por persona (excepción para 1–2 personas, no la regla general).
 *
 * Cada turno se traduce a primitivas que ambos motores y el validador ya entienden:
 *  - ventana de ingreso → `no_antes_de` + `inicio_no_despues_de`;
 *  - `cortadas_semana`  → cantidad de jornadas cortadas FULL en la semana (por defecto 2);
 *  - `mananas_min`      → mínimo de jornadas de mañana (por defecto 2).
 * La composición FULL (3×9 h, 2×8 h, 1×5 h + franco), el descanso de 12 h, el corte de 4 h
 * y la salida máxima no cambian nunca.
 */
import type { ExcepcionSemanal } from '../types'

export type TurnoPedido = 'manana' | 'intermedio' | 'tarde' | 'noche' | 'cortado' | 'cierre'

export interface DefTurno { etiqueta: string; ingreso?: [string, string]; cortadas?: number | 'max'; mananasMin?: number; cortadaInicioHasta?: string
  /** AH2-058: termina siempre al cierre (misma regla que el antiguo «Siempre de cierre»). */
  cierre?: boolean }

/** Catálogo por contrato. FULL: mañana, intermedio, tarde, cortado. PART: mañana, tarde, noche. */
export const TURNOS: Record<'FULL' | 'PART', Partial<Record<TurnoPedido, DefTurno>>> = {
  FULL: {
    manana: { etiqueta: 'Solo mañana', ingreso: ['08:00', '09:00'], cortadas: 0 },
    intermedio: { etiqueta: 'Solo intermedio', ingreso: ['10:00', '11:00'], cortadas: 0 },
    tarde: { etiqueta: 'Solo tarde', ingreso: ['12:00', '15:00'], cortadas: 0, mananasMin: 0 },
    // Cortadas desde las 10:00/10:30 (p. ej. 10–14 / 18–22) para poder encadenarlas con 12 h de descanso.
    cortado: { etiqueta: 'Solo cortado', cortadas: 'max', mananasMin: 0, cortadaInicioHasta: '10:30' },
    // AH2-058: reemplaza a la regla suelta «Siempre de cierre».
    cierre: { etiqueta: 'Solo cierre', cierre: true, mananasMin: 0 },
  },
  PART: {
    manana: { etiqueta: 'Solo mañana', ingreso: ['08:00', '10:00'] },
    tarde: { etiqueta: 'Solo tarde', ingreso: ['14:00', '15:00'], mananasMin: 0 },
    noche: { etiqueta: 'Solo noche', ingreso: ['17:00', '18:00'], mananasMin: 0 },
    cierre: { etiqueta: 'Solo cierre', cierre: true, mananasMin: 0 },
  },
}

/** Turnos que se ofrecen para un contrato (el desplegable no muestra los del otro). */
export const turnosDeContrato = (contrato: string) =>
  Object.entries(TURNOS[contrato as 'FULL' | 'PART'] ?? {}) as [TurnoPedido, DefTurno][]

/** Excepciones primitivas equivalentes al pedido. `null` si el turno no corresponde a ese contrato. */
export function excepcionesDeTurno(
  base: { id: string; colaboradorNombre: string; colaboradorId?: string; descripcion: string },
  contrato: string, turno: TurnoPedido,
): ExcepcionSemanal[] | null {
  const def = TURNOS[contrato as 'FULL' | 'PART']?.[turno]
  if (!def) return null
  const out: ExcepcionSemanal[] = []
  const e = (sufijo: string, tipo: string, valor: string) => out.push({ ...base, id: `${base.id}_${sufijo}`, tipo, valor } as ExcepcionSemanal)
  if (def.ingreso) { e('desde', 'no_antes_de', def.ingreso[0]); e('hasta', 'inicio_no_despues_de', def.ingreso[1]) }
  if (contrato === 'FULL' && def.cortadas !== undefined) e('cortadas', 'cortadas_semana', String(def.cortadas))
  if (def.mananasMin !== undefined) e('mananas', 'mananas_min', String(def.mananasMin))
  if (def.cortadaInicioHasta) e('cortada', 'cortada_inicio_hasta', def.cortadaInicioHasta)
  if (def.cierre) out.push({ ...base, id: `${base.id}_cierre`, tipo: 'siempre_cierre' } as ExcepcionSemanal)
  return out
}

/** (cortadas FULL de la semana, mínimo de mañanas) para la persona; 'max' si aún no se resolvió. */
export function reglasDeTurno(excepciones: ExcepcionSemanal[], id: string, nombre: string): { cortadas: number | 'max'; mananas: number } {
  let cortadas: number | 'max' = 2, mananas = 2
  for (const e of excepciones) {
    if (e.colaboradorId ? e.colaboradorId !== id : e.colaboradorNombre !== nombre) continue
    if (e.tipo === 'cortadas_semana') cortadas = e.valor === 'max' ? 'max' : Number(e.valor)
    else if (e.tipo === 'mananas_min') mananas = Number(e.valor)
  }
  return { cortadas, mananas }
}
