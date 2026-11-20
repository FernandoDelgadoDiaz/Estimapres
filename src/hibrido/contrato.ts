/**
 * Contrato versionado A ↔ B (`aliada-hibrido/1`) — LABORATORIO. Espejo de aliada-optimizer `optimizer/contrato.py`.
 *
 * - Sobre de solicitud con hash SHA-256 de la forma canónica de la entrada (claves ordenadas, sin espacios, UTF-8).
 * - Traducción explícita de la entrada del motor A a la de B: lista blanca de campos; los campos que B no
 *   entiende se informan, nunca se envían en silencio ni se pierden sin aviso.
 * - Validación estricta de la respuesta (versión, id, hash, estado, forma del plan) antes de mirarla.
 * Ningún dato sale del proceso salvo por el transporte inyectado. Nada se publica.
 */
import type {InputAlgoritmo,Jornada,ResultadoSemanal} from '../algoritmo/types'

export const VERSION_CONTRATO='aliada-hibrido/1'
export const ESTADOS_B=['OPTIMAL','FEASIBLE','UNKNOWN','INFEASIBLE','DATOS_INCOMPLETOS','ERROR_CONTRATO','ERROR_INTERNO'] as const
export type EstadoB=typeof ESTADOS_B[number]
export type ModoB='global'|'hybrid'|'sequential'
export interface ParametrosB {segundos:number;modo:ModoB;semilla:number}
export interface EntradaB {profile:{branch_id:string;version:number};input:Record<string,unknown>}
export interface SobreSolicitud {version:typeof VERSION_CONTRATO;id:string;hashEntrada:string;entrada:EntradaB;parametros:ParametrosB}
export interface PlanB {jornadas:Record<string,Jornada[]|unknown[]>;AUX:Record<string,number[][]>;EVENTUAL:Record<string,number[][]>}
export interface RespuestaB {
 version:string;idSolicitud:string|null;hashEntrada:string|null;estado:EstadoB;plan:PlanB|null
 fases:{objetivo:string;estado:string}[];lexCompleto:boolean;segundos:number;incidencias:unknown[];conflictos:unknown[];publicable:false;motor:string
}

