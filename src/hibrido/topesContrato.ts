/**
 * Edición local de los topes semanales de caja EVENTUAL por sucursal y contrato de origen (AH2-037/040).
 * Decisión del propietario (20/11/2026): opcionales, editables y desactivables por sucursal, sin recarga semanal;
 * son MÁXIMOS (nunca mínimos ni objetivos). Desactivar no es 0 y conserva el valor para reactivar.
 * Sin persistencia: produce la configuración que viaja en la entrada (`topes_caja_eventual_contrato`).
 */
import {resolverTopesContrato,validarTopesContrato,type ContratoOrigen,type TopeClase,type TopesCajaEventualContrato} from '../algoritmo/disponibilidadCajaEventual'

export interface EdicionTopes {FULL:TopeClase;PART:TopeClase}
export const SIN_TOPES:EdicionTopes={FULL:{activo:false,horas:null},PART:{activo:false,horas:null}}

/** Valores vigentes para la sucursal y semana (o sin topes si no hay configuración). */
export function topesVigentes(cfg:TopesCajaEventualContrato|undefined,sucursal:string,semana:string):EdicionTopes{
 const c=cfg?resolverTopesContrato(validarTopesContrato(cfg),semana,sucursal):null
 return c?{FULL:{...c.FULL},PART:{...c.PART}}:structuredClone(SIN_TOPES)
}

/**
 * Aplica una edición. Si hay configuración vigente para la sucursal y semana, se edita en su lugar (misma vigencia:
 * rige para las semanas siguientes sin recargar); si no, se crea una abierta desde la semana. Otras sucursales y
 * vigencias no se tocan. Valida el resultado (activo con horas 0–84 en múltiplos de 0,5).
 */
export function editarTopes(cfg:TopesCajaEventualContrato|undefined,sucursal:string,semana:string,e:EdicionTopes,fuente='edición local de laboratorio'):TopesCajaEventualContrato{
 const base:TopesCajaEventualContrato=cfg?structuredClone(cfg):{version:1,configuraciones:[]}
 const vigente=resolverTopesContrato(validarTopesContrato(base),semana,sucursal)
 const valores={FULL:{activo:e.FULL.activo,horas:e.FULL.horas??null},PART:{activo:e.PART.activo,horas:e.PART.horas??null}}
 if(vigente)Object.assign(base.configuraciones[base.configuraciones.indexOf(vigente)],valores,{fuente})
 else base.configuraciones.push({sucursalId:sucursal,vigenciaDesde:semana,vigenciaHasta:null,fuente,...valores})
 return validarTopesContrato(base)
}

export const CONTRATOS:ContratoOrigen[]=['FULL','PART']
