/**
 * Configuración simple del supervisor (AH2-044) sobre la configuración persistente del motor (AH2-042).
 * La pantalla muestra campos; estas funciones traducen cada cambio a las mismas operaciones atómicas con
 * historial y simulación de conflictos (`aplicarCambio`). Nada se borra y nada se prorratea.
 * Regla: un cambio permanente rige desde el próximo lunes (los máximos semanales son por semana completa).
 */
import {sumarDias,type Cambio,type FilaConfigMotor,type FranjaApertura,type NuevaFila,type TipoConfig} from './configuracionPersistente'

export const MOTIVO_SUPERVISOR='Configuración del supervisor'

/** Lunes de la semana siguiente a `hoy` (YYYY-MM-DD). */
export function proximoLunesISO(hoy=new Date()){
 const d=new Date(Date.UTC(hoy.getFullYear(),hoy.getMonth(),hoy.getDate()))
 d.setUTCDate(d.getUTCDate()+(7-((d.getUTCDay()+6)%7)))
 return d.toISOString().slice(0,10)
}

/** Regla permanente que rige en `fecha` para el tipo y persona (la de inicio más reciente). */
export function permanenteVigente(filas:FilaConfigMotor[],tipo:TipoConfig,fecha:string,colaborador:string|null=null){
 return filas.filter(f=>f.activa&&f.clase==='permanente'&&f.tipo===tipo&&(f.colaborador_id??null)===colaborador&&f.vigencia_desde<=fecha&&(f.vigencia_hasta===null||f.vigencia_hasta>=fecha))
  .sort((a,b)=>b.vigencia_desde.localeCompare(a.vigencia_desde))[0]
}

/**
 * Cambio para dejar una regla permanente con estos datos desde `desde`:
 * reemplaza la vigente (queda en el historial) o crea una nueva si no había.
 */
export function cambioPermanente(filas:FilaConfigMotor[],tipo:TipoConfig,datos:Record<string,unknown>,sucursal:string,desde:string,colaborador:string|null=null):Cambio{
 const fila:NuevaFila={sucursal_id:sucursal,clase:'permanente',tipo,colaborador_id:colaborador,vigencia_desde:desde,vigencia_hasta:null,datos,motivo:MOTIVO_SUPERVISOR}
 // La vigente hoy o una ya programada para más adelante: se reemplaza la de inicio más reciente.
 const anterior=filas.filter(f=>f.activa&&f.clase==='permanente'&&f.tipo===tipo&&(f.colaborador_id??null)===colaborador&&f.vigencia_hasta===null)
  .sort((a,b)=>b.vigencia_desde.localeCompare(a.vigencia_desde))[0]
 return anterior?{tipo:'reemplazar',anterior,fila}:{tipo:'crear',fila}
}

export interface TopeSimple {activo:boolean;horas:number|null}
export const datosTopes=(full:TopeSimple,part:TopeSimple)=>({FULL:{activo:full.activo,horas:full.activo?full.horas:null},PART:{activo:part.activo,horas:part.activo?part.horas:null}})
export function leerTopes(fila?:FilaConfigMotor):{FULL:TopeSimple;PART:TopeSimple}|null{
 if(!fila)return null
 const d=fila.datos as {FULL:TopeSimple;PART:TopeSimple}
 return {FULL:{activo:!!d.FULL?.activo,horas:d.FULL?.horas??null},PART:{activo:!!d.PART?.activo,horas:d.PART?.horas??null}}
}

/** Franjas de AUX único: valida que cada franja tenga fin posterior al inicio y ordena por día y hora. */
export function normalizarFranjas(franjas:FranjaApertura[]):{ok:true;franjas:FranjaApertura[]}|{ok:false;error:string}{
 for(const f of franjas)if(f.hasta<=f.desde)return {ok:false,error:'Cada franja debe terminar después de empezar.'}
 return {ok:true,franjas:[...franjas].sort((a,b)=>a.dia-b.dia||a.desde.localeCompare(b.desde))}
}

export type DisponibilidadCaja='TODA_LA_PRESENCIA'|'PRESENCIA_MENOS_RESERVAS'|'NO_ACREDITADA'
/** Nuevo perfil de un eventual cambiando solo su disponibilidad de caja (conserva contrato, máximos y reservas). */
export function datosPerfil(actual:Record<string,unknown>|undefined,acreditacion:DisponibilidadCaja,contratoOrigen:'FULL'|'PART'){
 const base:Record<string,unknown>={...(actual??{}),acreditacion,contratoOrigen:(actual?.contratoOrigen as string|undefined)??contratoOrigen,fuente:MOTIVO_SUPERVISOR}
 if(acreditacion!=='PRESENCIA_MENOS_RESERVAS'){delete base.reservas;delete base.horasFuncionHabitualMinimas}
 return base
}

/**
 * «Lo armo yo» para una persona durante semanas completas (el motor no le asigna turnos): excepción temporal
 * de lunes a domingo. `semanas` ≥ 1.
 */
export function filaArmarAMano(sucursal:string,colaboradorId:string,lunes:string,semanas:number,motivo=''):NuevaFila{
 const n=Math.max(1,Math.floor(semanas))
 return {sucursal_id:sucursal,clase:'temporal',tipo:'condicion_supervisor',colaborador_id:colaboradorId,vigencia_desde:lunes,vigencia_hasta:sumarDias(lunes,7*n-1),
  datos:{id:`manual-${colaboradorId.slice(0,8)}-${lunes}`,modo:'DEBE',tipo:'exclusion_manual',colaboradorId},motivo:motivo.trim()||MOTIVO_SUPERVISOR}
}

/** Excepciones temporales de personas vigentes o futuras (para listarlas con su vencimiento). */
export const temporalesVigentes=(filas:FilaConfigMotor[],hoy:string)=>filas.filter(f=>f.activa&&f.clase==='temporal'&&(f.vigencia_hasta??'9999')>=hoy)
 .sort((a,b)=>a.vigencia_desde.localeCompare(b.vigencia_desde))

/** Fecha corta «30/11». */
export const ddmm=(iso:string)=>`${iso.slice(8,10)}/${iso.slice(5,7)}`
