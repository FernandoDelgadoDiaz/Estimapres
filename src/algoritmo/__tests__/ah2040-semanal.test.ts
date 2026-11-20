/**
 * AH2-040 — regla SEMANAL ratificada (20/11/2026): ningún EVENTUAL supera en horas-caja SEMANALES a un AUX realmente
 * comparable (K(a) ≠ ∅ y K(a) ∩ O(e) ≠ ∅). Motor A sobre las MISMAS entradas que aliada-optimizer
 * `optimizer/ah2040_semanal_lab.py`, y validación cruzada de los planes CP-SAT (incluidos FEASIBLE/UNKNOWN con
 * incumbente) con los validadores A. AH2040_SEMANAL_OUT=<archivo.json> escribe los resultados A.
 */
import {describe,expect,it} from 'vitest'
import {writeFileSync} from 'node:fs'
import casos from './fixtures/ah2040SemanalCasos.json'
import casosEstados from './fixtures/ah2040SemanalCasosEstados.json'
import resultadosB from './fixtures/ah2040SemanalResultadosB.json'
import estadosB from './fixtures/ah2040SemanalEstadosB.json'
import type {InputAlgoritmo,ResultadoSemanal} from '../types'
import {ejecutarAH2040,mascarasAH2040,metricasAH2040,relacionesAH2040,verificarAH2040,type ConfigAH2040} from '../ah2040'
import {compilarDisponibilidadCaja,verificarDisponibilidadCaja} from '../disponibilidadCajaEventual'
import {auditarEscenario} from '../auditoriaV2'

type Caso={nombre:string;data:{input:InputAlgoritmo}}
const CASOS=casos as unknown as Caso[]
const MODOS=['P0','SEMANAL','PC','PT'] as const
type ConCfg=InputAlgoritmo&{comparacion_aux_eventual:ConfigAH2040}
const BLOQUEO='POLITICA_EV_COMPARACION_PENDIENTE'

function entrada(c:Caso,modo:string):ConCfg{
 const i=structuredClone(c.data.input) as ConCfg
 i.comparacion_aux_eventual={modo:modo as ConfigAH2040['modo'],pares:[]}
 return i
}
/** Validador A (auditoría completa). En SEMANAL incluye la verificación de totales y no debe quedar el bloqueo. */
const validarA=(input:ConCfg,r:ResultadoSemanal)=>auditarEscenario(input,r).violaciones.filter(x=>input.comparacion_aux_eventual.modo==='SEMANAL'||x.codigo!==BLOQUEO).map(x=>x.codigo)
function planBaA(input:InputAlgoritmo,plan:any):ResultadoSemanal{
 const rol=(id:string)=>input.colaboradores.find(c=>c.id===id)!.rol
 const marcar=(m:Record<string,string[][]>,role:'AUX'|'EVENTUAL')=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map((row,d)=>row.map((v,s)=>plan[role][id][d].includes(s)?'CAJA':v))]))
 return {jornadas_full:Object.fromEntries(Object.entries(plan.jornadas).filter(([id])=>rol(id)==='FULL')),jornadas_part:Object.fromEntries(Object.entries(plan.jornadas).filter(([id])=>rol(id)==='PART')),
  asignacion_aux:marcar(input.presencia_aux,'AUX'),asignacion_eventual:marcar(input.disponibilidad_eventual,'EVENTUAL'),
  metricas:{deficit_por_slot:Array.from({length:7},()=>Array(30).fill(0)),exceso_por_slot:[],cobertura_total_pct:0},reporte_reglas:{advertencias:[],violaciones:[],duras_cumplidas:true}} as unknown as ResultadoSemanal
}
const slotsCaja=(m:Record<string,string[][]>)=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map(row=>row.flatMap((v,s)=>v==='CAJA'?[s]:[]))]))

