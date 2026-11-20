/**
 * Configuración editable del motor híbrido POR SUCURSAL, persistida en Supabase
 * (`configuracion_motor_sucursal`, migración 20261121120000 — preparada, aplicar solo con aprobación).
 *
 * Objetivo: que el supervisor no recargue configuración cada semana ni dependa de Secret Manager.
 *  - REGLA PERMANENTE: vigencia abierta (`vigencia_hasta` null). Rige todas las semanas desde su inicio.
 *    Editarla cierra la versión anterior el día previo y crea una nueva (historial completo, sin borrados).
 *  - EXCEPCIÓN TEMPORAL: vigencia con fin. Durante su vigencia REEMPLAZA a la permanente del mismo alcance
 *    (mismo tipo y misma persona); al vencer, vuelve a regir la permanente sin tocar nada.
 *
 * Una fila rige para la semana si está activa y vigente el LUNES de esa semana (las condiciones del supervisor,
 * que el motor ya evalúa por fecha, se incluyen si su vigencia se superpone con la semana).
 * La resolución produce exactamente los formatos que el motor ya acepta y valida (no cambia el motor):
 * `disponibilidad_caja_eventual`, `topes_caja_eventual_contrato`, `excepcion_apertura_aux_unico`,
 * `condiciones_supervisor`. Nunca se inventan valores: lo que no está configurado no se envía.
 */
import type {OpcionesGeneracion} from '../algoritmo/adapter'
import type {CondicionSupervisor} from '../algoritmo/condicionesTipos'
import {ACREDITACIONES,CONTRATOS_ORIGEN,validarDisponibilidadCaja,validarTopesContrato,type PerfilCajaEventual,type TopeClase} from '../algoritmo/disponibilidadCajaEventual'

export const TABLA_CONFIG='configuracion_motor_sucursal'
export const TIPOS_CONFIG=['topes_caja_eventual_contrato','perfil_caja_eventual','excepcion_apertura_aux_unico','condicion_supervisor'] as const
export type TipoConfig=typeof TIPOS_CONFIG[number]
export type ClaseConfig='permanente'|'temporal'

export interface DatosTopes {FULL:TopeClase;PART:TopeClase}
export type DatosPerfil=Omit<PerfilCajaEventual,'colaboradorId'|'sucursalId'|'vigenciaDesde'|'vigenciaHasta'>
export interface DatosApertura {dias:number[]}
export type DatosCondicion=Omit<CondicionSupervisor,'desde'|'hasta'>

export interface FilaConfigMotor {
 id:string;local_id?:string;sucursal_id:string;clase:ClaseConfig;tipo:TipoConfig;colaborador_id:string|null
 vigencia_desde:string;vigencia_hasta:string|null;datos:Record<string,unknown>;activa:boolean;motivo:string
 creado_en?:string;actualizado_en?:string
}
export type NuevaFila=Omit<FilaConfigMotor,'id'|'local_id'|'creado_en'|'actualizado_en'>

export class ErrorConfigMotor extends Error {constructor(public codigo:string,detalle:string){super(detalle)}}

