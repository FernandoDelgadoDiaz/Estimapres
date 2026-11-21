import {revalidarIntegrado} from '../hibrido/revalidacionIntegrada'
// PUB-01 (#12, parte sin migración) — Validación de la semana generada/editada
// para la UI y el PDF, usando el validador independiente (VAL-01).
import type { Auxiliar, Colaborador, Eventual, ExcepcionSemanal, Franja, HorarioColaborador, ResultadoAsignacion } from '../types'
import { PERFIL_MOTOR_ACTUAL, perfilNormativoDesdeHoras, validarHorario, type PerfilNormativo, type ResultadoValidacion } from '../algoritmo/validadorIndependiente'
import { horasLegibles, minutosAsignados, resumenHoras } from './horasSemanales'
import { PERFIL_HORAS_VIGENTE, perfilHorasDeSemana, resolverContratoHoras, resolverPerfilHorasSemana } from '../algoritmo/contratos'
import type { HuecoSupervision } from './disponibilidadHabitual'
import { DEFAULTS_OPERATIVOS, normalizarExcepciones, type ConfigOperativa, type MinimoFranja } from './preferencias'

export interface ContextoValidacionSemana {
  necesidad: Franja[]
  excepciones: ExcepcionSemanal[]
  maxFrancosDia?: number
  maxFrancosPorDia?: number[]
  minimosCajeros?: MinimoFranja[]
  semanaAnterior?: HorarioColaborador[]
  /** Alternativa explícita: salida del domingo REAL, por ID; null equivale a franco. */
  finDomingoAnteriorPorId?: Record<string, string | null>
  perfil?: PerfilNormativo
  huecosSupervision?: HuecoSupervision[]
  /**
   * #38 — Configuración operativa EFECTIVA con la que se generó la semana. Si
   * falta (semanas guardadas antes de #38), se usan los valores predeterminados
   * del negocio; la UI lo indica.
   */
  operativa?: Partial<ConfigOperativa>
  /**
   * Semanas guardadas antes de #38 no conservan la disponibilidad resuelta de
   * eventuales (excepciones por fecha): en ese caso no se puede verificar su
   * disponibilidad sin riesgo de falsos positivos y se omite ese control.
   */
  omitirDisponibilidadEventual?: boolean
  /**
   * #38 — Datos que faltan para una validación completa (semanas históricas).
   * Si hay alguna, el resultado nunca es VALIDADO: queda «SIN VERIFICAR» con la
   * limitación explicada, aunque no se detecten violaciones.
   */
  limitaciones?: string[]
  /**
   * #7 — Semana guardada: perfil de horas con que se generó. Si la clave está presente
   * (aunque sea undefined) se resuelve con resolverPerfilHorasSemana: sin id → histórico
   * 31 h; id desconocido → limitación (nunca VALIDADO). Tiene prioridad sobre `perfil`.
   */
  perfilHorasId?: string | null
}

export function operativaEfectiva(op?: Partial<ConfigOperativa>): ConfigOperativa {
  return {
    ...op,
    aperturaSoloAux: op?.aperturaSoloAux ?? DEFAULTS_OPERATIVOS.apertura_solo_aux,
    sinAuxCierre: op?.sinAuxCierre ?? DEFAULTS_OPERATIVOS.sin_aux_cierre,
    supervisorJornadaCompleta: op?.supervisorJornadaCompleta ?? DEFAULTS_OPERATIVOS.supervisor_jornada_completa,
    francoMedioCorridos: op?.francoMedioCorridos ?? DEFAULTS_OPERATIVOS.franco_medio_corridos,
  }
}

