/** AH2-040-P1: análisis de una propuesta, NO regla homologada ni restricción del solver. */
import type {InputAlgoritmo,ResultadoSemanal} from './types'
import {aperturaAuxUnicoAutorizada} from './politicaRecursos'
export interface ParPropuesto {eventualId:string;auxId:string}
export function analizarComparabilidad(input:InputAlgoritmo,r:ResultadoSemanal,pares:ParPropuesto[]=[]){
 const auxMasks:Record<string,Set<string>>={},evMasks:Record<string,Set<string>>={}
 for(const id of Object.keys(input.presencia_aux))auxMasks[id]=new Set()
 for(const id of Object.keys(input.disponibilidad_eventual))evMasks[id]=new Set()
 for(let d=0;d<7;d++){
  let designado:string|undefined
  if(input.supervisor_jornada_completa&&Array.from({length:30},(_,s)=>Object.values(input.presencia_aux).filter(m=>m[d][s]!=='NO_PRESENTE').length).some(n=>n>=2))designado=Object.keys(input.presencia_aux).sort((a,b)=>input.presencia_aux[b][d].filter(x=>x!=='NO_PRESENTE').length-input.presencia_aux[a][d].filter(x=>x!=='NO_PRESENTE').length||a.localeCompare(b))[0]
  for(let s=0;s<30;s++){
   if(input.demanda[d][s]<=0)continue
   const present=Object.keys(input.presencia_aux).filter(id=>input.presencia_aux[id][d][s]!=='NO_PRESENTE')
   const open=s<2&&(input.apertura_solo_aux??true)
   if((open&&(present.length===2||present.length===1&&aperturaAuxUnicoAutorizada(input,d,s)))||(s>=2&&s<=(input.sin_aux_cierre===false?28:27)&&present.length===2))for(const id of present)if(id!==designado&&(!open||[0,1].every(k=>input.presencia_aux[id][d][k]!=='NO_PRESENTE')))auxMasks[id].add(`${d}/${s}`)
   const cut=input.eventuales_caja_hora_limite?((Number(input.eventuales_caja_hora_limite.slice(0,2))-8)*2+Number(input.eventuales_caja_hora_limite.slice(3))/30):30
   if(s>=2&&s<cut)for(const [id,m] of Object.entries(input.disponibilidad_eventual))if(input.max_caja_eventual_slots?.[id]!==0&&m[d][s]!=='NO_DISPONIBLE'&&!input.reservas_sector_eventual?.[id]?.[d]?.[s])evMasks[id].add(`${d}/${s}`)
  }
 }
 const hours=(id:string,role:'AUX'|'EVENTUAL')=>(role==='AUX'?r.asignacion_aux[id]:r.asignacion_eventual[id])?.flat().filter(x=>x==='CAJA').length/2||0
 const candidatos=Object.entries(evMasks).flatMap(([e,em])=>Object.entries(auxMasks).filter(([,am])=>em.size>0&&am.size>0&&[...em].every(s=>am.has(s))).map(([a])=>({eventualId:e,auxId:a,horasCajaEventual:hours(e,'EVENTUAL'),horasCajaAux:hours(a,'AUX'),oportunidadesEventualHoras:em.size/2,oportunidadesAuxHoras:auxMasks[a].size/2})))
 const evaluaciones=pares.map(p=>{const c=candidatos.find(c=>c.auxId===p.auxId&&c.eventualId===p.eventualId);return {...p,comparablePropuesto:!!c,excesoHorasPropuesto:c?Math.max(0,c.horasCajaEventual-c.horasCajaAux):null,estado:c?'PAR_EXPERIMENTAL_REQUIERE_APROBACION':'PAR_NO_COMPARABLE'}})
 return {propuesta:'AH2-040-P1',aprobada:false,publicable:false,criterio:'Oportunidades EVENTUAL contenidas íntegramente en las de AUX elegible, sin supervisor exclusivo; par elegido explícitamente, nunca promedio ni elección automática.',candidatos,evaluaciones,sinComparable:Object.keys(evMasks).filter(e=>!candidatos.some(c=>c.eventualId===e)),sinAsignar:Object.keys(evMasks).filter(e=>!pares.some(p=>p.eventualId===e)),limitacion:'No impone topes ni cambia planes. La pérdida de cobertura al imponer una relación todavía NO se ha probado. Sin par comparable se informa el caso; no se fuerza EVENTUAL a cero.'}
}
