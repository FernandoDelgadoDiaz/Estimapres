/**
 * Configuración editable del motor híbrido POR SUCURSAL (AH2-042), persistida en Supabase
 * (`configuracion_motor_sucursal`, migración 20261121120000 — preparada; aplicar solo con aprobación).
 *
 * - REGLA PERMANENTE: vigencia abierta. Rige cada día desde su inicio, todas las semanas, sin recargas.
 * - EXCEPCIÓN TEMPORAL: con fecha de fin. Rige DÍA POR DÍA dentro de sus fechas (aunque empiece o termine a mitad de
 *   semana) y reemplaza a la permanente del mismo alcance (tipo + persona / condición) solo esos días.
 * - Integridad: la base impide superposiciones de igual clase y alcance; todas las escrituras pasan por funciones
 *   atómicas con control de versión (concurrencia optimista). Una regla inválida o en conflicto se informa en su propio
 *   alcance y bloquea la generación híbrida con un mensaje claro; nunca invalida ni borra otras reglas.
 *
 * La resolución produce SOLO los formatos que el motor ya acepta y valida (no se modifica el motor):
 *   perfiles por persona → `disponibilidad_caja_eventual` (un perfil semanal; los días con otra regla se expresan como
 *     reservas de franja completa o de las franjas declaradas). Las cantidades SEMANALES (máximo individual, mínimo de
 *     función habitual) NUNCA se prorratean: si difieren dentro de una semana, es un conflicto explícito;
 *   topes por contrato → `topes_caja_eventual_contrato`: son máximos SEMANALES, se configuran por semanas completas
 *     (lunes a domingo) y nunca se prorratean;
 *   apertura → `excepcion_apertura_aux_unico` (matriz por día y franja autorizada por la sucursal);
 *   condiciones → `condiciones_supervisor`, resueltas DÍA POR DÍA por alcance (tipo de condición + persona): una
 *     excepción temporal reemplaza a la permanente solo en sus días; cada tramo se envía con sus fechas exactas.
 */
import type {OpcionesGeneracion} from '../algoritmo/adapter'
import type {CondicionSupervisor} from '../algoritmo/condicionesTipos'
import {ACREDITACIONES,CONTRATOS_ORIGEN,validarDisponibilidadCaja,validarTopesContrato,type PerfilCajaEventual,type ReservaFuncionHabitual,type TopeClase} from '../algoritmo/disponibilidadCajaEventual'
import {erroresDatosRecursos} from '../algoritmo/politicaRecursos'
import {SLOTS_POR_DIA,horaASlot,slotAHora} from '../algoritmo/types'

export const TABLA_CONFIG='configuracion_motor_sucursal'
export const TIPOS_CONFIG=['topes_caja_eventual_contrato','perfil_caja_eventual','excepcion_apertura_aux_unico','condicion_supervisor'] as const
export type TipoConfig=typeof TIPOS_CONFIG[number]
export type ClaseConfig='permanente'|'temporal'
export const TIPOS_CONDICION=['franco','turno','exclusion_manual','max_francos','franco_medio_corrido'] as const
export type TipoCondicion=typeof TIPOS_CONDICION[number]

export interface DatosTopes {FULL:TopeClase;PART:TopeClase}
export type DatosPerfil=Omit<PerfilCajaEventual,'colaboradorId'|'sucursalId'|'vigenciaDesde'|'vigenciaHasta'>
export interface FranjaApertura {dia:number;desde:string;hasta:string}
export interface DatosApertura {franjas:FranjaApertura[]}
export interface DefinicionTurno {inicioMin:string;inicioMax:string;finMax?:string}
export type DatosCondicion=Omit<CondicionSupervisor,'desde'|'hasta'>&{turno?:DefinicionTurno}

export interface FilaConfigMotor {
 id:string;local_id?:string;sucursal_id:string;clase:ClaseConfig;tipo:TipoConfig;colaborador_id:string|null
 vigencia_desde:string;vigencia_hasta:string|null;datos:Record<string,unknown>;activa:boolean;motivo:string
 version?:number;reemplaza_a?:string|null;creado_en?:string;actualizado_en?:string;desactivada_en?:string|null
}
export type NuevaFila=Pick<FilaConfigMotor,'sucursal_id'|'clase'|'tipo'|'colaborador_id'|'vigencia_desde'|'vigencia_hasta'|'datos'|'motivo'>

export class ErrorConfigMotor extends Error {constructor(public codigo:string,detalle:string){super(detalle)}}

