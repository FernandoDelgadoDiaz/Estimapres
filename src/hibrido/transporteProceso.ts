/**
 * Transporte de LABORATORIO por proceso aislado: `python -m optimizer.contrato` (aliada-optimizer) por stdin/stdout.
 * Solo Node (pruebas). Mata el proceso al vencer el plazo. Sin red, sin archivos temporales, sin persistencia.
 */
import {spawn} from 'node:child_process'
import type {TransporteB} from './transporte'
import {canonico} from './contrato'

export function transporteProceso(opts:{python:string;cwd:string;plazoMs:number}):TransporteB{
 return sobre=>new Promise((resolve,reject)=>{
  const hijo=spawn(opts.python,['-m','optimizer.contrato'],{cwd:opts.cwd,stdio:['pipe','pipe','pipe']})
  let out='',err=''
  const t=setTimeout(()=>{hijo.kill('SIGKILL');reject(new Error(`proceso B cancelado a los ${opts.plazoMs} ms`))},opts.plazoMs)
  hijo.stdout.on('data',d=>{out+=d})
  hijo.stderr.on('data',d=>{err+=d})
  hijo.on('error',e=>{clearTimeout(t);reject(e)})
  hijo.on('close',code=>{
   clearTimeout(t)
   if(code!==0)return reject(new Error(`proceso B terminó con código ${code}${err?': '+err.slice(-200):''}`))
   try{resolve(JSON.parse(out))}catch{reject(new Error('respuesta de B no es JSON'))}
  })
  hijo.stdin.end(canonico(sobre))
 })
}
