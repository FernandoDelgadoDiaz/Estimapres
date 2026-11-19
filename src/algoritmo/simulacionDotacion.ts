/** Escenarios aislados AH2-038. No alta real, persistencia ni extrapolación lineal. */
import type {InputAlgoritmo} from './types'
import {ejecutarAlgoritmo} from './orquestador'
import {auditarEscenario} from './auditoriaV2'
export {auditarEscenario} from './auditoriaV2'

export function simularDotacion(input:InputAlgoritmo){
 return ([0,32,48] as const).map(horas=>{
  const clone=structuredClone(input)
  if(horas){const id=`simulado_${horas}`;if(clone.colaboradores.some(c=>c.id===id))throw new Error('ID de simulación duplicado');clone.colaboradores.push({id,nombre:id,rol:horas===32?'PART':'FULL',horasSemanales:horas});clone.contratos={...clone.contratos,[id]:{objetivoSlots:horas*2,maximoSlots:horas*2,estadoFicha:'valida'}};delete clone.semillas}
  const inicio=performance.now(),resultado=ejecutarAlgoritmo(clone),validacion=auditarEscenario(clone,resultado)
  const total=clone.demanda.flat().reduce((a,b)=>a+b,0),missing=resultado.metricas.deficit_por_slot.flat().reduce((a,b)=>a+b,0)
  return {horasAdicionales:horas,input:clone,resultado,validacion,segundos:(performance.now()-inicio)/1000,cobertura:total?100*(1-missing/total):100,faltantesHoras:missing/2,sobrantesHoras:resultado.metricas.exceso_por_slot.flat().reduce((a,b)=>a+b,0)/2,supuesto:'Contratación hipotética con disponibilidad completa, catálogo vigente y sin domingo previo acreditado; no es alta ni propuesta real.'}
 })
}