// ── Fechas y grilla (la grilla es la del motor: SLOTS_POR_DIA franjas de 30 min desde slotAHora(0)) ─────────────────
const FECHA=/^\d{4}-\d{2}-\d{2}$/,HORA=/^\d{2}:(00|30)$/
const esFecha=(s:unknown):s is string=>typeof s==='string'&&FECHA.test(s)&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s
export function sumarDias(fecha:string,n:number){const d=new Date(`${fecha}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const esLunes=(s:string)=>new Date(`${s}T00:00:00Z`).getUTCDay()===1
export const HORAS_GRILLA=Array.from({length:SLOTS_POR_DIA+1},(_,s)=>slotAHora(s))
const enGrilla=(h:unknown):h is string=>typeof h==='string'&&HORA.test(h)&&horaASlot(h)>=0&&horaASlot(h)<=SLOTS_POR_DIA

/** Matriz 7×30 del motor a partir de franjas declaradas (solo las del día indicado). */
function matrizApertura(porDia:(FranjaApertura[]|null)[]){
 return porDia.map((fr,d)=>{const row=Array<boolean>(SLOTS_POR_DIA).fill(false);for(const f of fr??[])if(f.dia===d)for(let s=horaASlot(f.desde);s<horaASlot(f.hasta);s++)row[s]=true;return row})
}

/** Validación de forma y de contenido reutilizando los validadores del motor. Lanza ErrorConfigMotor. */
export function validarFila(f:NuevaFila):NuevaFila{
 const mal=(c:string,d:string):never=>{throw new ErrorConfigMotor(c,d)}
 if(!TIPOS_CONFIG.includes(f.tipo))mal('TIPO','Tipo de configuración desconocido.')
 if(f.clase!=='permanente'&&f.clase!=='temporal')mal('CLASE','La clase debe ser permanente o temporal.')
 if(typeof f.sucursal_id!=='string'||!f.sucursal_id||f.sucursal_id.length>32)mal('SUCURSAL','Sucursal inválida.')
 if(!esFecha(f.vigencia_desde))mal('VIGENCIA','Fecha de inicio inválida.')
 if(f.vigencia_hasta!==null&&(!esFecha(f.vigencia_hasta)||f.vigencia_hasta<f.vigencia_desde))mal('VIGENCIA','Fecha de fin inválida o anterior al inicio.')
 if(f.clase==='temporal'&&f.vigencia_hasta===null)mal('VIGENCIA','Una excepción temporal necesita fecha de fin.')
 if(typeof f.motivo!=='string'||f.motivo.length>500)mal('MOTIVO','Motivo inválido (máximo 500 caracteres).')
 if(!f.datos||typeof f.datos!=='object'||Array.isArray(f.datos))mal('DATOS','Datos inválidos.')
 const d=f.datos as Record<string,unknown>
 if(f.tipo==='topes_caja_eventual_contrato'){
  if(f.colaborador_id!==null)mal('ALCANCE','Los topes son de la sucursal, no de una persona.')
  if(Object.keys(d).some(k=>k!=='FULL'&&k!=='PART'))mal('TOPES','Campos de topes desconocidos.')
  // Máximos SEMANALES: rigen por semanas completas; nunca se prorratean.
  if(!esLunes(f.vigencia_desde)||(f.vigencia_hasta!==null&&new Date(`${f.vigencia_hasta}T00:00:00Z`).getUTCDay()!==0))mal('TOPES','Los máximos semanales rigen por semanas completas: la vigencia debe empezar un lunes y, si termina, terminar un domingo.')
  try{validarTopesContrato({version:1,configuraciones:[{sucursalId:f.sucursal_id,vigenciaDesde:f.vigencia_desde,fuente:'validación',FULL:d.FULL as TopeClase,PART:d.PART as TopeClase}]})}
  catch(e){mal('TOPES',e instanceof Error?e.message:'Topes inválidos.')}
 }
 if(f.tipo==='perfil_caja_eventual'){
  if(!f.colaborador_id)mal('ALCANCE','El perfil de caja corresponde a una persona EVENTUAL.')
  if(!ACREDITACIONES.includes(d.acreditacion as never))mal('PERFIL','Disponibilidad para caja inválida.')
  if(d.contratoOrigen!=null&&!CONTRATOS_ORIGEN.includes(d.contratoOrigen as never))mal('PERFIL','Contrato de origen inválido.')
  if(d.acreditacion==='PRESENCIA_MENOS_RESERVAS'&&!(d.reservas as unknown[]|undefined)?.length&&d.horasFuncionHabitualMinimas==null)mal('PERFIL','«Presencia menos reservas» necesita al menos una reserva horaria o un mínimo de horas de función habitual.')
  if(d.acreditacion==='TODA_LA_PRESENCIA'&&((d.reservas as unknown[]|undefined)?.length||d.horasFuncionHabitualMinimas))mal('PERFIL','«Toda la presencia» no admite reservas ni mínimo de función habitual.')
  try{validarDisponibilidadCaja({version:1,perfiles:[{...d,colaboradorId:f.colaborador_id!,sucursalId:f.sucursal_id,vigenciaDesde:f.vigencia_desde} as PerfilCajaEventual]})}
  catch(e){mal('PERFIL',e instanceof Error?e.message:'Perfil inválido.')}
 }
 if(f.tipo==='excepcion_apertura_aux_unico'){
  if(f.colaborador_id!==null)mal('ALCANCE','La excepción de apertura es de la sucursal.')
  const fr=d.franjas
  if(!Array.isArray(fr)||Object.keys(d).some(k=>k!=='franjas'))mal('APERTURA','Franjas de apertura inválidas.')
  for(const x of fr as FranjaApertura[])
   if(!x||!Number.isInteger(x.dia)||x.dia<0||x.dia>6||!enGrilla(x.desde)||!enGrilla(x.hasta)||horaASlot(x.desde)>=horaASlot(x.hasta))mal('APERTURA',`Franja inválida: día 0–6 y horas entre ${HORAS_GRILLA[0]} y ${HORAS_GRILLA[SLOTS_POR_DIA]} en medias horas.`)
  // La franja admitida para la excepción la define el validador del motor, no esta capa.
  const err=erroresDatosRecursos({excepcion_apertura_aux_unico:matrizApertura(Array.from({length:7},()=>fr as FranjaApertura[]))},[])
  if(err.length)mal('APERTURA',err.join('; '))
 }
 if(f.tipo==='condicion_supervisor'){
  const t=d.tipo as TipoCondicion,modo=d.modo
  if(typeof d.id!=='string'||!d.id||d.id.length>80)mal('CONDICION','La condición necesita un identificador.')
  if(modo!=='DEBE'&&modo!=='PREFERIRIA')mal('CONDICION','Modo inválido (DEBE o PREFERIRÍA).')
  if(!TIPOS_CONDICION.includes(t))mal('CONDICION','Tipo de condición inválido.')
  const persona=(d.colaboradorId as string|undefined)??f.colaborador_id
  if(d.colaboradorId!=null&&f.colaborador_id!=null&&d.colaboradorId!==f.colaborador_id)mal('CONDICION','La persona de la condición no coincide.')
  if(t==='max_francos'){if(persona)mal('CONDICION','El máximo de francos es de la sucursal.');if(modo!=='DEBE'||!Number.isInteger(d.valor)||Number(d.valor)<0||Number(d.valor)>160)mal('CONDICION','Máximo de francos: DEBE y un número entre 0 y 160.')}
  else if(!persona)mal('CONDICION','La condición necesita una persona.')
  if(t==='franco'&&(!Number.isInteger(d.dia)||Number(d.dia)<0||Number(d.dia)>6))mal('CONDICION','El franco necesita un día (0 = lunes … 6 = domingo).')
  if(t==='exclusion_manual'&&modo!=='DEBE')mal('CONDICION','Gestionar manualmente es siempre DEBE.')
  if(t==='franco_medio_corrido'&&modo!=='PREFERIRIA')mal('CONDICION','Franco y medio corrido es una preferencia (PREFERIRÍA).')
  if(t==='turno'){
   const tu=d.turno as DefinicionTurno|undefined
   if(typeof d.valor!=='string'||!d.valor)mal('CONDICION','El turno necesita un nombre.')
   if(!tu||!enGrilla(tu.inicioMin)||!enGrilla(tu.inicioMax)||(tu.finMax!=null&&!enGrilla(tu.finMax))||horaASlot(tu.inicioMin)>horaASlot(tu.inicioMax)||(tu.finMax!=null&&horaASlot(tu.finMax)<=horaASlot(tu.inicioMax)))
    mal('CONDICION','Definición de turno inválida (ingreso mínimo ≤ ingreso máximo < salida máxima).')
  }else if(d.turno!==undefined)mal('CONDICION','Solo un turno lleva definición de horario.')
 }
 return f
}

export interface TrazaConfig {tipo:TipoConfig;colaboradorId:string|null;clase:ClaseConfig;filaId:string;dias:number[];vigenciaDesde:string;vigenciaHasta:string|null;motivo:string}
export interface ConflictoConfig {tipo:TipoConfig;colaboradorId:string|null;filaIds:string[];detalle:string}
export interface ConfigResuelta {opciones:OpcionesGeneracion;traza:TrazaConfig[];conflictos:ConflictoConfig[];semana:string;domingo:string;notas:string[]}

/** Alcance de precedencia (igual que la columna `alcance` de la base): tipo + persona; en condiciones, + tipo de condición. */
export const claveAlcance=(f:Pick<FilaConfigMotor,'tipo'|'colaborador_id'|'datos'>)=>`${f.tipo}|${f.colaborador_id??''}${f.tipo==='condicion_supervisor'?`|${String((f.datos as {tipo?:unknown}).tipo??'')}`:''}`
const vigenteEn=(f:FilaConfigMotor,fecha:string)=>f.vigencia_desde<=fecha&&(f.vigencia_hasta===null||f.vigencia_hasta>=fecha)

/**
 * Resuelve la configuración para la semana (lunes ISO) y sucursal, DÍA POR DÍA.
 * Para cada alcance y fecha rige: la excepción temporal vigente ese día; si no hay, la permanente vigente de inicio
 * más reciente. Dos reglas de igual clase vigentes el mismo día para el mismo alcance = conflicto (no se elige una).
 * Los conflictos y las filas inválidas se informan por alcance; el resto de la configuración se resuelve igual.
 */
export function resolverConfiguracion(filas:FilaConfigMotor[],sucursal:string,semana:string):ConfigResuelta{
 if(!esFecha(semana)||!esLunes(semana))throw new ErrorConfigMotor('SEMANA','La semana debe empezar un lunes.')
 const fechas=Array.from({length:7},(_,d)=>sumarDias(semana,d)),domingo=fechas[6]
 const conflictos:ConflictoConfig[]=[],notas:string[]=[],traza:TrazaConfig[]=[]
 const validas:FilaConfigMotor[]=[]
 for(const f of filas.filter(x=>x.activa&&x.sucursal_id===sucursal&&x.vigencia_desde<=domingo&&(x.vigencia_hasta===null||x.vigencia_hasta>=semana))){
  try{validarFila(f);validas.push(f)}catch(e){conflictos.push({tipo:f.tipo,colaboradorId:f.colaborador_id,filaIds:[f.id],detalle:`Regla inválida: ${e instanceof Error?e.message:'error'}`})}
 }
 const grupos=new Map<string,FilaConfigMotor[]>()
 for(const f of validas){const k=claveAlcance(f);(grupos.get(k)??grupos.set(k,[]).get(k)!).push(f)}
 const fuente=(f:FilaConfigMotor)=>`Configuración ${f.clase} de la sucursal desde ${f.vigencia_desde}${f.vigencia_hasta?` hasta ${f.vigencia_hasta}`:''}${f.motivo?` · ${f.motivo}`:''}`
 // Regla que rige cada día para cada alcance.
 const porDia=new Map<string,(FilaConfigMotor|null)[]>()
 for(const [k,fs] of grupos){
  const dias:(FilaConfigMotor|null)[]=[];let conflicto=false
  for(const fecha of fechas){
   const tmp=fs.filter(f=>f.clase==='temporal'&&vigenteEn(f,fecha))
   const per=fs.filter(f=>f.clase==='permanente'&&vigenteEn(f,fecha)).sort((a,b)=>b.vigencia_desde.localeCompare(a.vigencia_desde))
   if(tmp.length>1||(!tmp.length&&per.length>1&&per[0].vigencia_desde===per[1].vigencia_desde)){
    const c=tmp.length>1?tmp:per.filter(x=>x.vigencia_desde===per[0].vigencia_desde)
    conflictos.push({tipo:c[0].tipo,colaboradorId:c[0].colaborador_id,filaIds:c.map(x=>x.id),detalle:`Dos reglas ${c[0].clase}s superpuestas el ${fecha} para el mismo alcance. Cerrá o desactivá una.`})
    conflicto=true;break
   }
   dias.push(tmp[0]??per[0]??null)
  }
  if(conflicto)continue
  porDia.set(k,dias)
  for(const f of new Set(dias.filter((x):x is FilaConfigMotor=>!!x)))
   traza.push({tipo:f.tipo,colaboradorId:f.colaborador_id,clase:f.clase,filaId:f.id,dias:dias.flatMap((x,d)=>x===f?[d]:[]),vigenciaDesde:f.vigencia_desde,vigenciaHasta:f.vigencia_hasta,motivo:f.motivo})
 }
 const opciones:OpcionesGeneracion={}
 const entradas=[...porDia.entries()].sort(([a],[b])=>a.localeCompare(b))
 const unica=(dias:(FilaConfigMotor|null)[])=>dias.every(x=>x&&x===dias[0])?dias[0]:null

 // Perfiles de caja EVENTUAL (uno por persona y semana; los cambios intra-semana se expresan con reservas por día).
 const perfiles:PerfilCajaEventual[]=[]
 for(const [,dias] of entradas.filter(([k])=>k.startsWith('perfil_caja_eventual|'))){
  const presente=dias.find(Boolean)!,id=presente.colaborador_id!,base={colaboradorId:id,sucursalId:sucursal,vigenciaDesde:semana,vigenciaHasta:domingo}
  const u=unica(dias)
  if(u){const d=u.datos as DatosPerfil;perfiles.push({...d,fuente:String(d.fuente??'').trim()||fuente(u),...base});continue}
  const datosDe=(x:FilaConfigMotor|null)=>x?.datos as DatosPerfil|undefined
  const contratos=new Set(dias.map(x=>datosDe(x)?.contratoOrigen).filter(Boolean))
  if(contratos.size>1){conflictos.push({tipo:'perfil_caja_eventual',colaboradorId:id,filaIds:[...new Set(dias.filter(Boolean).map(x=>x!.id))],detalle:'El contrato de origen cambia dentro de la semana; los topes por contrato son semanales. Alineá las fechas a semanas completas.'});continue}
  if(dias.every(x=>!x||datosDe(x)!.acreditacion==='NO_ACREDITADA')){perfiles.push({acreditacion:'NO_ACREDITADA',contratoOrigen:[...contratos][0]??null,fuente:`Composición por fecha: no atiende caja esta semana (${[...new Set(dias.filter(Boolean).map(x=>fuente(x!)))].join(' / ')})`,...base});continue}
  const reservas:ReservaFuncionHabitual[]=[]
  dias.forEach((x,d)=>{
   const dd=datosDe(x)
   if(!dd||dd.acreditacion==='NO_ACREDITADA')reservas.push({dias:[d],desde:HORAS_GRILLA[0],hasta:HORAS_GRILLA[SLOTS_POR_DIA]})
   else if(dd.acreditacion==='PRESENCIA_MENOS_RESERVAS')for(const r of dd.reservas??[])if(r.dias.includes(d))reservas.push({dias:[d],desde:r.desde,hasta:r.hasta})
  })
  // Cantidades SEMANALES: no se prorratean. Deben ser iguales en todos los días con caja acreditada de la semana.
  const acreditados=dias.filter(x=>x&&datosDe(x)!.acreditacion!=='NO_ACREDITADA')
  const semanal=(campo:'horasFuncionHabitualMinimas'|'maxCajaHoras')=>{const v=new Set(acreditados.map(x=>datosDe(x)?.[campo]??null));return v.size===1?{ok:true,valor:[...v][0]}:{ok:false,valor:null}}
  const fS=semanal('horasFuncionHabitualMinimas'),mS=semanal('maxCajaHoras')
  if(!fS.ok||!mS.ok){conflictos.push({tipo:'perfil_caja_eventual',colaboradorId:id,filaIds:[...new Set(dias.filter(Boolean).map(x=>x!.id))],detalle:`El ${!mS.ok?'máximo semanal de caja':'mínimo semanal de función habitual'} cambia dentro de la semana. Los valores semanales no se prorratean: definí la excepción por semana completa (lunes a domingo) o igualá el valor.`});continue}
  const fMin=fS.valor,maxC=mS.valor
  const hc=new Set(dias.map(x=>datosDe(x)?.horasContractuales).filter(v=>v!=null))
  perfiles.push({acreditacion:reservas.length||fMin!=null?'PRESENCIA_MENOS_RESERVAS':'TODA_LA_PRESENCIA',contratoOrigen:[...contratos][0]??null,
   ...(reservas.length?{reservas}:{}),...(fMin!=null?{horasFuncionHabitualMinimas:fMin}:{}),...(maxC!=null?{maxCajaHoras:maxC}:{}),
   ...(hc.size===1?{horasContractuales:[...hc][0]}:{}),
   fuente:`Composición por fecha (${dias.map((x,d)=>`${d}:${x?x.clase[0].toUpperCase():'-'}`).join(' ')}): ${[...new Set(dias.filter(Boolean).map(x=>fuente(x!)))].join(' / ')}`,...base})
  notas.push(`Perfil de ${id}: reglas distintas según el día; se combinaron por fecha.`)
 }
 if(perfiles.length)opciones.disponibilidad_caja_eventual={version:1,perfiles}

 // Topes por contrato de origen: máximos SEMANALES por semanas completas. Nunca se prorratean.
 const topes=entradas.find(([k])=>k.startsWith('topes_caja_eventual_contrato|'))?.[1]
 if(topes&&topes.some(Boolean)){
  const u=unica(topes)
  if(u){const d=u.datos as unknown as DatosTopes;opciones.topes_caja_eventual_contrato={version:1,configuraciones:[{sucursalId:sucursal,vigenciaDesde:semana,vigenciaHasta:domingo,fuente:fuente(u),FULL:{...d.FULL},PART:{...d.PART}}]}}
  else conflictos.push({tipo:'topes_caja_eventual_contrato',colaboradorId:null,filaIds:[...new Set(topes.filter(Boolean).map(x=>x!.id))],
   detalle:'Los máximos semanales EVENTUAL cambian dentro de la semana. No se prorratean: la regla debe regir la semana completa (lunes a domingo).'})
 }

 // Excepción de apertura: franjas configuradas, día por día.
 const ap=entradas.find(([k])=>k.startsWith('excepcion_apertura_aux_unico|'))?.[1]
 if(ap&&ap.some(Boolean)){
  const m=matrizApertura(ap.map(x=>x?(x.datos as unknown as DatosApertura).franjas:null))
  const err=erroresDatosRecursos({excepcion_apertura_aux_unico:m},[])
  if(err.length)conflictos.push({tipo:'excepcion_apertura_aux_unico',colaboradorId:null,filaIds:[...new Set(ap.filter(Boolean).map(x=>x!.id))],detalle:err.join('; ')})
  else opciones.excepcion_apertura_aux_unico=m
 }

 // Condiciones del supervisor, DÍA POR DÍA: para cada alcance (tipo de condición + persona) rige la excepción temporal
 // en sus días y la permanente en los demás. Cada tramo continuo se envía con sus fechas exactas (el motor evalúa por día).
 const conds:CondicionSupervisor[]=[],turnos:Record<string,DefinicionTurno>={}
 for(const [,dias] of entradas.filter(([k])=>k.startsWith('condicion_supervisor|'))){
  const tramos:{f:FilaConfigMotor;desde:number;hasta:number}[]=[]
  dias.forEach((x,d)=>{if(!x)return;const t=tramos[tramos.length-1];if(t&&t.f===x&&t.hasta===d-1)t.hasta=d;else tramos.push({f:x,desde:d,hasta:d})})
  const varios=tramos.length>1
  for(const t of tramos){
   const f=t.f,d=f.datos as unknown as DatosCondicion,desde=fechas[t.desde],hasta=fechas[t.hasta],semanaCompleta=t.desde===0&&t.hasta===6
   if(d.tipo==='exclusion_manual'&&!semanaCompleta){conflictos.push({tipo:f.tipo,colaboradorId:f.colaborador_id,filaIds:[f.id],detalle:`«Gestionar manualmente» rige solo del ${desde} al ${hasta}; el motor la exige para la semana completa (${semana} a ${domingo}). Para días sueltos usá «franco».`});continue}
   if(d.tipo==='franco_medio_corrido'&&!semanaCompleta){conflictos.push({tipo:f.tipo,colaboradorId:f.colaborador_id,filaIds:[f.id],detalle:'«Franco y medio corrido» es una preferencia semanal: debe regir la semana completa.'});continue}
   let valor=d.valor
   if(d.tipo==='turno'&&d.turno){
    let k=String(d.valor)
    if(turnos[k]&&JSON.stringify(turnos[k])!==JSON.stringify(d.turno))k=`${d.valor} (${desde})`
    turnos[k]=d.turno;valor=k
   }
   const {turno:_t,...c}=d
   conds.push({...c,...(valor!==undefined?{valor}:{}),id:varios?`${d.id}@${desde}`:d.id,colaboradorId:c.colaboradorId??f.colaborador_id??undefined,desde,hasta})
  }
 }
 if(conds.length)opciones.condiciones_supervisor={version:1,sucursal_id:sucursal,semana,condiciones:conds,...(Object.keys(turnos).length?{turnos}:{})}
 return {opciones,traza,conflictos,semana,domingo,notas}
}

/** Semanas (lunes) afectadas por una vigencia, acotadas a un horizonte para la simulación previa. */
export function semanasAfectadas(desde:string,hasta:string|null,horizonte=26){
 const d=new Date(`${desde}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7))
 const out:string[]=[];let l=d.toISOString().slice(0,10)
 while(out.length<horizonte&&(hasta===null||l<=hasta)){out.push(l);l=sumarDias(l,7)}
 return out
}
export type Cambio={tipo:'crear';fila:NuevaFila}|{tipo:'reemplazar';anterior:FilaConfigMotor;fila:NuevaFila}|{tipo:'desactivar';anterior:FilaConfigMotor}
/**
 * Simulación previa: aplica el cambio sobre una copia y devuelve los conflictos NUEVOS que provocaría en las semanas
 * afectadas. Un cambio solo se guarda si no crea conflictos: así guardar, cambiar o desactivar una regla no invalida
 * otras.
 */