const FECHA=/^\d{4}-\d{2}-\d{2}$/
const esFecha=(s:unknown):s is string=>typeof s==='string'&&FECHA.test(s)&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s
export function sumarDias(fecha:string,n:number){const d=new Date(`${fecha}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const esLunes=(s:string)=>new Date(`${s}T00:00:00Z`).getUTCDay()===1

/** Validación de forma y de contenido, reutilizando los validadores del motor. Lanza ErrorConfigMotor. */
export function validarFila(f:NuevaFila):NuevaFila{
 const mal=(c:string,d:string)=>{throw new ErrorConfigMotor(c,d)}
 if(!TIPOS_CONFIG.includes(f.tipo))mal('TIPO','Tipo de configuración desconocido.')
 if(f.clase!=='permanente'&&f.clase!=='temporal')mal('CLASE','La clase debe ser permanente o temporal.')
 if(typeof f.sucursal_id!=='string'||!f.sucursal_id)mal('SUCURSAL','Falta la sucursal.')
 if(!esFecha(f.vigencia_desde))mal('VIGENCIA','Fecha de inicio inválida.')
 if(f.vigencia_hasta!==null&&(!esFecha(f.vigencia_hasta)||f.vigencia_hasta<f.vigencia_desde))mal('VIGENCIA','Fecha de fin inválida o anterior al inicio.')
 if(f.clase==='temporal'&&f.vigencia_hasta===null)mal('VIGENCIA','Una excepción temporal necesita fecha de fin.')
 if(!f.datos||typeof f.datos!=='object'||Array.isArray(f.datos))mal('DATOS','Datos inválidos.')
 const d=f.datos as Record<string,unknown>
 if(f.tipo==='topes_caja_eventual_contrato'){
  if(f.colaborador_id!==null)mal('ALCANCE','Los topes son de la sucursal, no de una persona.')
  try{validarTopesContrato({version:1,configuraciones:[{sucursalId:f.sucursal_id,vigenciaDesde:f.vigencia_desde,fuente:'validación',FULL:d.FULL as TopeClase,PART:d.PART as TopeClase}]})}
  catch(e){mal('TOPES',e instanceof Error?e.message:'Topes inválidos.')}
  if(Object.keys(d).some(k=>k!=='FULL'&&k!=='PART'))mal('TOPES','Campos de topes desconocidos.')
 }
 if(f.tipo==='perfil_caja_eventual'){
  if(!f.colaborador_id)mal('ALCANCE','El perfil de caja corresponde a una persona EVENTUAL.')
  if(!ACREDITACIONES.includes(d.acreditacion as never))mal('PERFIL','Acreditación inválida.')
  if(d.contratoOrigen!=null&&!CONTRATOS_ORIGEN.includes(d.contratoOrigen as never))mal('PERFIL','Contrato de origen inválido.')
  try{validarDisponibilidadCaja({version:1,perfiles:[{...d,colaboradorId:f.colaborador_id!,sucursalId:f.sucursal_id,vigenciaDesde:f.vigencia_desde} as PerfilCajaEventual]})}
  catch(e){mal('PERFIL',e instanceof Error?e.message:'Perfil inválido.')}
 }
 if(f.tipo==='excepcion_apertura_aux_unico'){
  if(f.colaborador_id!==null)mal('ALCANCE','La excepción de apertura es de la sucursal.')
  const dias=d.dias
  if(!Array.isArray(dias)||dias.some(x=>!Number.isInteger(x)||x<0||x>6)||new Set(dias).size!==dias.length||Object.keys(d).length!==1)mal('APERTURA','Días de apertura inválidos (0 = lunes … 6 = domingo).')
 }
 if(f.tipo==='condicion_supervisor'){
  if(!['DEBE','PREFERIRIA'].includes(String(d.modo))||!['franco','turno','exclusion_manual','max_francos','franco_medio_corrido'].includes(String(d.tipo)))mal('CONDICION','Condición inválida.')
  if(typeof d.id!=='string'||!d.id)mal('CONDICION','La condición necesita un identificador.')
  if(d.tipo!=='max_francos'&&(d.colaboradorId??f.colaborador_id)==null)mal('CONDICION','La condición necesita una persona.')
 }
 return f
}

export interface TrazaConfig {tipo:TipoConfig;colaboradorId:string|null;clase:ClaseConfig;filaId:string;vigenciaDesde:string;vigenciaHasta:string|null;motivo:string}
export interface ConfigResuelta {opciones:OpcionesGeneracion;traza:TrazaConfig[];semana:string;domingo:string}

/**
 * Resuelve la configuración vigente para la semana (lunes ISO) y sucursal.
 * Precedencia por alcance (tipo + persona): temporal > permanente; dentro de la misma clase, la de inicio más
 * reciente. Dos filas de igual clase e inicio para el mismo alcance = ambigüedad: se rechaza (no se elige una).
 */
export function resolverConfiguracion(filas:FilaConfigMotor[],sucursal:string,semana:string):ConfigResuelta{
 if(!esFecha(semana)||!esLunes(semana))throw new ErrorConfigMotor('SEMANA','La semana debe empezar un lunes.')
 const domingo=sumarDias(semana,6)
 const propias=filas.filter(f=>f.activa&&f.sucursal_id===sucursal)
 for(const f of propias)validarFila(f)
 const vigenteLunes=(f:FilaConfigMotor)=>f.vigencia_desde<=semana&&(f.vigencia_hasta===null||f.vigencia_hasta>=semana)
 const superpone=(f:FilaConfigMotor)=>f.vigencia_desde<=domingo&&(f.vigencia_hasta===null||f.vigencia_hasta>=semana)
 const elegidas=new Map<string,FilaConfigMotor>()
 for(const f of propias.filter(x=>x.tipo!=='condicion_supervisor'&&vigenteLunes(x))){
  const k=`${f.tipo}|${f.colaborador_id??''}`,o=elegidas.get(k)
  if(!o){elegidas.set(k,f);continue}
  const rango=(x:FilaConfigMotor)=>x.clase==='temporal'?1:0
  if(rango(f)!==rango(o)){if(rango(f)>rango(o))elegidas.set(k,f);continue}
  if(f.vigencia_desde===o.vigencia_desde)throw new ErrorConfigMotor('AMBIGUA',`Dos configuraciones ${f.clase}s superpuestas para ${f.tipo}${f.colaborador_id?' de una misma persona':''}. Cerrá o desactivá una.`)
  if(f.vigencia_desde>o.vigencia_desde)elegidas.set(k,f)
 }
 const sel=[...elegidas.values()].sort((a,b)=>`${a.tipo}|${a.colaborador_id}`.localeCompare(`${b.tipo}|${b.colaborador_id}`))
 const condiciones=propias.filter(x=>x.tipo==='condicion_supervisor'&&superpone(x)).sort((a,b)=>a.vigencia_desde.localeCompare(b.vigencia_desde)||a.id.localeCompare(b.id))
 const opciones:OpcionesGeneracion={}
 const fuente=(f:FilaConfigMotor)=>`Configuración ${f.clase} de la sucursal desde ${f.vigencia_desde}${f.vigencia_hasta?` hasta ${f.vigencia_hasta}`:''}${f.motivo?` · ${f.motivo}`:''}`
 const perfiles=sel.filter(f=>f.tipo==='perfil_caja_eventual')
 if(perfiles.length)opciones.disponibilidad_caja_eventual={version:1,perfiles:perfiles.map(f=>({...(f.datos as DatosPerfil),fuente:String((f.datos as DatosPerfil).fuente??'').trim()||fuente(f),
  colaboradorId:f.colaborador_id!,sucursalId:sucursal,vigenciaDesde:semana,vigenciaHasta:domingo}))}
 const topes=sel.find(f=>f.tipo==='topes_caja_eventual_contrato')
 if(topes){const d=topes.datos as unknown as DatosTopes;opciones.topes_caja_eventual_contrato={version:1,configuraciones:[{sucursalId:sucursal,vigenciaDesde:semana,vigenciaHasta:domingo,fuente:fuente(topes),FULL:{...d.FULL},PART:{...d.PART}}]}}
 const apertura=sel.find(f=>f.tipo==='excepcion_apertura_aux_unico')
 if(apertura){const dias=(apertura.datos as unknown as DatosApertura).dias;opciones.excepcion_apertura_aux_unico=Array.from({length:7},(_,d)=>Array.from({length:30},(_,s)=>s<2&&dias.includes(d)))}
 if(condiciones.length){
  const vistos=new Set<string>()
  opciones.condiciones_supervisor={version:1,sucursal_id:sucursal,semana,condiciones:condiciones.map(f=>{
   const d=f.datos as unknown as DatosCondicion
   if(vistos.has(d.id))throw new ErrorConfigMotor('AMBIGUA',`Condición repetida: ${d.id}.`);vistos.add(d.id)
   return {...d,colaboradorId:d.colaboradorId??f.colaborador_id??undefined,desde:f.vigencia_desde,hasta:f.vigencia_hasta??domingo}
  })}
 }
 const traza=[...sel,...condiciones].map(f=>({tipo:f.tipo,colaboradorId:f.colaborador_id,clase:f.clase,filaId:f.id,vigenciaDesde:f.vigencia_desde,vigenciaHasta:f.vigencia_hasta,motivo:f.motivo}))
 return {opciones,traza,semana,domingo}
}

/**
 * Propuesta de importación de la configuración que hoy entrega el servicio (Secret Manager) a filas persistentes.
 * No guarda nada: el supervisor revisa y confirma. Perfiles, topes y apertura se proponen como PERMANENTES desde
 * la fecha de inicio informada; las condiciones del supervisor se conservan como EXCEPCIONES TEMPORALES con sus fechas.
 */
export function proponerImportacion(cfg:OpcionesGeneracion,sucursal:string,motivo='importado de la configuración del servicio'):NuevaFila[]{
 const out:NuevaFila[]=[]
 const base={sucursal_id:sucursal,activa:true,motivo}
 for(const p of cfg.disponibilidad_caja_eventual?.perfiles??[]){
  if(p.sucursalId!==sucursal)continue
  const {colaboradorId,sucursalId:_s,vigenciaDesde,vigenciaHasta:_h,...datos}=p
  out.push({...base,clase:'permanente',tipo:'perfil_caja_eventual',colaborador_id:colaboradorId,vigencia_desde:vigenciaDesde,vigencia_hasta:null,datos:datos as Record<string,unknown>})
 }
 for(const t of cfg.topes_caja_eventual_contrato?.configuraciones??[]){
  if(t.sucursalId!==sucursal)continue
  out.push({...base,clase:'permanente',tipo:'topes_caja_eventual_contrato',colaborador_id:null,vigencia_desde:t.vigenciaDesde,vigencia_hasta:null,datos:{FULL:t.FULL,PART:t.PART}})
 }
 const ap=cfg.excepcion_apertura_aux_unico,cs=cfg.condiciones_supervisor
 if(ap?.some(r=>r.some(Boolean))){
  // La matriz no indica sucursal: solo se importa junto con datos de ESTA sucursal, desde su inicio más temprano.
  const desde=[...out.map(f=>f.vigencia_desde),cs?.sucursal_id===sucursal?cs.semana:''].filter(Boolean).sort()[0]
  if(desde)out.push({...base,clase:'permanente',tipo:'excepcion_apertura_aux_unico',colaborador_id:null,vigencia_desde:desde,vigencia_hasta:null,datos:{dias:ap.flatMap((r,d)=>r[0]||r[1]?[d]:[])}})
 }
 if(cs&&cs.sucursal_id===sucursal)for(const c of cs.condiciones){
  const {desde,hasta,...datos}=c
  out.push({...base,clase:'temporal',tipo:'condicion_supervisor',colaborador_id:c.colaboradorId??null,vigencia_desde:desde,vigencia_hasta:hasta,datos:datos as Record<string,unknown>})
 }
 return out.map(validarFila)
}

/** Reemplazo de una regla permanente desde una fecha: cierra la anterior el día previo y crea la nueva. */
export function planReemplazo(anterior:FilaConfigMotor,nueva:NuevaFila):{cerrar:{id:string;vigencia_hasta:string}|null;crear:NuevaFila}{
 validarFila(nueva)
 if(anterior.tipo!==nueva.tipo||anterior.colaborador_id!==nueva.colaborador_id||anterior.sucursal_id!==nueva.sucursal_id)throw new ErrorConfigMotor('ALCANCE','El reemplazo debe tener el mismo alcance.')
 if(nueva.vigencia_desde<=anterior.vigencia_desde)return {cerrar:null,crear:nueva} // corrige desde el inicio: la anterior se desactiva aparte
 return {cerrar:{id:anterior.id,vigencia_hasta:sumarDias(nueva.vigencia_desde,-1)},crear:nueva}
}

// ── Acceso a datos (Supabase, RLS por usuario) ────────────────────────────────────────────────────────────────
interface ClienteMinimo {from:(t:string)=>any}
const tablaAusente=(e:{code?:string;message?:string}|null)=>!!e&&(e.code==='42P01'||e.code==='PGRST205'||/does not exist|schema cache/i.test(e.message??''))

/** Lee la configuración de la sucursal. Si la tabla aún no existe (migración sin aplicar): {disponible:false}. */
export async function cargarConfiguracionMotor(db:ClienteMinimo,usuario:string,sucursal:string):Promise<{disponible:boolean;filas:FilaConfigMotor[]}>{
 const {data,error}=await db.from(TABLA_CONFIG).select('*').eq('local_id',usuario).eq('sucursal_id',sucursal).order('vigencia_desde',{ascending:true})
 if(tablaAusente(error))return {disponible:false,filas:[]}
 if(error)throw new ErrorConfigMotor('LECTURA','No se pudo leer la configuración del motor.')
 const filas=(data??[]) as FilaConfigMotor[]
 if(filas.some(f=>f.local_id!==usuario||f.sucursal_id!==sucursal))throw new ErrorConfigMotor('ALCANCE','Configuración fuera del ámbito autorizado.')
 return {disponible:true,filas}
}
export async function guardarFilas(db:ClienteMinimo,filas:NuevaFila[]){
 const v=filas.map(validarFila)
 const {data,error}=await db.from(TABLA_CONFIG).insert(v).select('*')
 if(error)throw new ErrorConfigMotor('ESCRITURA','No se pudo guardar la configuración.')
 return data as FilaConfigMotor[]
}
export async function desactivarFila(db:ClienteMinimo,id:string){
 const {error}=await db.from(TABLA_CONFIG).update({activa:false}).eq('id',id)
 if(error)throw new ErrorConfigMotor('ESCRITURA','No se pudo desactivar la configuración.')
}
export async function reemplazarDesde(db:ClienteMinimo,anterior:FilaConfigMotor,nueva:NuevaFila){
 const p=planReemplazo(anterior,nueva)
 const [creada]=await guardarFilas(db,[p.crear])
 if(p.cerrar){const {error}=await db.from(TABLA_CONFIG).update({vigencia_hasta:p.cerrar.vigencia_hasta}).eq('id',p.cerrar.id);if(error)throw new ErrorConfigMotor('ESCRITURA','Se creó la nueva versión pero no se pudo cerrar la anterior: revisá la configuración.')}
 else await desactivarFila(db,anterior.id)
 return creada
}
