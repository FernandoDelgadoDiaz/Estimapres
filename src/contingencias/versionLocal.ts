import { aplicarPublicacion, type EstadoVigencia } from '../planificacion/vigencia'
import { sumarDias } from '../planificacion/fechas'
import { type SolicitudContingencia, preparar } from './modelo'
import { repararA, validarLocal } from './reparar'

export function aprobarPrueba(solicitud: SolicitudContingencia, resultado: ReturnType<typeof repararA>, actor: string, instante: string, numero: number) {
  if (!actor.trim() || resultado.solicitud !== JSON.stringify(solicitud) ||
      !resultado.desde || resultado.errores.length || validarLocal(solicitud,resultado.plan).length) {
    throw Error('La propuesta no se puede aprobar')
  }
  const { p, hoy, modificable, fechas } = preparar(solicitud)
  const sucursalId = solicitud.snapshot.profile.branch_id
  const versionOriginal = `comunicada-${p.semana}`
  const version = `simulada-${numero}`
  const original: EstadoVigencia = { sucursalId, revision: 0, tramos: [{
    id: 'tramo-comunicado', sucursalId, publicacionId: 'comunicacion-simulada', versionId: versionOriginal,
    desde: p.semana, hasta: sumarDias(p.semana,6), hastaEfectivo: sumarDias(p.semana,6)
  }] }
  const tramos: { versionId: string; desde: string; hasta: string }[] = []
  fechas.forEach((f,d) => {
    if (!modificable[d]) return
    if (modificable[d-1]) tramos[tramos.length-1].hasta = f
    else tramos.push({ versionId: version, desde:f, hasta:f })
  })
  const vista = aplicarPublicacion(original, {
    publicacionId: `vista-${numero}`, sucursalId, revisionEsperada: 0, hoy,
    tramos,
  })
  if (!vista.ok) throw Error('El intervalo propuesto es inválido')
  return structuredClone({
    ambito: 'prueba-local' as const, estado: 'APROBADO' as const, version, basadaEn: versionOriginal,
    replanificaDesde: resultado.desde, actor, instante, aviso: solicitud.aviso,
    original: solicitud.snapshot.baseline, plan: resultado.plan, ausenciaIds: solicitud.ausencias.map(a => a.id),
    motivo: 'contingencia' as const, antes: resultado.antes, despues: resultado.despues,
    vigenciaHipotetica: [...vista.valor.estado.tramos].sort((a,b) => a.desde.localeCompare(b.desde)),
    recortesSimulados: vista.valor.recortes,
  })
}
