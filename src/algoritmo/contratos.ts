// src/algoritmo/contratos.ts
// #7 / #44 tramo A — Definición ÚNICA del contrato de horas que usan el motor,
// las reglas (H-P1), el validador independiente, la UI y el PDF.
//
// Conceptos (no confundir):
//   - objetivoHoras: horas semanales a cumplir por la persona (su ficha).
//   - maximoHoras:   tope del PERFIL vigente para su contrato; nunca se excede.
//   - topeHoras:     lo que el motor puede asignar = min(objetivo, máximo). No se
//                    asigna por encima de la ficha (coherente con OP_HORAS_FICHA).
//   - asignadasHoras / diferenciaHoras: resultado real y lo que falta respecto
//                    del objetivo, con su motivo si el motor no puede cumplirlo.
//
// Estado normativo: el máximo PART de 32 h es REQUISITO DE PRODUCTO / configuración
// de la sucursal (MASTER AH2-004, AH2-014), con validación jurídica PENDIENTE. El
// perfil histórico de 31 h se conserva para validar semanas generadas antes.

export type TipoContrato = 'FULL' | 'PART'

export interface PerfilHorasContrato {
  id: string
  nombre: string
  estado: 'PROPUESTO' | 'VALIDADO'
  /** Desde cuándo generó/valida el motor con este perfil (informativo). */
  desde: string
  fuente: string
  /** Tope semanal por tipo de contrato. */
  maximoHoras: Record<TipoContrato, number>
  /** Objetivo si la ficha no informa horas (o informa 0). */
  objetivoPorDefecto: Record<TipoContrato, number>
}

/** Perfil vigente: PART hasta 32 h (requisito de producto, sucursal 091). */
export const PERFIL_HORAS_VIGENTE: PerfilHorasContrato = {
  id: 'horas-2026-11-part32',
  nombre: 'PART hasta 32 h · FULL 48 h',
  estado: 'PROPUESTO',
  desde: '2026-11-15',
  fuente: 'MASTER AH2-004/AH2-014 (requisito de producto; validación jurídica pendiente, Issue #7).',
  maximoHoras: { FULL: 48, PART: 32 },
  objetivoPorDefecto: { FULL: 48, PART: 32 },
}

/** Perfil histórico: el motor limitaba PART a 31 h (62 slots) hasta este cambio. */
export const PERFIL_HORAS_HISTORICO_31: PerfilHorasContrato = {
  id: 'horas-2026-07-part31',
  nombre: 'PART hasta 31 h · FULL 48 h (motor anterior)',
  estado: 'PROPUESTO',
  desde: '2026-07-01',
  fuente: 'src/algoritmo/pasada1-fullpart.ts MAX_SLOTS_PART=62 hasta 2026-11-14.',
  maximoHoras: { FULL: 48, PART: 31 },
  objetivoPorDefecto: { FULL: 48, PART: 31 },
}

export const PERFILES_HORAS: Record<string, PerfilHorasContrato> = {
  [PERFIL_HORAS_VIGENTE.id]: PERFIL_HORAS_VIGENTE,
  [PERFIL_HORAS_HISTORICO_31.id]: PERFIL_HORAS_HISTORICO_31,
}

/** Perfil con el que se valida una semana guardada: el suyo, o el histórico si no lo registró. */
export function perfilHorasDeSemana(id?: string): PerfilHorasContrato {
  return (id && PERFILES_HORAS[id]) || PERFIL_HORAS_HISTORICO_31
}

export interface ContratoHoras {
  tipo: TipoContrato
  objetivoHoras: number
  maximoHoras: number
  /** min(objetivo, máximo): lo que el motor puede asignar. */
  topeHoras: number
  /** Configuración a revisar (p. ej. ficha por encima del máximo del perfil). */
  avisos: string[]
}

const SLOTS_POR_HORA = 2

/**
 * Contrato efectivo de una persona: objetivo = horas de su ficha (o el default del
 * perfil si no hay dato válido); nunca por encima del máximo del perfil. Las horas
 * se redondean hacia abajo a medias horas (la grilla del motor es de 30 min).
 */
export function resolverContratoHoras(
  tipo: TipoContrato, horasFicha: number | undefined, perfil: PerfilHorasContrato = PERFIL_HORAS_VIGENTE,
): ContratoHoras {
  const maximo = perfil.maximoHoras[tipo]
  const avisos: string[] = []
  const valida = typeof horasFicha === 'number' && Number.isFinite(horasFicha) && horasFicha > 0
  let objetivo = valida ? Math.floor(horasFicha * SLOTS_POR_HORA) / SLOTS_POR_HORA : perfil.objetivoPorDefecto[tipo]
  if (!valida) avisos.push(`Sin horas en la ficha: se usa el objetivo del perfil (${objetivo} h).`)
  if (objetivo > maximo) {
    avisos.push(`La ficha indica ${objetivo} h y el máximo ${tipo} del perfil es ${maximo} h: se planifica con ${maximo} h.`)
    objetivo = maximo
  }
  return { tipo, objetivoHoras: objetivo, maximoHoras: maximo, topeHoras: Math.min(objetivo, maximo), avisos }
}

/** Contrato expresado en slots de 30 min para el motor. */
export interface ContratoSlots {
  objetivoSlots: number
  maximoSlots: number
}

export const aSlots = (c: ContratoHoras): ContratoSlots => ({
  objetivoSlots: Math.round(c.objetivoHoras * SLOTS_POR_HORA),
  maximoSlots: Math.round(c.topeHoras * SLOTS_POR_HORA),
})

/** Resultado por persona: objetivo vs asignado y motivo si no se cumple. */
export interface CumplimientoHoras {
  colab_id: string
  tipo: TipoContrato
  objetivoHoras: number
  maximoHoras: number
  asignadasHoras: number
  /** objetivo − asignadas (> 0 = faltan horas). */
  diferenciaHoras: number
  /** Máximo que permiten las restricciones duras y reglas de la persona, sin mirar cobertura. */
  factibleHoras?: number
  motivo?: string
}
