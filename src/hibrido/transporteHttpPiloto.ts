/** HTTP del piloto privado; token de sesión por solicitud. Nunca usa el puente Vite. */
import type {TransporteB} from './transporte'
import {canonico} from './contrato'
import type {OpcionesGeneracion} from '../algoritmo/adapter'

/** Identidad y configuración solo después de autenticar con el servicio. Permite arranque en frío. */
export async function pedirSesionPiloto(url:string,token:()=>Promise<string>,signal?:AbortSignal){
 if(!/^https:\/\//.test(url))throw new Error('El servicio privado requiere HTTPS.')
 const jwt=await token();if(!jwt)throw new Error('Iniciá sesión nuevamente.')
 const ctrl=new AbortController(),cancelar=()=>ctrl.abort(signal?.reason)
 if(signal?.aborted)cancelar();else signal?.addEventListener('abort',cancelar,{once:true})
 const timer=setTimeout(()=>ctrl.abort(new Error('El servicio privado no respondió al iniciar.')),90000)
 try{
  const r=await fetch(`${url.replace(/\/$/,'')}/v1/sesion`,{headers:{Authorization:`Bearer ${jwt}`},signal:ctrl.signal,cache:'no-store'})
  if(!r.ok)throw Object.assign(new Error(`No se pudo verificar el acceso privado (${r.status}).`),{status:r.status})
  const s=await r.json()
  if(typeof s?.usuario!=='string'||!s.usuario||typeof s?.sucursal!=='string'||!s.sucursal||!s.configuracion||typeof s.configuracion!=='object'||Array.isArray(s.configuracion))throw new Error('La sesión privada no es válida.')
  return {usuario:s.usuario as string,sucursal:s.sucursal as string,configuracion:s.configuracion as OpcionesGeneracion}
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancelar)}
}

export function transporteHttpPiloto(url:string,token:()=>Promise<string>,signal?:AbortSignal):TransporteB{
 if(!/^https:\/\//.test(url))throw new Error('El servicio privado requiere HTTPS.')
 return async(sobre,ctx)=>{
  const jwt=await token();if(!jwt)throw new Error('Iniciá sesión nuevamente.')
  const r=await fetch(`${url.replace(/\/$/,'')}/v1/optimizar`,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${jwt}`},body:canonico(sobre),signal,cache:'no-store'})
  if(!r.ok||!r.body)throw new Error(`No se pudo usar el servicio privado (${r.status}).`)
  const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',respuesta:unknown
  const line=(text:string)=>{if(!text.trim())return;const e=JSON.parse(text);if(e.tipo==='progreso')ctx?.onProgreso?.({objetivo:e.objetivo,estado:e.estado,segundos:e.segundos});else if(e.tipo==='respuesta')respuesta=e.respuesta;else if(e.tipo==='error')throw new Error(String(e.detalle))}
  try{for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()??'';for(const l of lines)line(l);if(done){line(buffer);break}}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  if(respuesta===undefined)throw new Error('El servicio privado no envió una propuesta.')
  return respuesta
 }
}
