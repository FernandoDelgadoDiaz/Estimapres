// AH2 · Tramo B1 — Máquina de estados de una versión de horario (AH2-028, AH2-029, AH2-033).
//
//   BORRADOR ──validar──► VALIDADO ──aprobar──► APROBADO ──publicar (solo servidor)──► PUBLICADO
//      ▲                     │                     │
//      └─── editar / validación caducada ──────────┘
//   DESCARTADO ◄── descartar (BORRADOR | VALIDADO | APROBADO)
//   REEMPLAZADO_TOTAL ◄── todos sus tramos anulados antes de empezar (lo decide la vigencia)
//
// Reglas que el núcleo garantiza (invariantes del diseño v3):
//  - I0  Una versión de «prueba-local» nunca llega a PUBLICADO. Lo oficial exige ámbito
//        «servidor» y una revalidación hecha en el servidor (P2 la implementará).
//  - I2  Solo se publica lo VALIDADO con huella vigente y aprobado por una persona con rol.
//  - I3  Lo publicado es inmutable.
//  - I8  Ningún agente (ni proceso automático) aprueba, publica ni descarta.
//  - D4  Una semana legada (anterior al flujo) se preserva, pero no se publica en forma retroactiva.
//  - VALIDADO significa validación TÉCNICA contra el perfil configurado, no conformidad
//    jurídica (AH2-033).
import { type ErrorPlanificacion, type Resultado, falla, ok } from './errores'
import type { Fecha } from './fechas'

export type Ambito = 'prueba-local' | 'servidor'
export type EstadoVersion = 'BORRADOR' | 'VALIDADO' | 'APROBADO' | 'PUBLICADO' | 'REEMPLAZADO_TOTAL' | 'DESCARTADO'
export type Rol = 'admin-empresa' | 'director-regional' | 'supervisor' | 'aprobador' | 'auditor'

export interface Actor {
  tipo: 'persona' | 'agente' | 'sistema'
  id: string
  rol?: Rol
}

/** Resultado del validador técnico independiente sobre unas entradas con huella. */
export interface ResultadoValidacionTecnica {
  estado: 'VALIDADO' | 'BORRADOR' | 'SIN VERIFICAR'
  /** Huella total de las entradas que se validaron. */
  huella: string
  validadorVersion: string
  donde: 'cliente' | 'servidor'
  en: string
}

export interface VersionPlan {
  id: string
  sucursalId: string
  cicloId: string | null
  fechaLunes: Fecha
  numero: number
  ambito: Ambito
  estado: EstadoVersion
  /** Huella total vigente de las entradas (horario y todo lo que lo condiciona). */
  huellaEntradas: string
  validacionTecnica?: ResultadoValidacionTecnica
  creadaPor: string
  aprobadaPor?: string
  basadaEn?: string
  replanificaDesde?: Fecha
  /** Semana guardada antes del flujo de publicación (D4): se preserva, nunca se publica. */
  legado?: boolean
}

export interface EventoFlujo {
  versionId: string
  de: EstadoVersion
  a: EstadoVersion
  accion: Accion['tipo'] | 'caducar'
  actor: Actor
  en: string
  motivo?: string
  resumenValidacion?: string
}

export interface PoliticaAprobacion {
  /** D3: si el creador puede aprobar su propia versión (configurable por sucursal). */
  aprobacionPropiaPermitida: boolean
}

export type Accion =
  | { tipo: 'validar'; resultado: ResultadoValidacionTecnica }
  | { tipo: 'aprobar'; huellaActual: string }
  | { tipo: 'publicar'; huellaActual: string; revalidacionServidor?: ResultadoValidacionTecnica }
  | { tipo: 'descartar'; motivo?: string }
  | { tipo: 'editar'; nuevaHuella: string }
  | { tipo: 'marcar-reemplazo-total'; publicacionId: string }

export interface ContextoTransicion {
  actor: Actor
  en: string
  politica: PoliticaAprobacion
}

export interface Transicion { version: VersionPlan; evento: EventoFlujo }

const ROLES_APROBAR: readonly Rol[] = ['aprobador', 'director-regional', 'admin-empresa']
const ROLES_PUBLICAR: readonly Rol[] = ['aprobador', 'director-regional', 'admin-empresa']
const ROLES_DESCARTAR: readonly Rol[] = ['supervisor', 'aprobador', 'director-regional', 'admin-empresa']

/** ¿La validación técnica de la versión sigue vigente para la huella actual de sus entradas? */
export function validacionVigente(v: VersionPlan, huellaActual: string): boolean {
  return v.validacionTecnica?.estado === 'VALIDADO'
    && v.validacionTecnica.huella === v.huellaEntradas
    && v.huellaEntradas === huellaActual
}