export function validarResultadoSemana(
  resultado: ResultadoAsignacion,
  colaboradores: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  ctx: ContextoValidacionSemana,
): ResultadoValidacion {
  if (resultado.hibrido) return revalidarIntegrado(resultado, ctx)
  const roster = [
    ...colaboradores.filter(c => c.tipo === 'FULL' || c.tipo === 'PART').map(c => ({ id: c.id, nombre: c.nombre, contrato: c.tipo as 'FULL' | 'PART' })),
    ...auxiliares.map(a => ({ id: a.id, nombre: a.nombre, contrato: 'AUX' as const, horarioSemanal: a.horarioSemanal })),
    ...eventuales.map(e => ({ id: e.id, nombre: e.nombre, contrato: 'EVENTUAL' as const, horarioSemanal: ctx.omitirDisponibilidadEventual ? undefined : e.horarioSemanal })),
  ]
  let perfil = ctx.perfil ?? PERFIL_MOTOR_ACTUAL
  const limitacionesPerfil: string[] = []
  if ('perfilHorasId' in ctx) {
    const r = resolverPerfilHorasSemana(ctx.perfilHorasId)
    perfil = perfilNormativoDesdeHoras(r.perfil)
    if (r.estado === 'desconocido') limitacionesPerfil.push(`La semana registró el perfil de horas «${ctx.perfilHorasId}», que esta versión no reconoce: no se pueden verificar los topes de horas por contrato.`)
  }
  const validacion = validarHorario({
    horarios: resultado.horarios,
    condicionesSupervisor:resultado.condicionesSupervisor,
    roster,
    perfil,
    excepciones: normalizarExcepciones(ctx.excepciones),
    maxFrancosDia: ctx.maxFrancosDia,
    maxFrancosPorDia: ctx.maxFrancosPorDia,
    necesidad: ctx.necesidad,
    minimosCajeros: ctx.minimosCajeros,
    cajaAux: resultado.cajaAux,
    cajaEventual: resultado.cajaEventual,
    semanaAnterior: ctx.semanaAnterior,
    finDomingoAnteriorPorId: ctx.finDomingoAnteriorPorId,
    operativa: operativaEfectiva(ctx.operativa),
  })
  const horas = validarHorasAsignadas(resultado.horarios, colaboradores, eventuales, perfil.perfilHorasId)
  // H-A2 (supervisión 09–22) ya la calcula el validador sobre la presencia real
  // (incluida la edición manual); del diagnóstico previo solo se agrega H-A1.
  // H-A1 solo existe con «apertura solo AUX» activa (con OFF abre un FULL/PART).
  const op = operativaEfectiva(ctx.operativa)
  const huecos = (ctx.huecosSupervision ?? []).filter(h => h.tipo === 'APERTURA' && op.aperturaSoloAux)
  const limitaciones = [...(resultado.condicionesSupervisor?['Condiciones de supervisor en laboratorio experimental: no publicable automáticamente.']:[]),...(ctx.limitaciones?.filter(Boolean) ?? []), ...limitacionesPerfil]
  const violaciones = [
    ...validacion.violaciones,
    ...horas.violaciones,
    ...huecos.map(h => ({ codigo: 'H-A1', nivel: 'OPERATIVA' as const, dia: h.dia, detalle: h.detalle })),
  ]
  const publicable = validacion.publicable && violaciones.length === validacion.violaciones.length && !limitaciones.length
  return {
    ...validacion,
    advertencias: horas.advertencias,
    ok: publicable,
    publicable,
    violaciones,
    ...(limitaciones.length ? { limitaciones } : {}),
  }
}

