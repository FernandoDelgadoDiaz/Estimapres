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

export type EstadoPerfilSemana = 'registrado' | 'historico' | 'desconocido'

/**
 * Perfil con el que se valida una semana guardada:
 *  - con `perfilHorasId` conocido → ese perfil ('registrado');
 *  - SIN identificador (semanas anteriores al registro) → histórico 31 h ('historico');
 *  - con un identificador DESCONOCIDO → no se adivina: se usa el vigente solo para
 *    poder mostrar algo y se marca 'desconocido' (la validación lo informa como
 *    limitación y nunca declara VALIDADO).
 */
export function resolverPerfilHorasSemana(id?: string | null): { perfil: PerfilHorasContrato; estado: EstadoPerfilSemana } {
  if (id === undefined || id === null || id === '') return { perfil: PERFIL_HORAS_HISTORICO_31, estado: 'historico' }
  const perfil = PERFILES_HORAS[id]
  return perfil ? { perfil, estado: 'registrado' } : { perfil: PERFIL_HORAS_VIGENTE, estado: 'desconocido' }
}

/** Atajo: perfil efectivo de una semana guardada (ver resolverPerfilHorasSemana). */
export function perfilHorasDeSemana(id?: string | null): PerfilHorasContrato {
  return resolverPerfilHorasSemana(id).perfil
}

/** Estado del dato de horas de la ficha. */
export type EstadoFichaHoras = 'valida' | 'faltante' | 'invalida'

export interface ContratoHoras {
  tipo: TipoContrato
  estadoFicha: EstadoFichaHoras
  /** Valor tal como vino en la ficha (para mensajes). */
  horasFicha?: unknown
  /** Horas a cumplir; null si la ficha no informa un objetivo válido. */
  objetivoHoras: number | null
  maximoHoras: number
  /** Lo que el motor puede asignar: min(objetivo, máximo), o el máximo si no hay objetivo. */
  topeHoras: number
  /** Configuración a revisar (ficha faltante, inválida, excesiva o fuera de la grilla). */
  avisos: string[]
}

const SLOTS_POR_HORA = 2

/**
 * Contrato efectivo de una persona (#7):
 *  - ficha VÁLIDA (número > 0): objetivo = ficha (a medias horas hacia abajo), nunca
 *    por encima del máximo del perfil (se avisa si la ficha lo supera);
 *  - ficha FALTANTE (sin dato) o INVÁLIDA (0, negativo, no numérico): NO se inventa un
 *    objetivo. Se planifica sin objetivo de horas, hasta el máximo del perfil, y la
 *    validación lo informa como dato a completar (bloquea la publicación).
 */
export function resolverContratoHoras(
  tipo: TipoContrato, horasFicha: unknown, perfil: PerfilHorasContrato = PERFIL_HORAS_VIGENTE,
): ContratoHoras {
  const maximo = perfil.maximoHoras[tipo]
  if (horasFicha === undefined || horasFicha === null || horasFicha === '') {
    return {
      tipo, estadoFicha: 'faltante', horasFicha, objetivoHoras: null, maximoHoras: maximo, topeHoras: maximo,
      avisos: [`La ficha no informa horas semanales: se planifica sin objetivo de horas (hasta ${maximo} h, máximo ${tipo} del perfil). Completar la ficha.`],
    }
  }
  if (typeof horasFicha !== 'number' || !Number.isFinite(horasFicha) || horasFicha <= 0) {
    return {
      tipo, estadoFicha: 'invalida', horasFicha, objetivoHoras: null, maximoHoras: maximo, topeHoras: maximo,
      avisos: [`La ficha informa «${String(horasFicha)}» horas semanales, que no es un objetivo válido: se planifica sin objetivo (hasta ${maximo} h). Corregir la ficha.`],
    }
  }
  const avisos: string[] = []
  let objetivo = Math.floor(horasFicha * SLOTS_POR_HORA) / SLOTS_POR_HORA
  if (objetivo !== horasFicha) avisos.push(`La ficha indica ${horasFicha} h; la grilla es de 30 min: se usan ${objetivo} h.`)
  if (objetivo > maximo) {
    avisos.push(`La ficha indica ${objetivo} h y el máximo ${tipo} del perfil es ${maximo} h: se planifica con ${maximo} h.`)
    objetivo = maximo
  }
  return { tipo, estadoFicha: 'valida', horasFicha, objetivoHoras: objetivo, maximoHoras: maximo, topeHoras: objetivo, avisos }
}

