/**
 * Disponibilidad efectiva de caja de EVENTUALES de cualquier función (laboratorio AH2-037/040), motor A,
 * sobre las MISMAS entradas que aliada-optimizer `optimizer/ev_caja_lab.py`, y validación cruzada de los
 * planes CP-SAT con los verificadores A. EV_CAJA_OUT=<archivo.json> escribe los resultados A.
 */
import {describe,expect,it} from 'vitest'
import {writeFileSync} from 'node:fs'
import casos from './fixtures/evCajaCasos.json'
import resultadosB from './fixtures/evCajaResultadosB.json'
import type {InputAlgoritmo,ResultadoSemanal} from '../types'
import {ejecutarAH2040,metricasAH2040,verificarAH2040,type ConfigAH2040} from '../ah2040'
import {analisisExcesos,compilarDisponibilidadCaja,reporteDisponibilidadCaja,validarDisponibilidadCaja,verificarDisponibilidadCaja} from '../disponibilidadCajaEventual'
import {auditarEscenario} from '../auditoriaV2'
import {ejecutarAlgoritmo} from '../orquestador'

type Caso={nombre:string;data:{input:InputAlgoritmo}}
const CASOS=casos as unknown as Caso[]
const MODOS=['HEREDADO','P0','P3','P2E','PT'] as const
const BLOQUEO='POLITICA_EV_COMPARACION_PENDIENTE'

function entrada(c:Caso,modo:typeof MODOS[number]):InputAlgoritmo{
 const i=structuredClone(c.data.input) as InputAlgoritmo
 if(modo==='HEREDADO')delete i.disponibilidad_caja_eventual
 ;(i as InputAlgoritmo&{comparacion_aux_eventual:ConfigAH2040}).comparacion_aux_eventual={modo:modo==='HEREDADO'?'P0':modo,pares:[]}
 return i
}
const cfgDe=(i:InputAlgoritmo)=>(i as InputAlgoritmo&{comparacion_aux_eventual:ConfigAH2040}).comparacion_aux_eventual
function validarA(input:InputAlgoritmo,r:ResultadoSemanal){
 return auditarEscenario(input,r).violaciones.filter(x=>x.codigo!==BLOQUEO).map(x=>x.codigo)
}
function planBaA(input:InputAlgoritmo,plan:any):ResultadoSemanal{
 const rol=(id:string)=>input.colaboradores.find(c=>c.id===id)!.rol
 const marcar=(m:Record<string,string[][]>,role:'AUX'|'EVENTUAL')=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map((row,d)=>row.map((v,s)=>plan[role][id][d].includes(s)?'CAJA':v))]))
 return {jornadas_full:Object.fromEntries(Object.entries(plan.jornadas).filter(([id])=>rol(id)==='FULL')),jornadas_part:Object.fromEntries(Object.entries(plan.jornadas).filter(([id])=>rol(id)==='PART')),
  asignacion_aux:marcar(input.presencia_aux,'AUX'),asignacion_eventual:marcar(input.disponibilidad_eventual,'EVENTUAL'),
  metricas:{deficit_por_slot:Array.from({length:7},()=>Array(30).fill(0)),exceso_por_slot:[],cobertura_total_pct:0},reporte_reglas:{advertencias:[],violaciones:[],duras_cumplidas:true}} as unknown as ResultadoSemanal
}
const slotsCaja=(m:Record<string,string[][]>)=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map(row=>row.flatMap((v,s)=>v==='CAJA'?[s]:[]))]))

