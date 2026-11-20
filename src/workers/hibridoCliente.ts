import {generarSemanaIntegrada,type EntradaIntegrada} from '../hibrido/generacionIntegrada'
import type {ResultadoAsignacion} from '../types'
import type {EventoProgreso} from '../hibrido/orquestador'
export function ejecutarHibridoEnWorker(entrada:EntradaIntegrada,signal:AbortSignal,onProgreso:(p:EventoProgreso)=>void,compatible:()=>void):Promise<ResultadoAsignacion> {
 if(signal.aborted)return Promise.reject(new DOMException('Generación cancelada','AbortError'))
 let worker:Worker
 try{worker=new Worker(new URL('./hibrido.worker.ts',import.meta.url),{type:'module'})}
 catch{compatible();return generarSemanaIntegrada(entrada,onProgreso,signal)}
 return new Promise((resolve,reject)=>{
  let iniciado=false,cerrado=false
  const cerrar=()=>{cerrado=true;signal.removeEventListener('abort',cancelar);worker.terminate()}
  const cancelar=()=>{cerrar();reject(new DOMException('Generación cancelada','AbortError'))}
  signal.addEventListener('abort',cancelar,{once:true})
  worker.onmessage=({data})=>{
   if(cerrado)return
   if(data.tipo==='listo'&&!iniciado){iniciado=true;try{worker.postMessage(entrada)}catch{cerrar();reject(new Error('No se pudo iniciar el motor híbrido.'))}}
   if(data.tipo==='progreso')onProgreso(data.progreso)
   if(data.tipo==='resultado'){cerrar();resolve(data.resultado)}
   if(data.tipo==='error'){cerrar();reject(new Error(data.mensaje))}
  }
  worker.onerror=event=>{event.preventDefault();if(cerrado)return;cerrar();if(iniciado)reject(new Error('Se interrumpió el cálculo. Volvé a generar o elegí el motor anterior.'));else{compatible();generarSemanaIntegrada(entrada,onProgreso,signal).then(resolve,reject)}}
  worker.onmessageerror=()=>{if(!cerrado){cerrar();reject(new Error('No se pudo leer el resultado del motor híbrido.'))}}
 })
}
