/**
 * Laboratorio integrado: política DIAS v1, progreso real, salida (supervisión, sin comparable, atribución), carga de
 * paquetes y servidor de desarrollo con CP-SAT real (si aliada-optimizer y OR-Tools están disponibles).
 */
import {describe,expect,it} from 'vitest'
import {createServer} from 'node:http'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import type {AddressInfo} from 'node:net'
import {demoSucursalLab} from '../demoSucursal'
import {politicaLaboratorioV1,motorAConPolitica} from '../politica'
import {generarPropuestaHibrida,type EventoProgreso} from '../orquestador'
import {cargarPaquete,VERSION_PAQUETE} from '../paquete'
import {manejadorLabCpSat} from '../servidorLab'
import {RUTA_LAB_CPSAT,cpSatLabDisponible,transporteHttpLab} from '../transporteHttpLab'
import {entradaDemo} from '../../condiciones/demo'
import {verificarAH2040} from '../../algoritmo/ah2040'
import {compilarDisponibilidadCaja} from '../../algoritmo/disponibilidadCajaEventual'
import {auditarEscenario} from '../../algoritmo/auditoriaV2'

const OP={timeoutMs:120000,parametros:{segundos:8,modo:'global' as const,semilla:20261119},id:'lab-ui',sucursal:'lab-sintetica'}

describe('política v1 de laboratorio (DIAS)',()=>{
 it('se aplica solo con política v1 y sin modo explícito; el comportamiento heredado no cambia',()=>{
  expect((politicaLaboratorioV1(demoSucursalLab()) as any).comparacion_aux_eventual).toEqual({modo:'DIAS',pares:[]})
  expect('comparacion_aux_eventual' in politicaLaboratorioV1(entradaDemo())).toBe(false)
  const explicito={...demoSucursalLab(),comparacion_aux_eventual:{modo:'P0',pares:[]}} as any
  expect((politicaLaboratorioV1(explicito) as unknown as {comparacion_aux_eventual:{modo:string}}).comparacion_aux_eventual.modo).toBe('P0')
 })
 it('con DIAS, A usa a los EVENTUALES limitados por la regla (no tope cero) y cumple validadores',()=>{
  const {input}=compilarDisponibilidadCaja(politicaLaboratorioV1(demoSucursalLab()))
  const r=motorAConPolitica(input)
  const ev=Object.values(r.asignacion_eventual).flat(2).filter(v=>v==='CAJA').length
  expect(ev).toBeGreaterThan(0)
  expect(verificarAH2040(input,r,(input as unknown as {comparacion_aux_eventual:{modo:'DIAS'}}).comparacion_aux_eventual).violaciones).toEqual([])
  expect(auditarEscenario(input,r).violaciones.filter(v=>v.nivel!=='DATOS')).toEqual([])
 })
})

describe('orquestador: progreso y salida del laboratorio',()=>{
 it('emite las etapas reales en orden y reporta supervisión, comparables, sin comparable y atribución',async()=>{
  const ev:EventoProgreso[]=[]
  const s=await generarPropuestaHibrida(demoSucursalLab(),{...OP,onProgreso:e=>ev.push(e)})
  expect(ev.map(e=>e.etapa)).toEqual(['PREPARACION','A_INICIO','A_FIN','SELECCION'])
  expect(ev.every((e,i)=>i===0||e.ms>=ev[i-1].ms)).toBe(true)
  expect(s.origen).toBe('A')
  expect(s.comparabilidadAH2040.modo).toBe('DIAS')
  expect(s.comparabilidadAH2040.relaciones.map(r=>`${r.eventualId}~${r.auxId}`)).toEqual(['ev-a~aux-t'])
  const rel=s.comparabilidadAH2040.relaciones[0]
  expect(rel.horasEventual!).toBeLessThanOrEqual(rel.horasAux!)
  expect(s.comparabilidadAH2040.sinAuxComparable).toEqual(['ev-b'])
  expect(s.supervision.map(x=>x.auxId)).toEqual(['aux-sA','aux-sB','aux-t'])
  expect(s.supervision.find(x=>x.auxId==='aux-sA')!.porDia[0].supervisionHoras).toBe(13)
  expect(s.comparabilidadAH2040.faltantesAtribuiblesReglaHoras).toBeGreaterThanOrEqual(0)
  expect(s.comparabilidadAH2040.faltantesSinPersonalHoras).toBeGreaterThanOrEqual(0)
 })
})