describe('Disponibilidad de caja EVENTUAL · laboratorio A (mismas entradas que CP-SAT)',()=>{
 const filas:any[]=[]
 for(const c of CASOS)for(const modo of MODOS){
  const raw=entrada(c,modo)
  const {input,info}=compilarDisponibilidadCaja(raw)
  const {resultado,auxEstable}=ejecutarAH2040(input,cfgDe(raw))
  filas.push({caso:c.nombre,modo,motor:'A',auxEstable,...metricasAH2040(input,resultado),diagnosticos:info?.diagnosticos??[],
   verificacionAH2040:verificarAH2040(input,resultado,cfgDe(raw)),verificacionDisponibilidad:verificarDisponibilidadCaja(raw,resultado),
   validadorA:validarA(input,resultado),reporte:reporteDisponibilidadCaja(raw,resultado),excesos:analisisExcesos(raw,resultado),
   plan:{jornadas:{...resultado.jornadas_full,...resultado.jornadas_part},AUX:slotsCaja(resultado.asignacion_aux),EVENTUAL:slotsCaja(resultado.asignacion_eventual)}})
 }
 if(process.env.EV_CAJA_OUT)writeFileSync(process.env.EV_CAJA_OUT,JSON.stringify(filas))
 const fila=(caso:string,modo:string)=>filas.find(f=>f.caso===caso&&f.modo===modo)

 it('A cumple disponibilidad acreditada, relación del modo y reglas existentes',()=>{
  for(const f of filas){
   expect(f.verificacionDisponibilidad,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.verificacionAH2040.violaciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.validadorA,`${f.caso} ${f.modo}`).toEqual([])
   expect(f.auxEstable).toBe(true)
  }
 })

 it('sin acreditación la presencia no se interpreta como caja; el reporte respeta la función habitual',()=>{
  for(const f of filas)for(const x of f.reporte.filter((x:any)=>x.rol==='EVENTUAL')){
   expect(x.horasCaja).toBeLessThanOrEqual(x.disponibilidadCajaEfectivaHoras)
   expect(x.disponibilidadCajaRestanteHoras).toBeGreaterThanOrEqual(0)
   expect(x.horasFuncionHabitualRealizadas).toBeGreaterThanOrEqual(x.horasReservadasFuncionHabitual)
   if(x.horasFuncionHabitualMinimas!==null)expect(x.horasFuncionHabitualRealizadas).toBeGreaterThanOrEqual(x.horasFuncionHabitualMinimas)
   if(f.modo!=='HEREDADO'&&x.acreditada===false)expect(x.horasCaja,`${f.caso} ${x.id}`).toBe(0)
  }
  expect(fila('1-funciones-diversas','HEREDADO').horasCajaEventual['ev-4']).toBeGreaterThan(0)
  expect(fila('1-funciones-diversas','P0').horasCajaEventual['ev-4']).toBe(0)
 })

 it('diagnósticos idénticos a B y bloqueo de publicación conservado',()=>{
  const B=resultadosB as any[]
  for(const f of filas){
   const b=B.find(x=>x.caso===f.caso&&x.modo===f.modo)
   expect(f.diagnosticos,`${f.caso} ${f.modo}`).toEqual(b.diagnosticos)
  }
  const {info}=compilarDisponibilidadCaja(entrada(CASOS[0],'P0'))
  expect(info!.bloqueaPublicacion).toBe(true)
 })

 it('reutilización semanal: la misma configuración resuelve la versión vigente sin recarga',()=>{
  const [a,b]=[CASOS[0],CASOS[1]].map(c=>compilarDisponibilidadCaja(entrada(c,'P0')).input)
  expect(CASOS[0].data.input.disponibilidad_caja_eventual).toEqual(CASOS[1].data.input.disponibilidad_caja_eventual)
  const n=(i:InputAlgoritmo)=>i.reservas_sector_eventual!['ev-1'].flat().filter(Boolean).length
  expect([n(a),n(b)]).toEqual([36,24])
 })

 it('protección y límites: P3 sin costo extra; el límite estricto reduce cobertura en el caso no comparable',()=>{
  for(const c of CASOS){
   const fa=(m:string)=>fila(c.nombre,m).faltantesHoras
   expect(fa('HEREDADO')).toBeLessThanOrEqual(fa('P0'))
   expect(fa('P3')).toBe(fa('P0'))
   expect(fa('PT')).toBeGreaterThanOrEqual(fa('P0'))
  }
  expect(fila('3-exceso-no-comparable','PT').faltantesHoras).toBeGreaterThan(fila('3-exceso-no-comparable','P0').faltantesHoras)
  const ex=fila('3-exceso-no-comparable','P0').excesos.find((x:any)=>x.auxId==='aux-t')
  expect(ex).toMatchObject({clase:'NO_COMPARABLE'})
  // Un par realmente comparable solo presenta exceso si la heurística A elige mal la identidad AUX cuando los
  // roles son intercambiables (caso 4; mismo efecto medido en AH2-040). CP-SAT no lo presenta nunca.
  const comparables=filas.flatMap(f=>f.excesos.filter((x:any)=>x.clase==='COMPARABLE').map(()=>f.caso))
  expect(new Set(comparables)).toEqual(new Set(['4-roles-intercambiables']))
  for(const f of resultadosB as any[])expect(f.excesos.filter((x:any)=>x.clase==='COMPARABLE')).toEqual([])
 })

 it('el motor A compila la configuración aunque se lo llame directamente (no ignora la protección)',()=>{
  const r=ejecutarAlgoritmo({...entrada(CASOS[0],'P0'),max_caja_eventual_slots:{'ev-1':210,'ev-2':210}})
  expect(r.asignacion_eventual['ev-4'].flat().filter(v=>v==='CAJA')).toEqual([])
 })

 it('formas inválidas y rótulos de sector se rechazan',()=>{
  const base={colaboradorId:'ev-1',sucursalId:'synthetic',vigenciaDesde:'2026-11-01',acreditacion:'TODA_LA_PRESENCIA'}
  for(const malo of [{version:2,perfiles:[]},{version:1,perfiles:[{...base,acreditacion:'SI'}]},{version:1,perfiles:[{...base,maxCajaHoras:3.25}]},
   {version:1,perfiles:[{...base,reservas:[{dias:[0],desde:'12:00',hasta:'11:00'}]}]},{version:1,perfiles:[{...base,sector:'x'}]}])
   expect(()=>validarDisponibilidadCaja(malo)).toThrow()
 })
})