export function simularCambio(filas:FilaConfigMotor[],cambio:Cambio,sucursal:string):ConflictoConfig[]{
 const despues=filas.map(f=>({...f}))
 let desde:string,hasta:string|null
 if(cambio.tipo==='desactivar'){const a=despues.find(f=>f.id===cambio.anterior.id);if(a)a.activa=false;desde=cambio.anterior.vigencia_desde;hasta=cambio.anterior.vigencia_hasta}
 else{
  validarFila(cambio.fila)
  if(cambio.tipo==='reemplazar'){
   const a=despues.find(f=>f.id===cambio.anterior.id)
   if(a){if(cambio.fila.vigencia_desde<=a.vigencia_desde)a.activa=false;else a.vigencia_hasta=sumarDias(cambio.fila.vigencia_desde,-1)}
  }
  despues.push({...cambio.fila,id:'__nueva__',activa:true})
  desde=cambio.fila.vigencia_desde;hasta=cambio.fila.vigencia_hasta
 }
 const firma=(c:ConflictoConfig)=>`${c.tipo}|${c.colaboradorId}|${c.detalle}`
 const nuevos=new Map<string,ConflictoConfig>()
 for(const s of semanasAfectadas(desde,hasta)){
  const antes=new Set(resolverConfiguracion(filas,sucursal,s).conflictos.map(firma))
  for(const c of resolverConfiguracion(despues,sucursal,s).conflictos)if(!antes.has(firma(c)))nuevos.set(firma(c),{...c,detalle:`Semana del ${s}: ${c.detalle}`})
 }
 return [...nuevos.values()]
}

