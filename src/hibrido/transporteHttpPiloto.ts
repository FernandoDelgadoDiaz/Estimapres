/** HTTP del piloto privado; token de sesión por solicitud. Nunca usa el puente Vite. */
import type {TransporteB} from './transporte'
import {canonico} from './contrato'

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
