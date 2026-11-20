/**
 * AH2-040 — simultaneidad AUX + EVENTUAL (aclaración del propietario: prioridad ≠ exclusividad temporal) y evaluación
 * de definiciones de comparabilidad para la regla de totales semanales (SEMANAL, OPORTUNIDAD, DIAS, PC) en el
 * motor A, con las MISMAS entradas que aliada-optimizer `optimizer/ah2040_comparabilidad_lab.py`, y validación
 * cruzada de los planes CP-SAT. AH2040_COMP_OUT=<archivo.json> escribe los resultados A.
 */
import {describe,expect,it} from 'vitest'
import {writeFileSync} from 'node:fs'
import casos from './fixtures/ah2040ComparabilidadCasos.json'
import resultadosB from './fixtures/ah2040ComparabilidadResultadosB.json'
import type {InputAlgoritmo,ResultadoSemanal} from '../types'
import {ejecutarAH2040,metricasAH2040,relacionesAH2040,verificarAH2040,type ConfigAH2040} from '../ah2040'
import {compilarDisponibilidadCaja} from '../disponibilidadCajaEventual'
import {auditarEscenario} from '../auditoriaV2'

type Caso={nombre:string;data:{input:InputAlgoritmo}}
const CASOS=casos as unknown as Caso[]
const MODOS=['P0','SEMANAL','OPORTUNIDAD','DIAS','PC'] as const
type ConCfg=InputAlgoritmo&{comparacion_aux_eventual:ConfigAH2040}
const BLOQUEO='POLITICA_EV_COMPARACION_PENDIENTE'
const VERIFICA=new Set(['SEMANAL','OPORTUNIDAD','DIAS'])

function entrada(c:Caso,modo:string):ConCfg{
 const i=structuredClone(c.data.input) as ConCfg
 i.comparacion_aux_eventual={modo:modo as ConfigAH2040['modo'],pares:[]}
 return compilarDisponibilidadCaja(i).input as ConCfg
}
const validarA=(input:ConCfg,r:ResultadoSemanal)=>auditarEscenario(input,r).violaciones.filter(x=>VERIFICA.has(input.comparacion_aux_eventual.modo)||x.codigo!==BLOQUEO).map(x=>x.codigo)
function planBaA(input:InputAlgoritmo,plan:any):ResultadoSemanal{
 const rol=(id:string)=>input.colaboradores.find(c=>c.id===id)!.rol
 const marcar=(m:Record<string,string[][]>,role:'AUX'|'EVENTUAL')=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map((row,d)=>row.map((v,s)=>plan[role][id][d].includes(s)?'CAJA':v))]))
 return {jornadas_full:Object.fromEntries(Object.entries(plan.jornadas).filter(([id])=>rol(id)==='FULL')),jornadas_part:Object.fromEntries(Object.entries(plan.jornadas).filter(([id])=>rol(id)==='PART')),
  asignacion_aux:marcar(input.presencia_aux,'AUX'),asignacion_eventual:marcar(input.disponibilidad_eventual,'EVENTUAL'),
  metricas:{deficit_por_slot:Array.from({length:7},()=>Array(30).fill(0)),exceso_por_slot:[],cobertura_total_pct:0},reporte_reglas:{advertencias:[],violaciones:[],duras_cumplidas:true}} as unknown as ResultadoSemanal
}
/** Franjas con AUX y EVENTUAL simultáneos en caja, con la cobertura FULL/PART de cada una. */
function simultaneidad(input:InputAlgoritmo,r:ResultadoSemanal){
 const fp=Array.from({length:7},()=>Array(30).fill(0))
 for(const w of [...Object.values(r.jornadas_full),...Object.values(r.jornadas_part)])for(const j of w)for(const b of j.bloques)for(let s=b.slot_inicio;s<b.slot_fin;s++)fp[j.dia][s]++
 const out:{dia:number;franja:number;demanda:number;fullPart:number;aux:number;eventual:number}[]=[]
 for(let d=0;d<7;d++)for(let s=0;s<30;s++){
  const a=Object.values(r.asignacion_aux).filter(m=>m[d][s]==='CAJA').length,e=Object.values(r.asignacion_eventual).filter(m=>m[d][s]==='CAJA').length
  if(a&&e)out.push({dia:d,franja:s,demanda:input.demanda[d][s],fullPart:fp[d][s],aux:a,eventual:e})
 }
 return out
}
const slotsCaja=(m:Record<string,string[][]>)=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map(row=>row.flatMap((v,s)=>v==='CAJA'?[s]:[]))]))
const B=resultadosB as any[]