/** Importación asistida de la configuración que hoy entrega el servicio. No guarda: el supervisor revisa y confirma. */
export function proponerImportacion(cfg:OpcionesGeneracion,sucursal:string,motivo='importado de la configuración del servicio'):NuevaFila[]{
 const out:NuevaFila[]=[]
 const base={sucursal_id:sucursal,motivo}
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
  const franjas:FranjaApertura[]=[]
  ap.forEach((row,dia)=>{for(let s=0;s<row.length;){if(!row[s]){s++;continue}let e=s;while(e<row.length&&row[e])e++;franjas.push({dia,desde:slotAHora(s),hasta:slotAHora(e)});s=e}})
  if(desde)out.push({...base,clase:'permanente',tipo:'excepcion_apertura_aux_unico',colaborador_id:null,vigencia_desde:desde,vigencia_hasta:null,datos:{franjas}})
 }
 if(cs&&cs.sucursal_id===sucursal)for(const c of cs.condiciones){
  const {desde,hasta,...datos}=c
  const turno=c.tipo==='turno'?cs.turnos?.[String(c.valor)]:undefined
  out.push({...base,clase:'temporal',tipo:'condicion_supervisor',colaborador_id:c.colaboradorId??null,vigencia_desde:desde,vigencia_hasta:hasta,datos:{...datos,...(turno?{turno}:{})} as Record<string,unknown>})
 }
 return out.map(validarFila)
}

