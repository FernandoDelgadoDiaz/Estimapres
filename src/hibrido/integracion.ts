import {cargarDatosPiloto} from './pilotoDatos'
import {canonico} from './contrato'
/** Integración en Nueva semana. La ruta anterior queda intacta y se elige antes de acceder al servicio. */
import {supabase} from '../lib/supabase'
import {pedirSesionPiloto} from './transporteHttpPiloto'
import {getSucursalActual} from '../utils/sucursal'
import type {OpcionesGeneracion} from '../algoritmo/adapter'
import type {EdicionTopes} from './topesContrato'
import {editarTopes} from './topesContrato'

export interface ConfigDespliegueHibrido {habilitado:boolean;servicio:string}
export function configHibrido():ConfigDespliegueHibrido {
 return {habilitado:import.meta.env.VITE_AH2_HIBRIDO_091==='true',servicio:import.meta.env.VITE_AH2_OPTIMIZER_URL??''}
}
export function usaHibrido(sucursal:string,anterior=false,cfg=configHibrido()) {
 return sucursal==='091'&&!anterior&&cfg.habilitado&&/^https:\/\//.test(cfg.servicio)
}
export async function configuracionAutenticada(sucursal:string,signal?:AbortSignal,cfg=configHibrido()) {
 if(!usaHibrido(sucursal,false,cfg)||!supabase)throw new Error('El motor híbrido no está habilitado para esta sucursal.')
 const {data:{user},error}=await supabase.auth.getUser()
 if(error||!user||user.is_anonymous)throw new Error('Iniciá sesión nuevamente para usar el motor híbrido.')
 const token=async()=>{
  const {data:{session}}=await supabase!.auth.getSession()
  if(!session||session.user.id!==user.id||session.user.is_anonymous)throw new Error('La sesión cambió. Volvé a generar.')
  return session.access_token
 }
 const sesion=await pedirSesionPiloto(cfg.servicio,token,signal)
 if(sesion.usuario!==user.id||sesion.sucursal!==sucursal||getSucursalActual()!==sucursal)throw new Error('El servicio no corresponde a esta cuenta y sucursal.')
 // Solo las opciones privadas aprobadas. No se permite que el servidor reemplace reglas/contratos de pantalla.
 const opciones:OpcionesGeneracion={}
 for(const k of ['disponibilidad_caja_eventual','topes_caja_eventual_contrato','condiciones_supervisor','excepcion_apertura_aux_unico'] as const) {
  if(sesion.configuracion[k]!==undefined)Object.assign(opciones,{[k]:sesion.configuracion[k]})
 }
 return {opciones,token:await token(),servicio:cfg.servicio,usuario:user.id}
}
export function opcionesIntegradas(base:OpcionesGeneracion,privadas:OpcionesGeneracion,sucursal:string,semana:string,topes?:EdicionTopes):OpcionesGeneracion {
 if(sucursal!=='091')throw new Error('La activación inicial corresponde únicamente a la 091.')
 return {...base,...privadas,politica_recursos_version:1,sucursal_id:sucursal,semana,
  topes_caja_eventual_contrato:topes?editarTopes(privadas.topes_caja_eventual_contrato,sucursal,semana,topes,'edición del supervisor en Aliada Horarios'):privadas.topes_caja_eventual_contrato}
}

export type DotacionBase=Awaited<ReturnType<typeof cargarDatosPiloto>>
/** Impide enviar una copia local/obsoleta. Las excepciones semanales siguen resolviéndose en la pantalla. */
export async function verificarDatosActuales(usuario:string,sucursal:string,base:DotacionBase) {
 const actual=await cargarDatosPiloto(usuario,sucursal)
 const ordenar=(rows:{id:string}[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id))
 for(const k of ['cajeros','auxiliares','eventuales','reglas'] as const)if(canonico(ordenar(actual[k]))!==canonico(ordenar(base[k])))throw new Error('La dotación o las reglas cambiaron. Recargá Nueva semana antes de generar; no se envió la copia anterior al optimizador.')
}