describe('bloqueos para el ensayo real',()=>{
 it('tres o más AUX simultáneos y apertura con AUX único sin supervisión externa quedan visibles como bloqueos',async()=>{
  const tres=demoSucursalLab()
  tres.colaboradores.push({id:'aux-x',nombre:'Auxiliar extra',rol:'AUX'})
  tres.presencia_aux['aux-x']=tres.presencia_aux['aux-t'].map(r=>[...r])
  const s=await generarPropuestaHibrida(tres,OP)
  expect(s.bloqueos).toContain('POLITICA_AUX_MULTIPLE')
  const apertura={...demoSucursalLab(),apertura_solo_aux:true}
  apertura.demanda=apertura.demanda.map((r,d)=>r.map((n,i)=>i<2&&d<6?1:n))
  apertura.presencia_aux={...apertura.presencia_aux,'aux-sA':apertura.presencia_aux['aux-sA'].map((r,d)=>r.map((v,i)=>i<2&&[0,2,4].includes(d)?'PARADO':v))}
  const s2=await generarPropuestaHibrida(apertura,OP)
  expect(s2.bloqueos).toContain('POLITICA_APERTURA_SUPERVISION')
  expect((await generarPropuestaHibrida(demoSucursalLab(),OP)).bloqueos).toEqual([])
 })
})

describe('carga local de POM y dotación',()=>{
 it('acepta la entrada del motor y el paquete de pantalla (mismo adaptador de la aplicación); rechaza formas inválidas',()=>{
  expect(cargarPaquete(JSON.stringify(demoSucursalLab())).input.colaboradores).toHaveLength(7)
  const paquete={version:VERSION_PAQUETE,sucursal:'lab',semana:'2026-11-23',necesidad:[{hora:'09:00',necesidad:[2,2,2,2,2,2,0]},{hora:'09:30',necesidad:[2,2,2,2,2,2,0]}],
   cajeros:[{id:'c1',nombre:'Cajero sintético',tipo:'PART',activo:true,horasSemanales:32}],auxiliares:[],eventuales:[]}
  const {input,resumen}=cargarPaquete(JSON.stringify(paquete))
  expect(resumen).toContain('Paquete de pantalla')
  expect(input.demanda[0][2]).toBe(2)
  expect(input.sucursal_id).toBe('lab')
  expect(()=>cargarPaquete('{')).toThrow('JSON válido')
  expect(()=>cargarPaquete(JSON.stringify({version:VERSION_PAQUETE,sucursal:'x'}))).toThrow('Paquete incompleto')
  expect(()=>cargarPaquete(JSON.stringify({hola:1}))).toThrow('Formato no reconocido')
 })
})

const DIR_B=process.env.AH2_OPTIMIZER_DIR??resolve(process.cwd(),'../aliada-optimizer')
const PY=process.env.AH2_PYTHON??'python3'
const hayB=existsSync(resolve(DIR_B,'optimizer/contrato.py'))&&spawnSync(PY,['-c','import ortools'],{cwd:DIR_B}).status===0
describe.skipIf(!hayB)('servidor de desarrollo + CP-SAT real (laboratorio local)',()=>{
 it('interfaz → HTTP local → proceso CP-SAT con progreso por fase → validación → selección → salida',async()=>{
  const h=manejadorLabCpSat({dir:DIR_B,python:PY,plazoMs:120000})
  const srv=createServer((q,r)=>{h(q,r,()=>{r.statusCode=404;r.end()})}).listen(0,'127.0.0.1')
  await new Promise(ok=>srv.once('listening',ok))
  const base=`http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  try{
   expect(await cpSatLabDisponible(base)).toBe(true)
   expect((await fetch(`${base}${RUTA_LAB_CPSAT}`)).status).toBe(405)
   expect((await fetch(`${base}${RUTA_LAB_CPSAT}`,{method:'POST',body:'x'.repeat(2_000_001)})).status).toBe(413)
   const ev:EventoProgreso[]=[]
   const s=await generarPropuestaHibrida(demoSucursalLab(),{...OP,transporte:transporteHttpLab(base),onProgreso:e=>ev.push(e)})
   const fases=ev.filter(e=>e.etapa==='B_FASE')
   expect(fases.length).toBeGreaterThanOrEqual(3)
   expect(ev.map(e=>e.etapa)).toContain('B_RESPUESTA')
   expect(s.estadoB).toBe('OPTIMAL')
   expect(['A','B']).toContain(s.origen)
   expect(s.comparabilidadAH2040.incumplimientos).toEqual([])
   expect(s.conflictos.filter(c=>c.origen==='A'||c.origen==='B')).toEqual([])
  }finally{srv.close()}
 },180000)
})