// ── Acceso a datos: lectura con RLS; escrituras SOLO por funciones atómicas con control de versión ─────────────────
interface ClienteMinimo {from:(t:string)=>any;rpc:(fn:string,args:Record<string,unknown>)=>any}
const tablaAusente=(e:{code?:string;message?:string}|null)=>!!e&&(e.code==='42P01'||e.code==='PGRST205'||e.code==='PGRST202'||/does not exist|schema cache/i.test(e.message??''))
function errorEscritura(e:{code?:string;message?:string}):ErrorConfigMotor{
 const m=e.message??''
 if(/CONFLICTO_CONCURRENTE/.test(m)||e.code==='40001')return new ErrorConfigMotor('CONCURRENCIA','Otra persona o pestaña cambió esta regla mientras la editabas. Se recargó la configuración: revisá y volvé a intentar.')
 if(/cms_sin_superposicion/.test(m)||e.code==='23P01')return new ErrorConfigMotor('SUPERPOSICION','Ya hay una regla de la misma clase para ese alcance en esas fechas. Cerrala o cambiala en lugar de agregar otra.')
 if(/SESION_REQUERIDA/.test(m)||e.code==='42501')return new ErrorConfigMotor('SESION','Iniciá sesión nuevamente.')
 if(/NO_ENCONTRADA/.test(m))return new ErrorConfigMotor('NO_ENCONTRADA','La regla ya no existe o no es de esta cuenta.')
 if(/REGLA_INACTIVA/.test(m))return new ErrorConfigMotor('INACTIVA','La regla ya estaba desactivada.')
 if(/ALCANCE_DISTINTO/.test(m))return new ErrorConfigMotor('ALCANCE','El reemplazo debe ser del mismo tipo, clase y persona.')
 return new ErrorConfigMotor('ESCRITURA','No se pudo guardar la configuración. No se aplicó ningún cambio.')
}
const payload=(f:NuevaFila)=>({sucursal_id:f.sucursal_id,clase:f.clase,tipo:f.tipo,colaborador_id:f.colaborador_id,vigencia_desde:f.vigencia_desde,vigencia_hasta:f.vigencia_hasta,datos:f.datos,motivo:f.motivo})

