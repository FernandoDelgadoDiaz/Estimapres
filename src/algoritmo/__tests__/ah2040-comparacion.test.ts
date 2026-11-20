/**
 * AH2-040 — comparación experimental P0/P1/P2/P2E/P3 en el motor A, sobre las MISMAS entradas sintéticas
 * que el laboratorio CP-SAT (aliada-optimizer `optimizer/ah2040_lab.py`), y validación cruzada de los
 * planes B con los verificadores de A. Ninguna alternativa queda aprobada ni se vuelve publicable.
 * AH2040_OUT=<archivo.json> escribe los resultados A completos.
 */
import {describe,expect,it} from 'vitest'
import {writeFileSync} from 'node:fs'
import casos from './fixtures/ah2040Casos.json'
import resultadosB from './fixtures/ah2040ResultadosB.json'
import type {InputAlgoritmo,ResultadoSemanal} from '../types'
import {MODOS_AH2040,ejecutarAH2040,mascarasAH2040,metricasAH2040,verificarAH2040,type ConfigAH2040} from '../ah2040'
import {auditarEscenario} from '../auditoriaV2'

type Caso={nombre:string;pares:{eventualId:string;auxId:string}[];data:{input:InputAlgoritmo}}
const CASOS=casos as unknown as Caso[]
const BLOQUEO='POLITICA_EV_COMPARACION_PENDIENTE'
const cfgDe=(c:Caso,modo:ConfigAH2040['modo']):ConfigAH2040=>({modo,pares:modo==='P1'?c.pares:[]})

/** Validador A: infracciones del plan, separando el bloqueo de publicación esperado (falta de tope). */
function validarA(input:InputAlgoritmo,r:ResultadoSemanal){
 const v=auditarEscenario(input,r).violaciones
 return {infracciones:v.filter(x=>x.codigo!==BLOQUEO).map(x=>x.codigo),bloqueoPublicacion:v.filter(x=>x.codigo===BLOQUEO).map(x=>x.colaboradorId)}
}

/** Convierte un plan B ({AUX:{id:[[slots]]}}) a la forma de resultado de A. */
function planBaA(input:InputAlgoritmo,plan:any):ResultadoSemanal{
 const rol=(id:string)=>input.colaboradores.find(c=>c.id===id)!.rol
 const marcar=(m:Record<string,string[][]>,role:'AUX'|'EVENTUAL')=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map((row,d)=>row.map((v,s)=>plan[role][id][d].includes(s)?'CAJA':v))]))
 return {jornadas_full:Object.fromEntries(Object.entries(plan.jornadas).filter(([id])=>rol(id)==='FULL')),jornadas_part:Object.fromEntries(Object.entries(plan.jornadas).filter(([id])=>rol(id)==='PART')),
  asignacion_aux:marcar(input.presencia_aux,'AUX'),asignacion_eventual:marcar(input.disponibilidad_eventual,'EVENTUAL'),
  metricas:{deficit_por_slot:Array.from({length:7},()=>Array(30).fill(0)),exceso_por_slot:[],cobertura_total_pct:0},reporte_reglas:{advertencias:[],violaciones:[],duras_cumplidas:true}} as unknown as ResultadoSemanal
}