/**
 * Si las entradas cambiaron (otra regla, roster, ausencia, demanda o el propio horario), una
 * versión VALIDADA o APROBADA vuelve a BORRADOR: «validación caducada». No afecta a PUBLICADO
 * (inmutable) ni a estados históricos.
 */
export function revisarCaducidad(v: VersionPlan, huellaActual: string, ctx: Pick<ContextoTransicion, 'en'>): Transicion | null {
  if ((v.estado === 'VALIDADO' || v.estado === 'APROBADO') && !validacionVigente(v, huellaActual)) {
    const version: VersionPlan = { ...v, estado: 'BORRADOR', huellaEntradas: huellaActual, aprobadaPor: undefined }
    return { version, evento: { versionId: v.id, de: v.estado, a: 'BORRADOR', accion: 'caducar', actor: { tipo: 'sistema', id: 'caducidad' }, en: ctx.en, motivo: 'Cambiaron las entradas validadas: la validación técnica caducó.' } }
  }
  return null
}

const err = (codigo: ErrorPlanificacion['codigo'], mensaje: string, v: VersionPlan, extra: Record<string, unknown> = {}) =>
  falla<Transicion>(codigo, mensaje, { versionId: v.id, estado: v.estado, ...extra })

const persona = (a: Actor) => a.tipo === 'persona'

