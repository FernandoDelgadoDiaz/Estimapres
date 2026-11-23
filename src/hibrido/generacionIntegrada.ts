import {asignarIdentidadesV2,convertirOutputDeV2} from '../algoritmo/adapter'
import type {InputAlgoritmo} from '../algoritmo/types'
import type {EntradaMultiArranque} from '../utils/generacionMultiArranque'
import type {ResultadoAsignacion} from '../types'
import {generarPropuestaHibrida,type EventoProgreso} from './orquestador'
import {explicarSinPropuesta} from '../utils/diagnosticoGeneracion'
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
 const input=politicaLaboratorioV1({...e.entrada.input,equilibrio_semanal_version:2})
 const salida=await generarPropuestaHibrida(input,{id:crypto.randomUUID(),sucursal:'091',timeoutMs:150000,
  parametros:{segundos:120,modo:'global',semilla:20261119},transporte:transporteHttpPiloto(e.servicio,async()=>e.token,signal),onProgreso})
 if(signal?.aborted)throw new DOMException('Generación cancelada','AbortError')
 // AH2-062: sin propuesta válida se explica por qué, con nombres y sin códigos.
 if(!salida.propuesta||!salida.origen){
  const ids=asignarIdentidadesV2([...e.entrada.cajeros,...e.entrada.auxiliares,...e.entrada.eventuales])
  throw new Error(explicarSinPropuesta(salida.conflictos,Object.fromEntries([...ids.uiPorV2].map(([k,p])=>[k,p.nombre]))))
 }
 if(salida.bloqueos.length)throw new Error(`Faltan datos para generar con el motor híbrido: ${salida.bloqueos.join(', ')}.`)
 const {cajeros,auxiliares,eventuales}=e.entrada
 const resultado=convertirOutputDeV2(salida.propuesta,cajeros,auxiliares,eventuales)
 // La propuesta de CP-SAT no trae `cobertura_total_pct`: se usa la cobertura medida por el orquestador (validadores de A),
 // la misma para A y B. Sin esto el PDF mostraba «Cobertura al generar: 0.0 %».
 if(typeof salida.coberturaPomPct==='number')resultado.porcentajeCobertura=salida.coberturaPomPct
 const ids=asignarIdentidadesV2([...cajeros,...auxiliares,...eventuales])
 resultado.hibrido={version:1,algoritmo:'ah2-hibrido-091-v1',origen:salida.origen,estadoB:salida.estadoB,hashEntrada:salida.hashEntrada,
  entrada:input,minimosCajeros:structuredClone(e.entrada.contexto.minimosCajeros??[]),uiPorMotor:Object.fromEntries([...ids.uiPorV2].map(([k,p])=>[k,p.id]))}
 resultado.alertas.push(salida.origen==='B'?'Motor híbrido: se eligió una propuesta mejor validada.':`Motor híbrido: se conserva A como respaldo validado (${salida.estadoB}).`)
 return resultado
}
