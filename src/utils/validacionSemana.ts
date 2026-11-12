// PUB-01 (#12, parte sin migración) — Validación de la semana generada/editada
// para la UI y el PDF, usando el validador independiente (VAL-01).
import type { Auxiliar, Colaborador, Eventual, ExcepcionSemanal, Franja, HorarioColaborador, ResultadoAsignacion } from '../types'
import { PERFIL_MOTOR_ACTUAL, validarHorario, type PerfilNormativo, type ResultadoValidacion } from '../algoritmo/validadorIndependiente'
import type { HuecoSupervision } from './disponibilidadHabitual'
import { normalizarExcepciones, type MinimoFranja } from './preferencias'

export interface ContextoValidacionSemana {
  necesidad: Franja[]
  excepciones: ExcepcionSemanal[]
  maxFrancosDia?: number
  minimosCajeros?: MinimoFranja[]
  semanaAnterior?: HorarioColaborador[]
  perfil?: PerfilNormativo
  huecosSupervision?: HuecoSupervision[]
}

export function validarResultadoSemana(
  resultado: ResultadoAsignacion,
  colaboradores: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  ctx: ContextoValidacionSemana,
): ResultadoValidacion {
  const roster = [
    ...colaboradores.filter(c => c.tipo === 'FULL' || c.tipo === 'PART').map(c => ({ id: c.id, nombre: c.nombre, contrato: c.tipo as 'FULL' | 'PART' })),
    ...auxiliares.map(a => ({ id: a.id, nombre: a.nombre, contrato: 'AUX' as const })),
    ...eventuales.map(e => ({ id: e.id, nombre: e.nombre, contrato: 'EVENTUAL' as const })),
  ]
  const validacion = validarHorario({
    horarios: resultado.horarios,
    roster,
    perfil: ctx.perfil ?? PERFIL_MOTOR_ACTUAL,
    excepciones: normalizarExcepciones(ctx.excepciones),
    maxFrancosDia: ctx.maxFrancosDia,
    necesidad: ctx.necesidad,
    minimosCajeros: ctx.minimosCajeros,
    cajaAux: resultado.cajaAux,
    cajaEventual: resultado.cajaEventual,
    semanaAnterior: ctx.semanaAnterior,
  })
  if (!ctx.huecosSupervision?.length) return validacion
  return {
    ...validacion,
    ok: false,
    publicable: false,
    violaciones: [
      ...validacion.violaciones,
      ...ctx.huecosSupervision.map(h => ({
        codigo: h.tipo === 'APERTURA' ? 'H-A1' : 'H-A2',
        nivel: 'OPERATIVA' as const,
        dia: h.dia,
        detalle: h.detalle,
      })),
    ],
  }
}

/** Texto de estado para UI y PDF. */
export function estadoValidacion(v: ResultadoValidacion, perfil: PerfilNormativo = PERFIL_MOTOR_ACTUAL): string {
  const base = v.publicable
    ? 'VALIDADO: sin violaciones de reglas'
    : `BORRADOR: ${v.violaciones.length} ${v.violaciones.length === 1 ? 'violación' : 'violaciones'} de reglas`
  return perfil.estado === 'VALIDADO' ? base : `${base} (perfil normativo pendiente de validación jurídica)`
}