/** Lee la configuración de la sucursal (incluye historial). Tabla aún no creada → {disponible:false}. */
export async function cargarConfiguracionMotor(db:Pick<ClienteMinimo,'from'>,usuario:string,sucursal:string):Promise<{disponible:boolean;filas:FilaConfigMotor[]}>{
 const {data,error}=await db.from(TABLA_CONFIG).select('*').eq('local_id',usuario).eq('sucursal_id',sucursal).order('vigencia_desde',{ascending:true})
 if(tablaAusente(error))return {disponible:false,filas:[]}
 if(error)throw new ErrorConfigMotor('LECTURA','No se pudo leer la configuración del motor.')
 const filas=(data??[]) as FilaConfigMotor[]
 if(filas.some(f=>f.local_id!==usuario||f.sucursal_id!==sucursal))throw new ErrorConfigMotor('ALCANCE','Configuración fuera del ámbito autorizado.')
 return {disponible:true,filas}
}
async function llamar(db:ClienteMinimo,fn:string,args:Record<string,unknown>){
 const {data,error}=await db.rpc(fn,args)
 if(error)throw errorEscritura(error)
 return data
}
/** Aplica un cambio validado y simulado. Rechaza antes de escribir si crea conflictos. Atómico en la base. */
export async function aplicarCambio(db:ClienteMinimo,filas:FilaConfigMotor[],cambio:Cambio,sucursal:string){
 const conflictos=simularCambio(filas,cambio,sucursal)
 if(conflictos.length)throw new ErrorConfigMotor('CONFLICTO',conflictos.map(c=>c.detalle).join(' '))
 if(cambio.tipo==='crear')return llamar(db,'cms_crear',{p:payload(cambio.fila)})
 if(cambio.tipo==='reemplazar')return llamar(db,'cms_reemplazar',{p_id:cambio.anterior.id,p_version:cambio.anterior.version??1,p:payload(cambio.fila)})
 return llamar(db,'cms_desactivar',{p_id:cambio.anterior.id,p_version:cambio.anterior.version??1})
}
/** Importación todo-o-nada (una transacción en la base). */
export async function importarFilas(db:ClienteMinimo,filas:FilaConfigMotor[],nuevas:NuevaFila[],sucursal:string){
 let acumuladas=filas
 for(const f of nuevas){
  const c=simularCambio(acumuladas,{tipo:'crear',fila:f},sucursal)
  if(c.length)throw new ErrorConfigMotor('CONFLICTO',c.map(x=>x.detalle).join(' '))
  acumuladas=[...acumuladas,{...f,id:`__imp${acumuladas.length}`,activa:true}]
 }
 return llamar(db,'cms_importar',{p_filas:nuevas.map(payload)})
}
