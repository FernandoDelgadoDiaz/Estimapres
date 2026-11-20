/// <reference lib="webworker" />
import {generarSemanaIntegrada,type EntradaIntegrada} from '../hibrido/generacionIntegrada'
const worker=self as unknown as DedicatedWorkerGlobalScope
worker.onmessage=async({data}:MessageEvent<EntradaIntegrada>)=>{
 try{const resultado=await generarSemanaIntegrada(data,p=>worker.postMessage({tipo:'progreso',progreso:p}));worker.postMessage({tipo:'resultado',resultado})}
 catch(e){worker.postMessage({tipo:'error',mensaje:e instanceof Error?e.message:'No se pudo generar el horario.'})}
}
worker.postMessage({tipo:'listo'})