describe('AH2-040 · laboratorio A (mismas entradas que CP-SAT)',()=>{
 const filas:any[]=[]
 for(const c of CASOS)for(const modo of MODOS_AH2040){
  const input=c.data.input as InputAlgoritmo
  const cfg=cfgDe(c,modo)
  const {resultado,auxEstable}=ejecutarAH2040(input,cfg)
  const m=metricasAH2040(input,resultado)
  const ver=verificarAH2040(input,resultado,cfg)
  const val=validarA({...input,comparacion_aux_eventual:cfg} as InputAlgoritmo,resultado)
  const slots=(m:Record<string,string[][]>)=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map(row=>row.flatMap((v,s)=>v==='CAJA'?[s]:[]))]))
  const planB={jornadas:{...resultado.jornadas_full,...resultado.jornadas_part},AUX:slots(resultado.asignacion_aux),EVENTUAL:slots(resultado.asignacion_eventual)}
  filas.push({caso:c.nombre,modo,motor:'A',auxEstable,...m,verificacionAH2040:ver,validadorA:val,plan:planB})
 }
 if(process.env.AH2040_OUT)writeFileSync(process.env.AH2040_OUT,JSON.stringify(filas))

 it('A cumple la relación de cada modo (verificador independiente) y no introduce otras infracciones',()=>{
  for(const f of filas){
   expect(f.verificacionAH2040.violaciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.validadorA.infracciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.auxEstable,`${f.caso} ${f.modo}: la caja AUX no depende de los eventuales`).toBe(true)
  }
 })

 it('el bloqueo de publicación se conserva: sin tope explícito, el validador A sigue marcando la comparación pendiente',()=>{
  const sinTope=filas.filter(f=>f.caso==='1-coincidentes')
  for(const f of sinTope)expect(f.validadorA.bloqueoPublicacion).toEqual(['ev-1'])
  const conTope=filas.find(f=>f.caso==='6-con-y-sin-tope'&&f.modo==='P0')
  expect(conTope.validadorA.bloqueoPublicacion).toEqual(['ev-libre'])
 })

 it('P3 nunca cuesta cobertura frente a P0; P2/P2E nunca la mejoran y la pierden en casos rígidos',()=>{
  const cov=(caso:string,modo:string)=>filas.find(f=>f.caso===caso&&f.modo===modo).faltantesHoras
  for(const c of CASOS){
   expect(cov(c.nombre,'P3'),c.nombre).toBe(cov(c.nombre,'P0'))
   expect(cov(c.nombre,'P2')).toBeGreaterThanOrEqual(cov(c.nombre,'P0'))
   expect(cov(c.nombre,'P2E')).toBeGreaterThanOrEqual(cov(c.nombre,'P2'))
  }
  expect(cov('8-rigidez','P2')).toBeGreaterThan(cov('8-rigidez','P0'))
 })

 it('el tope explícito se respeta en todos los modos y el EVENTUAL sin tope no queda forzado a cero',()=>{
  for(const f of filas.filter(f=>f.caso==='6-con-y-sin-tope')){
   expect(f.horasCajaEventual['ev-lim']).toBeLessThanOrEqual(8)
   expect(f.horasCajaEventual['ev-libre']).toBeGreaterThan(0)
  }
 })

 it('un AUX exclusivamente supervisor nunca es comparable: no hay relación y el EVENTUAL no queda en cero',()=>{
  const {K}=mascarasAH2040(CASOS.find(c=>c.nombre==='5-aux-solo-supervisor')!.data.input as InputAlgoritmo)
  expect([...K['aux-sA']].length+[...K['aux-sB']].length).toBe(0)
  for(const f of filas.filter(f=>f.caso==='5-aux-solo-supervisor')){
   expect(f.verificacionAH2040.relaciones).toBe(0)
   expect(f.horasCajaEventual['ev-1']).toBeGreaterThan(0)
  }
 })
})

describe('AH2-040 · validación cruzada de los planes CP-SAT con los verificadores A',()=>{
 const filasB=resultadosB as any[]
 it('los 40 planes B: misma O/K que A, relación cumplida según el verificador A y sin otras infracciones',()=>{
  expect(filasB).toHaveLength(CASOS.length*MODOS_AH2040.length)
  for(const f of filasB){
   const c=CASOS.find(x=>x.nombre===f.caso)!
   const input=c.data.input as InputAlgoritmo
   const {O,K}=mascarasAH2040(input)
   expect(Object.fromEntries(Object.entries(O).map(([k,v])=>[k,v.size/2]))).toEqual(f.oportunidadesEventualHoras)
   expect(Object.fromEntries(Object.entries(K).map(([k,v])=>[k,v.size/2]))).toEqual(f.capacidadEfectivaAuxHoras)
   expect(f.estado,`${f.caso} ${f.modo}`).toBe('OPTIMAL')
   expect(f.publicable).toBe(false)
   const r=planBaA(input,f.plan)
   const cfg=cfgDe(c,f.modo)
   expect(verificarAH2040(input,r,cfg).violaciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(validarA({...input,comparacion_aux_eventual:cfg} as InputAlgoritmo,r).infracciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(metricasAH2040(input,r).faltantesHoras).toBe(f.faltantesHoras)
  }
 })

 it('el verificador A detecta una infracción P3 construida: EVENTUAL en caja donde el AUX determinado no lo está',()=>{
  const c=CASOS.find(x=>x.nombre==='1-coincidentes')!
  const input=c.data.input as InputAlgoritmo
  const f=filasB.find(x=>x.caso===c.nombre&&x.modo==='P0')
  const plan=JSON.parse(JSON.stringify(f.plan))
  plan.AUX['aux-t'][0]=plan.AUX['aux-t'][0].slice(4) // aux-t deja caja el lunes 09:00–11:00
  const v=verificarAH2040(input,planBaA(input,plan),{modo:'P3'}).violaciones
  expect(v).toHaveLength(1)
  expect(v[0]).toMatchObject({eventualId:'ev-1',auxId:'aux-t',excesoHoras:2})
 })
})