/** Contrato expresado en slots de 30 min para el motor. */
export interface ContratoSlots {
  /** null = sin objetivo (ficha faltante o inválida): no se fuerza ninguna cantidad de horas. */
  objetivoSlots: number | null
  maximoSlots: number
  estadoFicha?: EstadoFichaHoras
}

export const aSlots = (c: ContratoHoras): ContratoSlots => ({
  objetivoSlots: c.objetivoHoras === null ? null : Math.round(c.objetivoHoras * SLOTS_POR_HORA),
  maximoSlots: Math.round(c.topeHoras * SLOTS_POR_HORA),
  estadoFicha: c.estadoFicha,
})

/** Resultado por persona: objetivo vs asignado y motivo si no se cumple. */
export interface CumplimientoHoras {
  colab_id: string
  /** Nombre visible (para regenerar avisos tras una edición). */
  nombre?: string
  tipo: TipoContrato
  estadoFicha?: EstadoFichaHoras
  /** null si la ficha no tiene un objetivo válido. */
  objetivoHoras: number | null
  maximoHoras: number
  asignadasHoras: number
  /** objetivo − asignadas (> 0 = faltan horas); null sin objetivo. */
  diferenciaHoras: number | null
  /** Máximo que permiten las restricciones duras y reglas de la persona, sin mirar cobertura. */
  factibleHoras?: number
  motivo?: string
}

/**
 * Costo de priorizar las horas objetivo sobre la cobertura (#7, AH2-020 PROPUESTO):
 * compara el resultado real con la alternativa sin prioridad de horas (mismas reglas).
 */
export interface ImpactoPrioridadHoras {
  coberturaConPrioridadPct: number
  coberturaSinPrioridadPct: number
  faltantesConPrioridadHoras: number
  faltantesSinPrioridadHoras: number
  sobrantesConPrioridadHoras: number
  sobrantesSinPrioridadHoras: number
  /** Franjas (día, slot) que la prioridad de horas deja con más faltante. */
  franjasPeores: Array<{ dia: number; slot: number; antes: number; despues: number; pico: boolean }>
  /** Objetivo operativo de cobertura (091: 95 %). */
  coberturaObjetivoPct: number
}

/** Recalcula el cumplimiento a partir de las horas realmente asignadas (tras una edición). */
export function recalcularCumplimiento(
  previo: CumplimientoHoras[] | undefined, horasAsignadas: (id: string) => number | undefined,
): CumplimientoHoras[] | undefined {
  if (!previo) return previo
  return previo.map(c => {
    const asignadas = horasAsignadas(c.colab_id)
    if (asignadas === undefined || asignadas === c.asignadasHoras) return c
    return {
      ...c,
      asignadasHoras: asignadas,
      diferenciaHoras: c.objetivoHoras === null ? null : c.objetivoHoras - asignadas,
      factibleHoras: undefined,
      motivo: 'Jornadas modificadas manualmente después de generar.',
    }
  })
}

export const PREFIJO_AVISO_HORAS = 'Horas '
/** Avisos «Horas PART (Nombre): X h de Y h objetivo. motivo» para cada objetivo no alcanzado. */
export function avisosCumplimiento(c?: CumplimientoHoras[]): string[] {
  return (c ?? []).filter(x => (x.diferenciaHoras ?? 0) > 0).map(x =>
    `${PREFIJO_AVISO_HORAS}${x.tipo} (${x.nombre ?? x.colab_id}): ${x.asignadasHoras} h de ${x.objetivoHoras} h objetivo. ${x.motivo ?? ''}`.trim())
}
/** ¿El aviso proviene del cumplimiento de horas o del impacto de su prioridad (#7)? Se regeneran tras editar. */
export function esAvisoDeHoras(a: string): boolean {
  return /^Horas (PART|FULL) \(/.test(a) || a.startsWith('Prioridad de horas PART:')
}
