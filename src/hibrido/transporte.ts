/**
 * Transporte A → B (LABORATORIO). La interfaz es una función asíncrona que recibe el sobre y devuelve la
 * respuesta cruda (JSON parseado). No hay implementación productiva: CP-SAT no corre en el navegador y no se
 * habilitó ningún servicio. El transporte por proceso local (Node) vive en `transporteProceso.ts` y solo lo
 * usan las pruebas y el laboratorio; nunca se importa desde la aplicación.
 */
import type {SobreSolicitud} from './contrato'

export interface FaseB {objetivo:string;estado:string;segundos?:number}
export type TransporteB=(sobre:SobreSolicitud,ctx?:{onProgreso?:(f:FaseB)=>void})=>Promise<unknown>