/** JSON canónico idéntico a `json.dumps(x, sort_keys=True, separators=(",",":"), ensure_ascii=False)`. */
export function canonico(x:unknown):string{
 if(x===null||typeof x!=='object')return JSON.stringify(x)
 if(Array.isArray(x))return `[${x.map(v=>canonico(v===undefined?null:v)).join(',')}]`
 const o=x as Record<string,unknown>
 return `{${Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
}

export async function hashEntrada(entrada:unknown):Promise<string>{
 const datos=new TextEncoder().encode(canonico(entrada))
 const h=await globalThis.crypto.subtle.digest('SHA-256',datos)
 return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')
}

/** Campos que B entiende tal cual (mismos nombres y unidades). */
const DIRECTOS=['demanda','colaboradores','presencia_aux','disponibilidad_eventual','excepciones','preferencias_turno','max_francos_dia','max_francos_por_dia',
 'pesos_franja','apertura_solo_aux','sin_aux_cierre','supervisor_jornada_completa','franco_medio_corridos','contratos','max_bloques_caja_eventual_dia',
 'eventuales_caja_hora_limite','politica_recursos_version','supervision_apertura_externa','excepcion_apertura_aux_unico','max_caja_eventual_slots','reservas_sector_eventual',
 'disponibilidad_caja_eventual','comparacion_aux_eventual','condiciones_supervisor','sucursal_id','semana'] as const
/** Campos propios de A, sin efecto en las reglas que B debe cumplir (no se envían). */
const SOLO_A=new Set(['semillas','omitir_impacto_horas','experimental','cobertura_objetivo_pct','auditoria_condiciones','disponibilidad_caja_compilada'])

export interface TraduccionB {entrada:EntradaB;noTransportables:string[]}
/** Traduce la entrada de A a la de B. `inicio_minimo_lunes_por_colaborador` (A) ↔ `fin_domingo_anterior` (B): fin = inicio − 24 + 48 franjas. */
export function aEntradaB(input:InputAlgoritmo,branchId:string):TraduccionB{
 const src=input as unknown as Record<string,unknown>
 const out:Record<string,unknown>={}
 for(const k of DIRECTOS)if(src[k]!==undefined)out[k]=src[k]
 if(input.inicio_minimo_lunes_por_colaborador)out.fin_domingo_anterior=Object.fromEntries(Object.entries(input.inicio_minimo_lunes_por_colaborador).map(([id,n])=>[id,n+24]))
 const noTransportables=Object.keys(src).filter(k=>src[k]!==undefined&&!(DIRECTOS as readonly string[]).includes(k)&&!SOLO_A.has(k)&&k!=='inicio_minimo_lunes_por_colaborador').sort()
 return {entrada:{profile:{branch_id:branchId,version:1},input:out},noTransportables}
}

export async function crearSobre(id:string,entrada:EntradaB,parametros:ParametrosB):Promise<SobreSolicitud>{
 if(!(parametros.segundos>0&&parametros.segundos<=120)||!Number.isInteger(parametros.semilla))throw new Error('PARAMETROS_INVALIDOS')
 return {version:VERSION_CONTRATO,id,hashEntrada:await hashEntrada(entrada),entrada,parametros}
}

const esMatrizSlots=(w:unknown)=>Array.isArray(w)&&w.length===7&&w.every(d=>Array.isArray(d)&&d.every(s=>Number.isInteger(s)&&s>=0&&s<30)&&new Set(d).size===d.length)

/** Valida una respuesta cruda de B contra la solicitud. Devuelve la respuesta tipada o el código de rechazo. */
export function validarRespuesta(crudo:unknown,sobre:SobreSolicitud,input:InputAlgoritmo):{ok:true;respuesta:RespuestaB}|{ok:false;codigo:string}{
 const r=crudo as RespuestaB
 if(!r||typeof r!=='object')return {ok:false,codigo:'RESPUESTA_FORMA'}
 if(r.version!==VERSION_CONTRATO)return {ok:false,codigo:'RESPUESTA_VERSION'}
 if(r.estado==='ERROR_CONTRATO'||r.estado==='ERROR_INTERNO')return {ok:true,respuesta:r}
 if(r.idSolicitud!==sobre.id)return {ok:false,codigo:'RESPUESTA_ID_DISTINTO'}
 if(r.hashEntrada!==sobre.hashEntrada)return {ok:false,codigo:'RESPUESTA_HASH_DISTINTO'}
 if(!ESTADOS_B.includes(r.estado))return {ok:false,codigo:'RESPUESTA_ESTADO_DESCONOCIDO'}
 if(r.publicable!==false)return {ok:false,codigo:'RESPUESTA_PUBLICABLE'}
 if(r.plan===null||r.plan===undefined){
  if(r.estado==='OPTIMAL'||r.estado==='FEASIBLE')return {ok:false,codigo:'RESPUESTA_SIN_PLAN'}
  return {ok:true,respuesta:{...r,plan:null}}
 }
 const p=r.plan
 const ids=(rol:string[])=>input.colaboradores.filter(c=>rol.includes(c.rol)).map(c=>c.id).sort().join()
 if(!p||typeof p!=='object'||!p.jornadas||!p.AUX||!p.EVENTUAL)return {ok:false,codigo:'PLAN_FORMA'}
 if(Object.keys(p.jornadas).sort().join()!==ids(['FULL','PART']))return {ok:false,codigo:'PLAN_DOTACION'}
 if(Object.keys(p.AUX).sort().join()!==ids(['AUX'])||Object.keys(p.EVENTUAL).sort().join()!==ids(['EVENTUAL']))return {ok:false,codigo:'PLAN_APOYO'}
 if(![...Object.values(p.AUX),...Object.values(p.EVENTUAL)].every(esMatrizSlots))return {ok:false,codigo:'PLAN_MATRIZ'}
 for(const [id,js] of Object.entries(p.jornadas)){
  if(!Array.isArray(js))return {ok:false,codigo:'PLAN_JORNADAS'}
  for(const j of js as Jornada[]){
   if(!j||j.colab_id!==id||!Number.isInteger(j.dia)||j.dia<0||j.dia>6||!Array.isArray(j.bloques)||j.bloques.some(b=>!Number.isInteger(b.slot_inicio)||!Number.isInteger(b.slot_fin)||b.slot_inicio<0||b.slot_fin>30||b.slot_inicio>=b.slot_fin))
    return {ok:false,codigo:'PLAN_JORNADAS'}
  }
 }
 return {ok:true,respuesta:r}
}

/** Convierte un plan B validado en la forma de resultado de A. Las métricas propias de A quedan en cero: la
 * cobertura se recalcula siempre desde el plan con `metricasAH2040` (independiente del motor). */
export function planBaResultado(input:InputAlgoritmo,plan:PlanB,semana:ResultadoSemanal['semana']):ResultadoSemanal{
 const rol=(id:string)=>input.colaboradores.find(c=>c.id===id)!.rol
 const marcar=(m:Record<string,string[][]>,src:Record<string,number[][]>)=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map((row,d)=>row.map((v,s)=>src[id][d].includes(s)?'CAJA':v))]))
 const j=plan.jornadas as Record<string,Jornada[]>
 return {semana,jornadas_full:Object.fromEntries(Object.entries(j).filter(([id])=>rol(id)==='FULL')),jornadas_part:Object.fromEntries(Object.entries(j).filter(([id])=>rol(id)==='PART')),
  asignacion_aux:marcar(input.presencia_aux,plan.AUX) as ResultadoSemanal['asignacion_aux'],asignacion_eventual:marcar(input.disponibilidad_eventual,plan.EVENTUAL) as ResultadoSemanal['asignacion_eventual'],
  metricas:{deficit_por_slot:Array.from({length:7},()=>Array(30).fill(0)),exceso_por_slot:Array.from({length:7},()=>Array(30).fill(0)),cobertura_total_pct:0} as unknown as ResultadoSemanal['metricas'],reporte_reglas:{advertencias:[],violaciones:[],duras_cumplidas:true} as unknown as ResultadoSemanal['reporte_reglas']}
}
