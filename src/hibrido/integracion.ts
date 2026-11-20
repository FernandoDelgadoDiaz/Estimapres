import {cargarDatosPiloto} from './pilotoDatos'
import {canonico} from './contrato'
/** Integración en Nueva semana. La ruta anterior queda intacta y se elige antes de acceder al servicio. */
import {supabase} from '../lib/supabase'
import {pedirSesionPiloto} from './transporteHttpPiloto'
import {getSucursalActual} from '../utils/sucursal'
import type {OpcionesGeneracion} from '../algoritmo/adapter'
import type {EdicionTopes} from './topesContrato'
import {editarTopes} from './topesContrato'
import {cargarConfiguracionMotor,resolverConfiguracion,type FilaConfigMotor,type TrazaConfig} from './configuracionPersistente'

export interface ConfigDespliegueHibrido {habilitado:boolean;servicio:string}
export function configHibrido():ConfigDespliegueHibrido {
 return {habilitado:import.meta.env.VITE_AH2_HIBRIDO_091==='true',servicio:import.meta.env.VITE_AH2_OPTIMIZER_URL??''}
}
export function usaHibrido(sucursal:string,anterior=false,cfg=configHibrido()) {
 return sucursal==='091'&&!anterior&&cfg.habilitado&&/^https:\/\//.test(cfg.servicio)
}
export type FuenteConfig='persistida'|'servicio'
/**
 * Configuración privada del motor para la sucursal. Precedencia (AH2-042):
 * 1. Si la sucursal tiene alguna fila ACTIVA en `configuracion_motor_sucursal`, esa es la ÚNICA fuente: se resuelve
 *    para la semana (permanentes + excepciones temporales). No se mezcla con la del servicio.
 * 2. Si no hay filas (o la tabla todavía no existe), se usa la del servicio (`/v1/sesion`, transición).
 * El servicio se consulta siempre: verifica identidad, sucursal y origen y despierta CP-SAT.
 */
export async function configuracionAutenticada(sucursal:string,signal?:AbortSignal,cfg=configHibrido(),semana?:string) {
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
 const persistida=await cargarConfiguracionMotor(supabase,user.id,sucursal)
 const filas:FilaConfigMotor[]=persistida.filas.filter(f=>f.activa)
 let fuente:FuenteConfig='servicio',traza:TrazaConfig[]=[],efectivas=opciones
 if(filas.length){
  fuente='persistida'
  if(semana){
   const r=resolverConfiguracion(filas,sucursal,semana)
   // Un conflicto bloquea solo la generación híbrida de esa semana, con su detalle; no se envía una configuración parcial.
   if(r.conflictos.length)throw new Error(`La configuración del motor tiene conflictos para la semana del ${semana}: ${r.conflictos.map(c=>c.detalle).join(' ')} Corregilos en Reglas → Configuración del motor o usá el motor anterior.`)
   efectivas=r.opciones;traza=r.traza
  }
  else efectivas={}
 }
 return {opciones:efectivas,opcionesServicio:opciones,fuente,traza,filas:persistida.filas,tablaDisponible:persistida.disponible,token:await token(),servicio:cfg.servicio,usuario:user.id}
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