describe('AH2-040 regla SEMANAL · motor A (mismas entradas que CP-SAT)',()=>{
 const filas:any[]=[]
 for(const c of CASOS)for(const modo of MODOS){
  const raw=entrada(c,modo)
  const input=compilarDisponibilidadCaja(raw).input as ConCfg
  const {resultado,auxEstable}=ejecutarAH2040(input,raw.comparacion_aux_eventual)
  filas.push({caso:c.nombre,modo,motor:'A',estado:'HEURISTICO',auxEstable,...metricasAH2040(input,resultado),
   comparables:relacionesAH2040(input,{modo:'SEMANAL'}).rels.map(r=>({eventualId:r.eventualId,auxId:r.auxId,solapamientoHoras:r.solapamientoHoras})),
   verificacionAH2040:verificarAH2040(input,resultado,raw.comparacion_aux_eventual),validadorA:validarA(input,resultado),
   verificacionDisponibilidad:verificarDisponibilidadCaja(raw,resultado),
   plan:{jornadas:{...resultado.jornadas_full,...resultado.jornadas_part},AUX:slotsCaja(resultado.asignacion_aux),EVENTUAL:slotsCaja(resultado.asignacion_eventual)}})
 }
 if(process.env.AH2040_SEMANAL_OUT)writeFileSync(process.env.AH2040_SEMANAL_OUT,JSON.stringify(filas))
 const fila=(caso:string,modo:string)=>filas.find(f=>f.caso===caso&&f.modo===modo)

 it('A cumple la regla y todas las reglas existentes; su validador ya no marca la comparación como pendiente',()=>{
  for(const f of filas){
   expect(f.verificacionAH2040.violaciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.validadorA,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.verificacionDisponibilidad,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.auxEstable).toBe(true)
  }
 })

 it('comparabilidad A idéntica a B (O, K y pares comparables)',()=>{
  for(const b of (resultadosB as any[]).filter(x=>x.modo==='SEMANAL')){
   const input=compilarDisponibilidadCaja(entrada(CASOS.find(c=>c.nombre===b.caso)!,'SEMANAL')).input
   const {O,K}=mascarasAH2040(input)
   expect(Object.fromEntries(Object.entries(O).map(([k,v])=>[k,v.size/2]))).toEqual(b.oportunidadesEventualHoras)
   expect(Object.fromEntries(Object.entries(K).map(([k,v])=>[k,v.size/2]))).toEqual(b.capacidadEfectivaAuxHoras)
   expect(fila(b.caso,'SEMANAL').comparables).toEqual(b.comparables)
  }
 })

 it('totales semanales contra CADA AUX comparable; sin comparable no hay tope cero',()=>{
  for(const c of CASOS){
   const f=fila(c.nombre,'SEMANAL')
   for(const r of f.comparables)expect(f.horasCajaEventual[r.eventualId],`${c.nombre} ${r.auxId}`).toBeLessThanOrEqual(f.horasCajaAux[r.auxId])
  }
  expect(fila('S4-aux-solo-supervisor','SEMANAL').horasCajaEventual['ev-1']).toBeGreaterThan(0)
  const s6=fila('S6-varios-aux-comparables','SEMANAL')
  expect(s6.horasCajaEventual['ev-1']).toBeLessThanOrEqual(Math.min(s6.horasCajaAux['aux-t'],s6.horasCajaAux['aux-u']))
 })

 it('roles rotativos: A reparte la identidad AUX por tramos y alcanza la misma cobertura que CP-SAT',()=>{
  const a=fila('S3-supervision-rotativa','SEMANAL'),b=(resultadosB as any[]).find(x=>x.caso==='S3-supervision-rotativa'&&x.modo==='SEMANAL')
  expect(Object.values(a.horasCajaAux).reduce((x:number,y:any)=>x+y,0)).toBe(48)
  expect(a.faltantesHoras).toBe(b.faltantesHoras)
 })

 it('costo visible: la regla nunca mejora cobertura ni desplaza AUX; S9 documenta la ambigüedad',()=>{
  for(const c of CASOS){
   expect(fila(c.nombre,'SEMANAL').faltantesHoras).toBeGreaterThanOrEqual(fila(c.nombre,'P0').faltantesHoras)
   const tot=(f:any)=>Object.values(f.horasCajaAux).reduce((x:number,y:any)=>x+y,0)
   expect(tot(fila(c.nombre,'SEMANAL'))).toBe(tot(fila(c.nombre,'P0')))
  }
  expect(fila('S9-ambiguedad-solapamiento-minimo','SEMANAL').horasCajaEventual['ev-1']).toBe(1)
  expect(fila('S9-ambiguedad-solapamiento-minimo','PC').faltantesHoras).toBe(fila('S9-ambiguedad-solapamiento-minimo','P0').faltantesHoras)
 })

 it('el validador A detecta el incumplimiento semanal en un plan que no aplica la regla',()=>{
  const input=entrada(CASOS.find(c=>c.nombre==='S5-eventual-supera-aux')!,'SEMANAL')
  const p0=(resultadosB as any[]).find(x=>x.caso==='S5-eventual-supera-aux'&&x.modo==='P0')
  const v=auditarEscenario(input,planBaA(input,p0.plan)).violaciones.map(x=>x.codigo)
  expect(v).toContain('OP_EVENTUAL_SUPERA_AUX_COMPARABLE')
  expect(v).not.toContain(BLOQUEO)
 })
})

describe('AH2-040 regla SEMANAL · validación cruzada de los planes CP-SAT con los validadores A',()=>{
 it('36 planes B OPTIMAL: sin infracciones A, mismas horas y faltantes',()=>{
  const B=resultadosB as any[]
  expect(B).toHaveLength(CASOS.length*MODOS.length)
  for(const f of B){
   expect(f.estado).toBe('OPTIMAL')
   const raw=entrada(CASOS.find(c=>c.nombre===f.caso)!,f.modo)
   const input=compilarDisponibilidadCaja(raw).input as ConCfg
   const r=planBaA(input,f.plan)
   expect(verificarAH2040(input,r,raw.comparacion_aux_eventual).violaciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(validarA(input,r),`${f.caso} ${f.modo}`).toEqual([])
   expect(verificarDisponibilidadCaja(raw,r)).toEqual([])
   expect(metricasAH2040(input,r).faltantesHoras).toBe(f.faltantesHoras)
  }
 })

 it('estados diferenciados: FEASIBLE y UNKNOWN con incumbente se validan; UNKNOWN sin plan e INFEASIBLE no presentan horario',()=>{
  const E=estadosB as any[]
  const todos=[...CASOS,...(casosEstados as unknown as Caso[])]
  expect(E.map(f=>f.estado)).toEqual(['UNKNOWN','FEASIBLE','UNKNOWN','INFEASIBLE'])
  for(const f of E){
   if(!f.plan){expect(f.sinPlan).toBe(true);continue}
   const raw=entrada(todos.find(c=>c.nombre===f.caso)!,'SEMANAL')
   const input=compilarDisponibilidadCaja(raw).input as ConCfg
   const r=planBaA(input,f.plan)
   expect(verificarAH2040(input,r,raw.comparacion_aux_eventual).violaciones,`${f.caso} ${f.estado}`).toEqual([])
   expect(validarA(input,r),`${f.caso} ${f.estado}`).toEqual([])
  }
  expect(E[3].incidencias[0].codigo).toBe('HORAS_FUERA_PERFIL')
 })
})