describe('Disponibilidad de caja EVENTUAL · validación cruzada de los planes CP-SAT con verificadores A',()=>{
 it('25 planes B: mismo reporte y análisis de excesos que B, sin infracciones A',()=>{
  const B=resultadosB as any[]
  expect(B).toHaveLength(CASOS.length*MODOS.length)
  for(const f of B){
   const raw=entrada(CASOS.find(c=>c.nombre===f.caso)!,f.modo)
   const {input}=compilarDisponibilidadCaja(raw)
   const r=planBaA(input,f.plan)
   expect(f.estado).toBe('OPTIMAL')
   expect(f.publicable).toBe(false)
   expect(verificarDisponibilidadCaja(raw,r),`${f.caso} ${f.modo}`).toEqual([])
   expect(verificarAH2040(input,r,cfgDe(raw)).violaciones,`${f.caso} ${f.modo}`).toEqual([])
   expect(validarA(input,r),`${f.caso} ${f.modo}`).toEqual([])
   expect(reporteDisponibilidadCaja(raw,r),`${f.caso} ${f.modo}`).toEqual(f.reporte)
   expect(analisisExcesos(raw,r)).toEqual(f.excesos)
   expect(metricasAH2040(input,r).faltantesHoras).toBe(f.faltantesHoras)
  }
 })

 it('el verificador A detecta caja sin acreditar, dentro de una reserva y sobre el máximo',()=>{
  const f=(resultadosB as any[]).find(x=>x.caso==='1-funciones-diversas'&&x.modo==='P0')
  const plan=JSON.parse(JSON.stringify(f.plan))
  plan.EVENTUAL['ev-4'][0]=[10,11,12,13]
  plan.EVENTUAL['ev-1'][0]=[...new Set([...plan.EVENTUAL['ev-1'][0],2])].sort((a,b)=>a-b)
  plan.EVENTUAL['ev-5'][3]=Array.from({length:16},(_,i)=>10+i)
  const raw=entrada(CASOS[0],'P0')
  const cod=new Set(verificarDisponibilidadCaja(raw,planBaA(compilarDisponibilidadCaja(raw).input,plan)).map(x=>x.codigo))
  for(const c of ['EV_CAJA_SIN_ACREDITAR_ASIGNADA','EV_CAJA_EN_RESERVA','EV_CAJA_SUPERA_TOPE'])expect(cod.has(c)).toBe(true)
 })
})
