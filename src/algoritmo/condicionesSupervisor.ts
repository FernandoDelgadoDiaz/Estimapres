import type {InputAlgoritmo,ResultadoSemanal} from './types'
import type {CondicionActiva,AuditoriaCondiciones} from './condicionesTipos'
import {factibilidadIndividual} from './pasada1-fullpart'
import {ejecutarPasada2} from './pasada2-auxiliares'
export class ErrorCondiciones extends Error {constructor(public codigo:string,public conflictos:Conflicto[]=[]){super(codigo)}}
export interface Conflicto {codigo:string;causas:string[];demostrado:boolean;persona?:string;dia?:number;detalle?:string}
const day=(v:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw new ErrorCondiciones('VIGENCIA_CONDICION');return Date.parse(v+'T00:00:00Z')}
const slot=(v:string)=>{if(!/^(?:0[89]|1[0-9]|2[0-3]):(?:00|30)$/.test(v))throw new ErrorCondiciones('INTERVALO_TURNO');const[h,m]=v.split(':').map(Number);return(h-8)*2+m/30}
export function compilarCondiciones(original:InputAlgoritmo):{input:InputAlgoritmo;auditoria?:AuditoriaCondiciones}{
 const req=original.condiciones_supervisor
 if(!req)return {input:original,auditoria:original.auditoria_condiciones}
 if(req.version!==1||!Array.isArray(req.condiciones))throw new ErrorCondiciones('VERSION_CONDICIONES')
 if(!original.sucursal_id||req.sucursal_id!==original.sucursal_id)throw new ErrorCondiciones('SUCURSAL_CONDICIONES')
 if(!original.semana||req.semana!==original.semana||new Date(day(req.semana)).getUTCDay()!==1)throw new ErrorCondiciones('SEMANA_CONDICIONES')
 const monday=day(req.semana),input=structuredClone(original);delete input.condiciones_supervisor
 const people=new Map(input.colaboradores.map(c=>[c.id,c])),active:CondicionActiva[]=[],ignored:string[]=[],excluded=new Set<string>(),seen=new Set<string>()
 for(const row of req.condiciones){
  if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||seen.has(row.id))throw new ErrorCondiciones('ID_CONDICION');seen.add(row.id)
  if(!['DEBE','PREFERIRIA'].includes(row.modo)||!['franco','turno','exclusion_manual','max_francos','franco_medio_corrido'].includes(row.tipo))throw new ErrorCondiciones('TIPO_CONDICION')
  const lo=day(row.desde),hi=day(row.hasta);if(lo>hi)throw new ErrorCondiciones('VIGENCIA_CONDICION')
  if(row.dia!==undefined&&(!Number.isInteger(row.dia)||row.dia<0||row.dia>6))throw new ErrorCondiciones('DIA_CONDICION')
  const days=Array.from({length:7},(_,d)=>d).filter(d=>lo<=monday+d*86400000&&monday+d*86400000<=hi&&(row.dia===undefined||row.dia===d))
  if(!days.length){ignored.push(row.id);continue}
  const c:CondicionActiva={...row,dias:days}
  if(row.tipo==='max_francos'){
   if(row.modo!=='DEBE'||!Number.isInteger(row.valor)||Number(row.valor)<0||Number(row.valor)>160)throw new ErrorCondiciones('MAX_FRANCOS_CONDICION')
   input.max_francos_por_dia??=Array(7).fill(input.max_francos_dia??2)
   for(const d of days)input.max_francos_por_dia![d]=Math.min(input.max_francos_por_dia![d],input.max_francos_dia??2,Number(row.valor))
  }else{
   const person=people.get(row.colaboradorId??'')
   if(!person||!['FULL','PART'].includes(person.rol))throw new ErrorCondiciones('PERSONA_CONDICION_FULL_PART')
   if(row.tipo==='franco'&&row.dia===undefined)throw new ErrorCondiciones('DIA_FRANCO')
   if(row.tipo==='franco_medio_corrido'&&(row.modo!=='PREFERIRIA'||person.rol!=='FULL'||days.length!==7))throw new ErrorCondiciones('PREFERENCIA_MEDIO_FRANCO_SEMANA_FULL')
   if(row.tipo==='exclusion_manual'){
    if(row.modo!=='DEBE'||days.length!==7)throw new ErrorCondiciones('EXCLUSION_MANUAL_SEMANA_COMPLETA');excluded.add(person.id)
   }
   const turn=row.tipo==='turno'?req.turnos?.[String(row.valor)]:undefined
   if(row.tipo==='turno'){
    if(!turn)throw new ErrorCondiciones('DEFINICION_TURNO_PENDIENTE')
    const a=slot(turn.inicioMin),b=slot(turn.inicioMax),z=turn.finMax?slot(turn.finMax):30
    if(!(0<=a&&a<=b&&b<30&&b<z&&z<=30))throw new ErrorCondiciones('INTERVALO_TURNO');c.ventana={min:a,max:b,fin:z}
   }
   if(row.modo==='DEBE'&&row.tipo!=='exclusion_manual'){
    const common={id:row.id,colaboradorId:person.id,colaboradorNombre:person.nombre,dias:days,descripcion:`DEBE ${row.tipo} [${row.id}]`};const exc=input.excepciones??=[]
    if(row.tipo==='franco')exc.push({...common,tipo:'franco_dia',valor:String(row.dia)})
    if(turn){exc.push({...common,tipo:'no_antes_de',valor:turn.inicioMin},{...common,tipo:'inicio_no_despues_de',valor:turn.inicioMax});if(turn.finMax)exc.push({...common,tipo:'no_despues_de',valor:turn.finMax})}
   }
  }
  active.push(c)
 }
 if(active.some(c=>excluded.has(c.colaboradorId??'')&&c.tipo!=='exclusion_manual'))throw new ErrorCondiciones('CONDICION_SOBRE_EXCLUIDO')
 input.colaboradores=input.colaboradores.filter(c=>!excluded.has(c.id))
 input.excepciones=(input.excepciones??[]).filter(e=>!(e.colaboradorId?excluded.has(e.colaboradorId):[...excluded].some(id=>people.get(id)?.nombre===e.colaboradorNombre)))
 for(const key of ['contratos','inicio_minimo_lunes_por_colaborador','preferencias_turno','semillas'] as const)if(input[key]){for(const id of excluded)delete input[key]![id]}
 const auditoria:AuditoriaCondiciones={version:1,sucursal_id:req.sucursal_id,semana:req.semana,aplicadas:active,ignoradas:ignored,excluidos:[...excluded].sort(),publicable:false}
 input.auditoria_condiciones=auditoria
 return {input,auditoria}
}
export function prevalidarCondiciones(original:InputAlgoritmo){
 const {input,auditoria}=compilarCondiciones(original),conflictos:Conflicto[]=[]
 if(!auditoria)return{input,auditoria,conflictos}
 if((input.max_francos_por_dia??Array(7).fill(input.max_francos_dia??2)).reduce((a,b)=>a+b,0)<input.colaboradores.filter(c=>c.rol==='FULL'||c.rol==='PART').length)conflictos.push({codigo:'CAPACIDAD_FRANCOS_INSUFICIENTE',causas:auditoria.aplicadas.filter(c=>c.tipo==='max_francos').map(c=>c.id),demostrado:true})
 const forced=Array.from({length:7},()=>new Set<string>())
 for(const e of input.excepciones??[])if(e.tipo==='franco_dia'&&e.valor!==undefined){const n=Number(e.valor);if(Number.isInteger(n)&&n>=0&&n<7)for(const p of input.colaboradores)if(e.colaboradorId?p.id===e.colaboradorId:p.nombre===e.colaboradorNombre)forced[n].add(p.id)}
 for(let d=0;d<7;d++)if(forced[d].size>(input.max_francos_por_dia?.[d]??input.max_francos_dia??2))conflictos.push({codigo:'MAX_FRANCOS_INCOMPATIBLE',dia:d,causas:auditoria.aplicadas.filter(c=>c.modo==='DEBE'&&(c.tipo==='max_francos'||forced[d].has(c.colaboradorId??''))).map(c=>c.id),demostrado:true})
 for(const p of input.colaboradores.filter(p=>p.rol==='FULL'||p.rol==='PART')){
  const causes=auditoria.aplicadas.filter(c=>c.modo==='DEBE'&&c.colaboradorId===p.id).map(c=>c.id)
  if(causes.length&&!factibilidadIndividual(input,p))conflictos.push({codigo:'CONTRATO_INDIVIDUAL_INVIABLE',persona:p.id,causas:causes,demostrado:true})
 }
 const zero=Array.from({length:7},()=>Array(30).fill(0)),p2=ejecutarPasada2(input,{jornadas_full:{},jornadas_part:{},deficit_1:zero,infactibles:[],cumplimiento_horas:[]})
 conflictos.push(...p2.violaciones_input.map(v=>({codigo:v.regla,causas:[],demostrado:false,detalle:v.detalle})))
 return{input,auditoria,conflictos}
}
export function costePreferencias(a:AuditoriaCondiciones|undefined,r:ResultadoSemanal){
 let coste=0;const weeks={...r.jornadas_full,...r.jornadas_part}
 for(const c of a?.aplicadas??[]){if(c.modo!=='PREFERIRIA')continue;const w=weeks[c.colaboradorId!];if(!w)continue
  if(c.tipo==='franco_medio_corrido'){const off=w.find(j=>!j.bloques.length)?.dia,half=w.find(j=>j.bloques.reduce((n,b)=>n+b.slot_fin-b.slot_inicio,0)===10)?.dia;coste+=Number(off===undefined||half===undefined||Math.abs(off-half)!==1)}
  else for(const d of c.dias){const b=w.find(j=>j.dia===d)!.bloques;if(c.tipo==='franco')coste+=Number(b.length>0);else if(b.length&&c.ventana)coste+=Number(!(c.ventana.min<=b[0].slot_inicio&&b[0].slot_inicio<=c.ventana.max&&b[b.length-1].slot_fin<=c.ventana.fin))}
 }
 return coste
}
/** Guía heurística, nunca otra restricción dura; la aceptación protege cobertura. */
export function guiarPreferencias(input:InputAlgoritmo){
 const x=structuredClone(input)
 for(const c of x.auditoria_condiciones?.aplicadas??[])if(c.modo==='PREFERIRIA'){
  if(c.tipo==='franco_medio_corrido'){x.franco_medio_corridos=true;continue}
  const id=c.colaboradorId!,p=x.preferencias_turno??={},q=p[id]??={};q.porDia??={}
  for(const d of c.dias){const v=q.porDia[d]??={};if(c.tipo==='franco')v.franco=12;else if(c.tipo==='turno'){if(c.ventana!.max<=6)v.manana=12;else v.tarde=12}}
 }
 return x
}
