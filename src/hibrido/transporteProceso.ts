/**
 * Transporte de LABORATORIO por proceso aislado: `python -m optimizer.contrato --progreso` (aliada-optimizer) por
 * stdin/stdout; cada fase de CP-SAT llega por stderr como una línea JSON y se reenvía como progreso real.
 * Solo Node (pruebas y servidor de desarrollo). Mata el proceso al vencer el plazo o al cancelarse.
 * Sin red, sin archivos temporales, sin persistencia.
 */
import {spawn} from 'node:child_process'
import type {TransporteB} from './transporte'
import {canonico} from './contrato'

export function transporteProceso(opts:{python:string;cwd:string;plazoMs:number;signal?:AbortSignal}):TransporteB{
 return (sobre,ctx)=>new Promise((resolve,reject)=>{
  const hijo=spawn(opts.python,['-m','optimizer.contrato','--progreso'],{cwd:opts.cwd,stdio:['pipe','pipe','pipe']})
  let out='',err='',pendiente=''
  const fin=(e?:Error)=>{clearTimeout(t);opts.signal?.removeEventListener('abort',cancelar);if(e){hijo.kill('SIGKILL');reject(e)}}
  const cancelar=()=>fin(new Error('generación cancelada'))
  const t=setTimeout(()=>fin(new Error(`proceso B cancelado a los ${opts.plazoMs} ms`)),opts.plazoMs)
  opts.signal?.addEventListener('abort',cancelar)
  hijo.stdout.on('data',d=>{out+=d})
  hijo.stderr.on('data',d=>{
   pendiente+=d
   const lineas=pendiente.split('\n');pendiente=lineas.pop()??''
   for(const l of lineas){
    try{const e=JSON.parse(l);if(e?.tipo==='progreso')ctx?.onProgreso?.({objetivo:String(e.objetivo),estado:String(e.estado),segundos:Number(e.segundos)});else err+=l}
    catch{err+=l+'\n'}
   }
  })
  hijo.on('error',e=>fin(e))
  hijo.on('close',code=>{
   if(code===null)return
   clearTimeout(t);opts.signal?.removeEventListener('abort',cancelar)
   if(code!==0)return reject(new Error(`proceso B terminó con código ${code}${err?': '+err.slice(-200):''}`))
   try{resolve(JSON.parse(out))}catch{reject(new Error('respuesta de B no es JSON'))}
  })
  hijo.stdin.end(canonico(sobre))
 })
}