export function transicionar(v: VersionPlan, accion: Accion, ctx: ContextoTransicion): Resultado<Transicion> {
  const { actor } = ctx
  const evento = (a: EstadoVersion, extra: Partial<EventoFlujo> = {}): EventoFlujo =>
    ({ versionId: v.id, de: v.estado, a, accion: accion.tipo, actor, en: ctx.en, ...extra })

  switch (accion.tipo) {
    case 'editar': {
      if (v.estado === 'PUBLICADO' || v.estado === 'REEMPLAZADO_TOTAL') {
        return err('PUBLICADO_INMUTABLE', 'Un horario publicado no se edita: hay que crear una versión nueva que lo reemplace.', v)
      }
      if (v.estado === 'DESCARTADO') return err('TRANSICION_INVALIDA', 'Una versión descartada no se edita.', v)
      const version: VersionPlan = { ...v, estado: 'BORRADOR', huellaEntradas: accion.nuevaHuella, aprobadaPor: undefined, validacionTecnica: undefined }
      return ok({ version, evento: evento('BORRADOR') })
    }

    case 'validar': {
      if (v.estado !== 'BORRADOR') return err('TRANSICION_INVALIDA', `Solo se valida un BORRADOR (estado actual: ${v.estado}).`, v)
      if (actor.tipo !== 'sistema') return err('ROL_NO_AUTORIZADO', 'La validación técnica la registra el sistema a partir del validador independiente.', v)
      const r = accion.resultado
      if (r.huella !== v.huellaEntradas) {
        return err('VALIDACION_SIN_HUELLA', 'La validación corresponde a otras entradas (huella distinta): no se puede registrar.', v, { huellaValidada: r.huella, huellaVersion: v.huellaEntradas })
      }
      if (r.estado !== 'VALIDADO') {
        return err('VALIDACION_NO_SUPERADA', `La validación técnica no se superó (${r.estado}): la versión sigue en BORRADOR.`, v, { resultado: r.estado })
      }
      return ok({ version: { ...v, estado: 'VALIDADO', validacionTecnica: r }, evento: evento('VALIDADO', { resumenValidacion: `Validado técnicamente (${r.donde}, validador ${r.validadorVersion}).` }) })
    }

    case 'aprobar': {
      if (v.estado !== 'VALIDADO') return err('TRANSICION_INVALIDA', `Solo se aprueba una versión VALIDADA (estado actual: ${v.estado}).`, v)
      if (!persona(actor)) return err('ACTOR_NO_HUMANO', 'Solo una persona puede aprobar un horario.', v, { actor: actor.tipo })
      const propia = actor.id === v.creadaPor
      // D3: habilitar la aprobación propia NO da permiso para aprobar horarios ajenos.
      //  - aprobador / director-regional / admin-empresa: aprueban horarios ajenos; los propios solo
      //    si la sucursal lo permite;
      //  - supervisor: SOLO su propia versión y SOLO si la sucursal lo permite;
      //  - cualquier otro rol (auditor): nunca.
      if (actor.rol !== undefined && ROLES_APROBAR.includes(actor.rol)) {
        if (propia && !ctx.politica.aprobacionPropiaPermitida) {
          return err('APROBACION_PROPIA_NO_PERMITIDA', 'La sucursal no permite aprobar un horario creado por la misma persona.', v)
        }
      } else if (actor.rol === 'supervisor') {
        if (!propia) {
          return err('ROL_NO_AUTORIZADO', 'Un supervisor solo puede aprobar su propio horario (si la sucursal lo permite); los horarios de otras personas requieren rol aprobador.', v, { rol: actor.rol })
        }
        if (!ctx.politica.aprobacionPropiaPermitida) {
          return err('APROBACION_PROPIA_NO_PERMITIDA', 'La sucursal no permite aprobar un horario creado por la misma persona.', v)
        }
      } else {
        return err('ROL_NO_AUTORIZADO', 'El rol del usuario no permite aprobar horarios en esta sucursal.', v, { rol: actor.rol })
      }
      if (!validacionVigente(v, accion.huellaActual)) return err('VALIDACION_CADUCADA', 'Las entradas cambiaron desde la validación: hay que volver a validar.', v)
      return ok({ version: { ...v, estado: 'APROBADO', aprobadaPor: actor.id }, evento: evento('APROBADO') })
    }

    case 'publicar': {
      if (v.legado) return err('LEGADO_NO_PUBLICABLE', 'Una semana anterior al flujo de publicación se conserva, pero no se publica en forma retroactiva.', v)
      if (v.ambito !== 'servidor') return err('PUBLICACION_LOCAL_PROHIBIDA', 'Una versión de prueba local nunca es oficial: la publicación solo ocurre en el servidor.', v)
      if (v.estado !== 'APROBADO') return err('TRANSICION_INVALIDA', `Solo se publica una versión APROBADA (estado actual: ${v.estado}).`, v)
      if (!persona(actor)) return err('ACTOR_NO_HUMANO', 'Solo una persona puede publicar un horario.', v, { actor: actor.tipo })
      if (!actor.rol || !ROLES_PUBLICAR.includes(actor.rol)) return err('ROL_NO_AUTORIZADO', 'El rol del usuario no permite publicar horarios.', v, { rol: actor.rol })
      const rv = accion.revalidacionServidor
      if (!rv || rv.donde !== 'servidor') {
        return err('PUBLICACION_SIN_REVALIDACION_SERVIDOR', 'Publicar exige revalidar en el servidor con el mismo validador.', v)
      }
      if (rv.estado !== 'VALIDADO' || rv.huella !== accion.huellaActual || !validacionVigente(v, accion.huellaActual)) {
        return err('VALIDACION_CADUCADA', 'La revalidación en el servidor no coincide con las entradas aprobadas.', v)
      }
      return ok({ version: { ...v, estado: 'PUBLICADO', validacionTecnica: rv }, evento: evento('PUBLICADO', { resumenValidacion: `Revalidado técnicamente en el servidor (validador ${rv.validadorVersion}).` }) })
    }

    case 'descartar': {
      if (!['BORRADOR', 'VALIDADO', 'APROBADO'].includes(v.estado)) return err('TRANSICION_INVALIDA', `No se puede descartar una versión en estado ${v.estado}.`, v)
      if (!persona(actor)) return err('ACTOR_NO_HUMANO', 'Solo una persona puede descartar una versión.', v, { actor: actor.tipo })
      if (!actor.rol || !ROLES_DESCARTAR.includes(actor.rol)) return err('ROL_NO_AUTORIZADO', 'El rol del usuario no permite descartar versiones.', v, { rol: actor.rol })
      return ok({ version: { ...v, estado: 'DESCARTADO' }, evento: evento('DESCARTADO', accion.motivo ? { motivo: accion.motivo } : {}) })
    }

    case 'marcar-reemplazo-total': {
      if (v.estado !== 'PUBLICADO') return err('TRANSICION_INVALIDA', 'Solo una versión publicada puede quedar reemplazada.', v)
      if (actor.tipo !== 'sistema') return err('ROL_NO_AUTORIZADO', 'El reemplazo total lo registra el sistema al recortar la vigencia.', v)
      return ok({ version: { ...v, estado: 'REEMPLAZADO_TOTAL' }, evento: evento('REEMPLAZADO_TOTAL', { motivo: `Todos sus tramos fueron anulados por la publicación ${accion.publicacionId}.` }) })
    }
  }
}

/** Preserva una semana guardada antes del flujo (D4): borrador legado, nunca publicable. */
export function versionDesdeLegado(p: { id: string; sucursalId: string; fechaLunes: Fecha; numero: number; huellaEntradas: string; creadaPor?: string }): VersionPlan {
  return { ...p, cicloId: null, ambito: 'prueba-local', estado: 'BORRADOR', creadaPor: p.creadaPor ?? 'legado', legado: true }
}
