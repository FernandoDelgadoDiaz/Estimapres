/**
 * Middleware SOLO de desarrollo (`vite dev`) para ejecutar CP-SAT local desde la interfaz de laboratorio.
 * - Activo únicamente si AH2_LAB_CPSAT_DIR apunta a un checkout de aliada-optimizer; no existe en el build
 *   estático que publica Netlify (Vite no ejecuta `configureServer` al compilar).
 * - Acepta solo conexiones desde la propia máquina (loopback) y sobres ≤ 2 MB; no guarda nada en disco.
 * - Reenvía el progreso real de CP-SAT como NDJSON y mata el proceso si el cliente se desconecta.
 */
import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Plugin} from 'vite'
import {transporteProceso} from './transporteProceso'
import {RUTA_LAB_CPSAT} from './transporteHttpLab'

const LOOPBACK=new Set(['127.0.0.1','::1','::ffff:127.0.0.1'])
const MAX=2_000_000

export function manejadorLabCpSat(opts:{dir:string;python:string;plazoMs:number}){
 return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
  if(!req.url?.startsWith(RUTA_LAB_CPSAT))return next()
  if(!LOOPBACK.has(req.socket.remoteAddress??'')){res.statusCode=403;return res.end()}
  if(req.method==='GET'&&req.url===`${RUTA_LAB_CPSAT}/estado`){res.setHeader('content-type','application/json');return res.end(JSON.stringify({disponible:true}))}
  if(req.method!=='POST'||req.url!==RUTA_LAB_CPSAT){res.statusCode=405;return res.end()}
  let cuerpo='',tam=0
  for await(const c of req){tam+=c.length;if(tam>MAX){res.statusCode=413;return res.end()}cuerpo+=c}
  let sobre:unknown
  try{sobre=JSON.parse(cuerpo)}catch{res.statusCode=400;return res.end()}
  res.setHeader('content-type','application/x-ndjson');res.setHeader('cache-control','no-store')
  const ctrl=new AbortController()
  res.on('close',()=>{if(!res.writableEnded)ctrl.abort()})
  const escribir=(x:unknown)=>{if(!res.writableEnded)res.write(JSON.stringify(x)+'\n')}
  try{
   const respuesta=await transporteProceso({python:opts.python,cwd:opts.dir,plazoMs:opts.plazoMs,signal:ctrl.signal})(sobre as never,{onProgreso:f=>escribir({tipo:'progreso',...f})})
   escribir({tipo:'respuesta',respuesta})
  }catch(e){escribir({tipo:'error',detalle:e instanceof Error?e.message.slice(0,200):'error'})}
  res.end()
 }
}

export function pluginLabCpSat():Plugin{
 return {name:'aliada-lab-cp-sat',apply:'serve',configureServer(server){
  const dir=process.env.AH2_LAB_CPSAT_DIR
  if(!dir)return
  server.middlewares.use(manejadorLabCpSat({dir,python:process.env.AH2_PYTHON??'python3',plazoMs:Number(process.env.AH2_LAB_CPSAT_PLAZO_MS??120000)}))
 }}
}
