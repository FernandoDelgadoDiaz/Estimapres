import type {InputAlgoritmo,ResultadoSemanal} from './types'
/** Horas de caja frente a presencia sectorial, nunca horas salariales nuevas. */
export function resumirRecursos(input:InputAlgoritmo,r:ResultadoSemanal){
 const aux=Object.entries(input.presencia_aux).map(([id,m])=>({id,presenciaHoras:m.flat().filter(s=>s!=='NO_PRESENTE').length/2,cajaHoras:r.asignacion_aux[id].flat().filter(s=>s==='CAJA').length/2}))
 const ev=Object.entries(input.disponibilidad_eventual).map(([id,m])=>{const presenciaHoras=m.flat().filter(s=>s!=='NO_DISPONIBLE').length/2,cajaHoras=r.asignacion_eventual[id].flat().filter(s=>s==='CAJA').length/2;return {id,presenciaHoras,cajaHoras,noCajaHoras:presenciaHoras-cajaHoras,topeCajaHoras:input.max_caja_eventual_slots?.[id]===undefined?null:input.max_caja_eventual_slots[id]/2}})
 return {aux,eventuales:ev,nota:'AUX sin tope semanal manual: asignación por demanda residual y supervisión. No caja no equivale a descanso ni a tiempo ocioso.'}
}
