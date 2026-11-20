/**
 * Carga local (en el navegador, sin subir nada) del POM y la dotación para el laboratorio. Dos formatos:
 * 1. Paquete de pantalla `aliada-lab-paquete/1`: {version, necesidad (franjas POM), cajeros, auxiliares, eventuales,
 *    excepciones?, opciones?} → se traduce con el MISMO adaptador de la aplicación (`convertirInputAV2`).
 * 2. Entrada del motor (`InputAlgoritmo`): {demanda 7×30, colaboradores, presencia_aux, disponibilidad_eventual, …}.
 * Errores de forma en castellano; nunca se completan datos faltantes.
 */
import type {InputAlgoritmo} from '../algoritmo/types'
import {convertirInputAV2,type OpcionesGeneracion} from '../algoritmo/adapter'
import type {Auxiliar,Colaborador,Eventual,ExcepcionSemanal,Franja} from '../types'

export const VERSION_PAQUETE='aliada-lab-paquete/1'
export interface PaqueteLab {version:typeof VERSION_PAQUETE;sucursal:string;semana:string;necesidad:Franja[];cajeros:Colaborador[];auxiliares:Auxiliar[];eventuales:Eventual[];excepciones?:ExcepcionSemanal[];opciones?:OpcionesGeneracion}

const matriz=(m:unknown)=>Array.isArray(m)&&m.length===7&&m.every(r=>Array.isArray(r)&&r.length===30)

export function cargarPaquete(texto:string):{input:InputAlgoritmo;resumen:string}{
 let x:Record<string,unknown>
 try{x=JSON.parse(texto)}catch{throw new Error('El archivo no es JSON válido.')}
 if(!x||typeof x!=='object')throw new Error('El archivo no contiene un objeto.')
 if(x.version===VERSION_PAQUETE){
  const p=x as unknown as PaqueteLab
  if(!Array.isArray(p.necesidad)||!Array.isArray(p.cajeros)||!Array.isArray(p.auxiliares)||!Array.isArray(p.eventuales))throw new Error('Paquete incompleto: faltan necesidad, cajeros, auxiliares o eventuales.')
  if(typeof p.sucursal!=='string'||!/^\d{4}-\d\d-\d\d$/.test(String(p.semana)))throw new Error('Paquete sin sucursal o semana (AAAA-MM-DD).')
  const input=convertirInputAV2(p.necesidad,p.cajeros,p.auxiliares,p.eventuales,p.excepciones??[],{...p.opciones,sucursal_id:p.sucursal,semana:p.semana})
  return {input,resumen:`Paquete de pantalla · sucursal ${p.sucursal} · semana ${p.semana}`}
 }
 const i=x as unknown as InputAlgoritmo
 if(!matriz(i.demanda)||!Array.isArray(i.colaboradores)||typeof i.presencia_aux!=='object'||typeof i.disponibilidad_eventual!=='object')
  throw new Error(`Formato no reconocido: se espera «${VERSION_PAQUETE}» o una entrada del motor (demanda 7×30, colaboradores, presencia_aux, disponibilidad_eventual).`)
 return {input:i,resumen:`Entrada del motor · sucursal ${i.sucursal_id??'sin dato'} · semana ${i.semana??'sin dato'}`}
}
