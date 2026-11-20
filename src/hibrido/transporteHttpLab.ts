/**
 * Transporte de navegador para el LABORATORIO: POST del sobre al servidor de desarrollo local (`/__lab/cp-sat`),
 * que responde con NDJSON: líneas {tipo:'progreso',...} a medida que CP-SAT termina cada fase y una línea final
 * {tipo:'respuesta',respuesta}. Solo existe con `npm run dev` y AH2_LAB_CPSAT_DIR definido; no hay endpoint
 * desplegado. Nunca se usa en la aplicación productiva.
 */
import type {TransporteB} from './transporte'
import {canonico} from './contrato'

export const RUTA_LAB_CPSAT='/__lab/cp-sat'

export async function cpSatLabDisponible(base=''):Promise<boolean>{
 try{const r=await fetch(`${base}${RUTA_LAB_CPSAT}/estado`);return r.ok&&(await r.json())?.disponible===true}catch{return false}
}

export function transporteHttpLab(base='',signal?:AbortSignal):TransporteB{
 return async(sobre,ctx)=>{
  const r=await fetch(`${base}${RUTA_LAB_CPSAT}`,{method:'POST',headers:{'content-type':'application/json'},body:canonico(sobre),signal})
  if(!r.ok||!r.body)throw new Error(`servidor de laboratorio respondió ${r.status}`)
  const lector=r.body.getReader(),dec=new TextDecoder()
  let buf='',respuesta:unknown
  for(;;){
   const {value,done}=await lector.read()
   if(value)buf+=dec.decode(value,{stream:true})
   const lineas=buf.split('\n');buf=done?'':lineas.pop()??''
   for(const l of done?[...lineas,buf]:lineas){
    if(!l.trim())continue
    const e=JSON.parse(l)
    if(e.tipo==='progreso')ctx?.onProgreso?.({objetivo:e.objetivo,estado:e.estado,segundos:e.segundos})
    else if(e.tipo==='respuesta')respuesta=e.respuesta
    else if(e.tipo==='error')throw new Error(String(e.detalle??'error del servidor de laboratorio'))
   }
   if(done)break
  }
  if(respuesta===undefined)throw new Error('el servidor de laboratorio no envió respuesta')
  return respuesta
 }
}
