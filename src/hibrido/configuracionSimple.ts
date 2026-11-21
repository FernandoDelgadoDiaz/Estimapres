/**
 * Configuración simple del supervisor (AH2-044) sobre la configuración persistente del motor (AH2-042).
 * La pantalla muestra campos; estas funciones traducen cada cambio a las mismas operaciones atómicas con
 * historial y simulación de conflictos (`aplicarCambio`). Nada se borra y nada se prorratea.
 * Regla: un cambio permanente rige desde el próximo lunes (los máximos semanales son por semana completa).
 */
import {type Cambio,type FilaConfigMotor,type FranjaApertura,type NuevaFila,type TipoConfig} from './configuracionPersistente'

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

/** Fecha corta «30/11». */
export const ddmm=(iso:string)=>`${iso.slice(8,10)}/${iso.slice(5,7)}`

/** Suma días a una fecha ISO (YYYY-MM-DD). */
const sumarDias=(iso:string,n:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}

const TEXTO_CONDICION:Record<string,string>={
 exclusion_manual:'no se incluye en la generación',franco:'tiene un franco fijado a mano',turno:'tiene un turno fijado a mano',
 max_francos:'tiene un máximo de francos fijado a mano',franco_medio_corrido:'tiene un medio franco fijado a mano',
}

/**
 * AH2-049: reglas manuales por persona (`condicion_supervisor`) activas en la semana que empieza en `lunes`.
 * El supervisor las ve antes de generar y puede quitarlas: ninguna regla por persona queda oculta.
 */
export function reglasPersonaEnSemana(filas:FilaConfigMotor[],lunes:string){
 const domingo=sumarDias(lunes,6)
 return filas.filter(f=>f.activa&&f.tipo==='condicion_supervisor'&&f.vigencia_desde<=domingo&&(f.vigencia_hasta===null||f.vigencia_hasta>=lunes))
  .map(f=>{const d=f.datos as {tipo?:string;modo?:string}
   const que=TEXTO_CONDICION[d.tipo??'']??'tiene una regla manual'
   const vig=f.vigencia_hasta?`del ${ddmm(f.vigencia_desde)} al ${ddmm(f.vigencia_hasta)}`:`desde el ${ddmm(f.vigencia_desde)}`
   return {fila:f,colaboradorId:f.colaborador_id,texto:`${que} (${d.modo==='PREFERIRIA'?'preferencia':'obligatoria'}, ${vig})`,excluye:d.tipo==='exclusion_manual'&&d.modo!=='PREFERIRIA'}})
}
