import type {InputAlgoritmo,ResultadoSemanal} from './types'
import {convertirOutputDeV2} from './adapter'
import {validarResultadoSemana} from '../utils/validacionSemana'
import {PERFIL_HORAS_VIGENTE} from './contratos'
import {verificarAH2040,type ConfigAH2040} from './ah2040'
export function auditarEscenario(input:InputAlgoritmo,r:ResultadoSemanal){
 const cash=input.colaboradores.filter(c=>c.rol==='FULL'||c.rol==='PART').map(c=>({id:c.id,nombre:c.id,tipo:c.rol as 'FULL'|'PART',activo:true,horasSemanales:c.rol==='FULL'?c.horasSemanales:input.contratos?.[c.id]?.objetivoSlots===null?undefined:(input.contratos?.[c.id]?.objetivoSlots??0)/2}))
 const hours=(m:string[][],absent:string)=>m.map(row=>{const b:string[]=[];let start=-1;const clock=(s:number)=>`${String(8+Math.floor(s/2)).padStart(2,'0')}:${s%2?'30':'00'}`;for(let s=0;s<=30;s++){if(s<30&&row[s]!==absent){if(start<0)start=s}else if(start>=0){b.push(`${clock(start)}-${clock(s)}`);start=-1}}return b.join('|')})
 const aux=Object.entries(input.presencia_aux).map(([id,m])=>({id,nombre:id,activo:true,horarioSemanal:hours(m,'NO_PRESENTE')}))
 const ev=Object.entries(input.disponibilidad_eventual).map(([id,m])=>({id,nombre:id,activo:true,sector:'sintético',horarioSemanal:hours(m,'NO_DISPONIBLE')}))
 const necesidad=Array.from({length:31},(_,f)=>({hora:`${String(7+Math.floor(f/2)).padStart(2,'0')}:${f%2?'30':'00'}`,necesidad:Array.from({length:7},(_,d)=>input.demanda[d][f-2]??0)}))
 const operativa={...input,aperturaSoloAux:input.apertura_solo_aux??true,sinAuxCierre:input.sin_aux_cierre??true,supervisorJornadaCompleta:input.supervisor_jornada_completa??false,francoMedioCorridos:input.franco_medio_corridos??false,maxBloquesCajaEventualDia:input.max_bloques_caja_eventual_dia,eventualesCajaHoraLimite:input.eventuales_caja_hora_limite}
 const previo=input.inicio_minimo_lunes_por_colaborador && Object.fromEntries(Object.entries(input.inicio_minimo_lunes_por_colaborador).map(([id,n])=>[id,`${String(20+Math.floor(n/2)).padStart(2,'0')}:${n%2?'30':'00'}`]))
 const v=validarResultadoSemana(convertirOutputDeV2(r,cash,aux,ev),cash,aux,ev,{necesidad,excepciones:(input.excepciones??[]).map(e=>({...e,colaboradorNombre:input.colaboradores.find(c=>c.nombre===e.colaboradorNombre)?.id??e.colaboradorNombre})),operativa,perfilHorasId:PERFIL_HORAS_VIGENTE.id,maxFrancosDia:input.max_francos_dia,maxFrancosPorDia:input.max_francos_por_dia,finDomingoAnteriorPorId:previo})
 // AH2-040 (regla SEMANAL): la verificación de totales semanales EVENTUAL ≤ cada AUX comparable reemplaza el
 // bloqueo «comparación pendiente»; cada incumplimiento individual es una violación operativa.
 const cfg=(input as InputAlgoritmo&{comparacion_aux_eventual?:ConfigAH2040}).comparacion_aux_eventual
 if(!cfg||!['SEMANAL','OPORTUNIDAD','DIAS'].includes(cfg.modo))return v
 const sem=verificarAH2040(input,r,cfg).violaciones.map(x=>({codigo:'OP_EVENTUAL_SUPERA_AUX_COMPARABLE',nivel:'OPERATIVA' as const,colaboradorId:x.eventualId,detalle:`${x.horasEventual} h de caja contra ${x.horasAux} h de ${x.auxId} (exceso ${x.excesoHoras} h).`}))
 const violaciones=[...v.violaciones.filter(x=>x.codigo!=='POLITICA_EV_COMPARACION_PENDIENTE'),...sem]
 return {...v,violaciones,ok:v.ok&&!sem.length,publicable:v.publicable&&!sem.length}
}