describe('AH2-040 · simultaneidad AUX + EVENTUAL y comparabilidad (motor A)',()=>{
 const filas:any[]=[]
 for(const c of CASOS)for(const modo of MODOS){
  const input=entrada(c,modo)
  const {resultado,auxEstable}=ejecutarAH2040(input,input.comparacion_aux_eventual)
  filas.push({caso:c.nombre,modo,motor:'A',estado:'HEURISTICO',auxEstable,...metricasAH2040(input,resultado),
   relaciones:relacionesAH2040(input,input.comparacion_aux_eventual).rels.map(r=>({eventualId:r.eventualId,auxId:r.auxId})),
   verificacion:verificarAH2040(input,resultado,input.comparacion_aux_eventual).violaciones,validadorA:validarA(input,resultado),
   simultaneidad:simultaneidad(input,resultado),
   plan:{jornadas:{...resultado.jornadas_full,...resultado.jornadas_part},AUX:slotsCaja(resultado.asignacion_aux),EVENTUAL:slotsCaja(resultado.asignacion_eventual)}})
 }
 if(process.env.AH2040_COMP_OUT)writeFileSync(process.env.AH2040_COMP_OUT,JSON.stringify(filas))
 const fila=(caso:string,modo:string)=>filas.find(f=>f.caso.startsWith(caso)&&f.modo===modo)

 it('A cumple cada definición y todas las reglas existentes; relaciones idénticas a B',()=>{
  for(const f of filas){
   expect(f.verificacion,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.validadorA,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.auxEstable).toBe(true)
   expect(f.relaciones,`${f.caso} ${f.modo}`).toEqual(B.find(b=>b.caso===f.caso&&b.modo===f.modo).relaciones)
  }
 })

 it('simultaneidad: con 4 cajas, 2 FULL/PART + AUX + EVENTUAL atienden a la vez sin sobrantes ni infracciones',()=>{
  for(const modo of MODOS){
   const sim=fila('Z1',modo).simultaneidad
   expect(sim.some((x:any)=>x.demanda===4&&x.fullPart===2&&x.aux===1&&x.eventual===1),modo).toBe(true)
   for(const x of sim)expect(x.fullPart+x.aux+x.eventual).toBeLessThanOrEqual(x.demanda)
  }
 })

 it('el validador A acepta la simultaneidad y rechaza EVENTUAL con AUX elegible ocioso o cobertura duplicada',()=>{
  const c=CASOS.find(x=>x.nombre.startsWith('Z1'))!
  const input=entrada(c,'P0')
  const b=B.find(x=>x.caso===c.nombre&&x.modo==='P0')
  expect(validarA(input,planBaA(input,b.plan))).toEqual([])
  const x=b.simultaneidad.find((x:any)=>x.demanda===4&&x.fullPart===2)
  const sinAux=JSON.parse(JSON.stringify(b.plan));sinAux.AUX['aux-t'][x.dia]=sinAux.AUX['aux-t'][x.dia].filter((s:number)=>s!==x.franja)
  expect(validarA(input,planBaA(input,sinAux))).toContain('OP_PRIORIDAD_AUX')
  // Cobertura duplicada: la misma simultaneidad con una caja menos de demanda POM deja un sobrante → infracción.
  const menos=structuredClone(input);menos.demanda[x.dia][x.franja]=3
  expect(validarA(menos,planBaA(menos,b.plan))).toContain('OP_COBERTURA_DUPLICADA')
 })

 it('alternativas: costo y relaciones en A coinciden con las conclusiones de B',()=>{
  const fa=(c:string,m:string)=>fila(c,m).faltantesHoras
  for(const c of CASOS){const n=c.nombre.split('-')[0];expect(fa(n,'PC')).toBeGreaterThanOrEqual(fa(n,'P0'))}
  expect(fila('N2','OPORTUNIDAD').horasCajaEventual['ev-1']).toBeGreaterThan(fila('N2','OPORTUNIDAD').horasCajaAux['aux-t'])
  for(const m of ['SEMANAL','OPORTUNIDAD','DIAS'])expect(fila('N1',m).horasCajaEventual['ev-1']).toBeLessThanOrEqual(fila('N1',m).horasCajaAux['aux-t'])
  expect(fila('S9','SEMANAL').horasCajaEventual['ev-1']).toBe(1)
  expect(fila('S9','DIAS').relaciones).toEqual([])
  for(const n of ['S2','S6','S8'])expect(fila(n,'DIAS').relaciones).toEqual([])
  // Donde la relación limita al EVENTUAL, A (con el reparto de identidad rotativa a favor de los comparables)
  // obtiene la misma cobertura que CP-SAT.
  for(const b of B.filter(x=>['SEMANAL','DIAS','OPORTUNIDAD'].includes(x.modo)&&x.relaciones.length))
   expect(fila(b.caso.split('-')[0],b.modo).faltantesHoras,`${b.caso} ${b.modo}`).toBe(b.faltantesHoras)
 })
})

describe('AH2-040 · comparabilidad: validación cruzada de los 60 planes CP-SAT con validadores A',()=>{
 it('sin infracciones A, misma relación cumplida y mismos faltantes',()=>{
  expect(B).toHaveLength(CASOS.length*MODOS.length)
  for(const f of B){
   const input=entrada(CASOS.find(c=>c.nombre===f.caso)!,f.modo)
   const r=planBaA(input,f.plan)
   expect(verificarAH2040(input,r,input.comparacion_aux_eventual).violaciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(validarA(input,r),`${f.caso} ${f.modo}`).toEqual([])
   expect(metricasAH2040(input,r).faltantesHoras).toBe(f.faltantesHoras)
  }
 })
})