export function validarHorasAsignadas(
  horarios: HorarioColaborador[], colaboradores: Colaborador[], eventuales: Eventual[],
  perfilHorasId?: string,
): Pick<ResultadoValidacion, 'violaciones'> & { advertencias: string[] } {
  const perfilHoras = perfilHorasId ? perfilHorasDeSemana(perfilHorasId) : PERFIL_HORAS_VIGENTE
  const porId = new Map(colaboradores.map(c => [c.id, c]))
  const roster = new Map<string, { nombre: string; tipo: string; objetivo?: number }>([
    ...colaboradores.map(c => [c.id, { nombre: c.nombre, tipo: c.tipo, objetivo: c.horasSemanales }] as const),
    ...eventuales.map(e => [e.id, { nombre: e.nombre, tipo: 'EVENTUAL', objetivo: e.maxHorasSemanales }] as const),
  ])
  const violaciones: ResultadoValidacion['violaciones'] = []
  const advertencias: string[] = []
  for (const h of horarios) {
    const persona = roster.get(h.colaboradorId)
    if (!persona) continue
    const { asignados, limite, exceso, preventivo } = resumenHoras(minutosAsignados(h.jornadas), persona.tipo, persona.objetivo)
    if (exceso) violaciones.push({
      codigo: 'OP_HORAS_FICHA', nivel: 'OPERATIVA', colaboradorId: h.colaboradorId,
      detalle: `${persona.nombre}: ${horasLegibles(asignados)} asignadas. Límite en ficha: ${limite} h.`,
    })
    if (preventivo) advertencias.push(`${persona.nombre}: ${horasLegibles(asignados)} asignadas. Supera 48 h (aviso preventivo).`)
    // #7: PART por debajo de su objetivo de horas (ficha acotada al máximo del perfil).
    const c = porId.get(h.colaboradorId)
    if (c?.tipo === 'PART') {
      const contrato = resolverContratoHoras('PART', c.horasSemanales, perfilHoras)
      // #7: ficha sin dato o inválida → dato a corregir (bloquea publicación); nunca se asume un objetivo.
      if (contrato.estadoFicha !== 'valida') violaciones.push({
        codigo: 'DATOS_HORAS_FICHA', nivel: 'DATOS', colaboradorId: h.colaboradorId,
        detalle: `${persona.nombre}: ${contrato.avisos[0]}`,
      })
      else for (const aviso of contrato.avisos) advertencias.push(`${persona.nombre}: ${aviso}`)
      const faltan = contrato.objetivoHoras === null ? 0 : Math.round(contrato.objetivoHoras * 60) - asignados
      if (faltan > 0) advertencias.push(`${persona.nombre}: ${horasLegibles(asignados)} asignadas de ${contrato.objetivoHoras} h objetivo (faltan ${horasLegibles(faltan)}).`)
    }
  }
  return { violaciones, advertencias }
}

/** Texto de estado para UI y PDF. */
/**
 * Estado en lenguaje del supervisor (AH2-044): sin códigos ni perfiles normativos.
 * «Listo» solo si cumple todas las reglas; si no, «Borrador» con lo que hay que revisar.
 */
export function estadoSupervisor(v: ResultadoValidacion): { listo: boolean; titulo: string; items: string[] } {
  if (v.publicable) return { listo: true, titulo: 'Listo: cumple todas las reglas de la sucursal.', items: v.advertencias ?? [] }
  if (v.violaciones.length === 0 && v.limitaciones?.length) return { listo: false, titulo: 'Falta información para verificar el horario.', items: [...v.limitaciones, ...(v.advertencias ?? [])] }
  const n = v.violaciones.length
  return { listo: false, titulo: `Borrador: ${n === 1 ? 'hay 1 punto' : `hay ${n} puntos`} para revisar antes de publicar.`, items: [...v.violaciones.map(x => x.detalle), ...(v.limitaciones ?? []), ...(v.advertencias ?? [])] }
}

export function estadoValidacion(v: ResultadoValidacion, perfil: PerfilNormativo = PERFIL_MOTOR_ACTUAL): string {
  const base = v.publicable
    ? 'VALIDADO: sin violaciones de reglas'
    : v.violaciones.length === 0 && v.limitaciones?.length
      ? `SIN VERIFICAR: ${v.limitaciones.join(' ')}`
      : `BORRADOR: ${v.violaciones.length} ${v.violaciones.length === 1 ? 'violación' : 'violaciones'} de reglas${v.limitaciones?.length ? ` (además, ${v.limitaciones.length === 1 ? 'una limitación' : `${v.limitaciones.length} limitaciones`} de datos)` : ''}`
  return perfil.estado === 'VALIDADO' ? base : `${base} (perfil normativo pendiente de validación jurídica)`
}
