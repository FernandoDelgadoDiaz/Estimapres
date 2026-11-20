import {asignarIdentidadesV2,convertirOutputDeV2} from '../algoritmo/adapter'
import type {InputAlgoritmo} from '../algoritmo/types'
import type {EntradaMultiArranque} from '../utils/generacionMultiArranque'
import type {ResultadoAsignacion} from '../types'
import {generarPropuestaHibrida,type EventoProgreso} from './orquestador'
import {transporteHttpPiloto} from './transporteHttpPiloto'
import {politicaLaboratorioV1} from './politica'

export interface RegistroHibrido {
 version:1; algoritmo:'ah2-hibrido-091-v1'; origen:'A'|'B'; estadoB:string; hashEntrada:string|null
 /** Snapshot acotado a la semana, sin JWT ni usuario Auth. Revalida ediciones y reexportación. */
 entrada:InputAlgoritmo; uiPorMotor:Record<string,string>
 minimosCajeros?:EntradaMultiArranque['contexto']['minimosCajeros']
}
export interface EntradaIntegrada {entrada:EntradaMultiArranque;servicio:string;token:string}
export async function generarSemanaIntegrada(e:EntradaIntegrada,onProgreso?:(p:EventoProgreso)=>void,signal?:AbortSignal):Promise<ResultadoAsignacion> {
 if(e.entrada.input.sucursal_id!=='091')throw new Error('Sucursal no habilitada para el motor híbrido.')
 if(Object.keys(e.entrada.input.disponibilidad_eventual).length&&!e.entrada.input.disponibilidad_caja_eventual)throw new Error('Falta la disponibilidad de caja EVENTUAL acreditada en la configuración privada.')
 if(signal?.aborted)throw new DOMException('Generación cancelada','AbortError')
 const input=politicaLaboratorioV1({...e.entrada.input,equilibrio_semanal_version:1})
 const salida=await generarPropuestaHibrida(input,{id:crypto.randomUUID(),sucursal:'091',timeoutMs:150000,
  parametros:{segundos:120,modo:'global',semilla:20261119},transporte:transporteHttpPiloto(e.servicio,async()=>e.token,signal),onProgreso})
 if(signal?.aborted)throw new DOMException('Generación cancelada','AbortError')
 if(!salida.propuesta||!salida.origen)throw new Error('Ninguna propuesta cumple las restricciones obligatorias. Revisá la configuración; no se relajaron reglas.')
 if(salida.bloqueos.length)throw new Error(`Faltan datos para generar con el motor híbrido: ${salida.bloqueos.join(', ')}.`)
 const {cajeros,auxiliares,eventuales}=e.entrada
 const resultado=convertirOutputDeV2(salida.propuesta,cajeros,auxiliares,eventuales)
 const ids=asignarIdentidadesV2([...cajeros,...auxiliares,...eventuales])
 resultado.hibrido={version:1,algoritmo:'ah2-hibrido-091-v1',origen:salida.origen,estadoB:salida.estadoB,hashEntrada:salida.hashEntrada,
  entrada:input,minimosCajeros:structuredClone(e.entrada.contexto.minimosCajeros??[]),uiPorMotor:Object.fromEntries([...ids.uiPorV2].map(([k,p])=>[k,p.id]))}
 resultado.alertas.push(salida.origen==='B'?'Motor híbrido: se eligió una propuesta mejor validada.':`Motor híbrido: se conserva A como respaldo validado (${salida.estadoB}).`)
 return resultado
}
