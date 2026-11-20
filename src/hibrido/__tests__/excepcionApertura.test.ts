/** AH2-037/042: excepción local opt-in de AUX único por sucursal, día y franja (sin franja fija) en A, validadores y salida. */
import {mascarasAH2040} from '../../algoritmo/ah2040'
import {describe,expect,it} from 'vitest'
import type {InputAlgoritmo} from '../../algoritmo/types'
import {demoSucursalLab} from '../demoSucursal'
import {generarPropuestaHibrida} from '../orquestador'
import {erroresDatosRecursos} from '../../algoritmo/politicaRecursos'
import {aEntradaB,planBaResultado,type PlanB} from '../contrato'
import {auditarEscenario} from '../../algoritmo/auditoriaV2'
import {compilarDisponibilidadCaja} from '../../algoritmo/disponibilidadCajaEventual'

const TODA=Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2))
function apertura(excepcion?:boolean[][],sucursal='091'):InputAlgoritmo{
 const i=demoSucursalLab()
 i.sucursal_id=sucursal;i.apertura_solo_aux=true
 const sup=(dias:number[])=>Array.from({length:7},(_,d)=>Array.from({length:30},(_,s)=>dias.includes(d)&&s<28?'PARADO' as const:'NO_PRESENTE' as const))
 i.presencia_aux={...i.presencia_aux,'aux-sA':sup([0,2,4,6]),'aux-sB':sup([1,3,5])}
 i.demanda=i.demanda.map((r,d)=>r.map((n,s)=>s<2&&d<6?1:n))
 if(excepcion)i.excepcion_apertura_aux_unico=excepcion
 return i
}
const OP={timeoutMs:5000,parametros:{segundos:5,modo:'global' as const,semilla:1},id:'x',sucursal:'091'}

describe('excepción de apertura AUX único (AH2-037)',()=>{
 it('sin excepción: bloqueo visible y sin propuesta presentada como válida',async()=>{
  const s=await generarPropuestaHibrida(apertura(),OP)
  expect(s.bloqueos).toContain('POLITICA_APERTURA_SUPERVISION')
 })
 it('con excepción: el AUX único atiende caja toda la franja, cuenta como hora-caja y no hay bloqueo ni infracción',async()=>{
  const s=await generarPropuestaHibrida(apertura(TODA),OP)
  // Los perfiles EVENTUAL del fixture son de otra sucursal: EV_CAJA_SIN_PERFIL es esperable; no hay bloqueo de política.
  expect(s.bloqueos.filter(b=>b.startsWith('POLITICA_'))).toEqual([])
  expect(s.conflictos.filter(c=>c.codigo==='OP_APERTURA_COMPOSICION'||c.codigo.startsWith('POLITICA_APERTURA'))).toEqual([])
  expect(s.origen).toBe('A')
  for(let d=0;d<6;d++){const abre=[0,2,4].includes(d)?'aux-sA':'aux-sB';expect(s.propuesta!.asignacion_aux[abre][d].slice(0,2)).toEqual(['CAJA','CAJA'])}
  expect(s.excepcionApertura).toMatchObject({configurada:true})
  expect(s.excepcionApertura.franjasAplicadas).toBe(12)
 })
 it('parcial por día; fuera de la franja se rechaza; otra sucursal sin configuración conserva la regla ordinaria',async()=>{
  const lunes=Array.from({length:7},(_,d)=>Array.from({length:30},(_,s)=>d===0&&s<2))
  const s=await generarPropuestaHibrida(apertura(lunes),OP)
  expect(s.bloqueos).toContain('POLITICA_APERTURA_SUPERVISION')
  // AH2-042: ya no hay franja fija; cualquier franja autorizada por la sucursal es válida (forma 7×30 obligatoria).
  const fuera=TODA.map(r=>[...r]);fuera[0][5]=true
  expect(erroresDatosRecursos({excepcion_apertura_aux_unico:fuera},[])).toEqual([])
  expect(erroresDatosRecursos({excepcion_apertura_aux_unico:[[true]]},[])).toContain('Excepción de AUX único inválida (matriz 7×30 de booleanos)')
  expect((await generarPropuestaHibrida(apertura(undefined,'999'),{...OP,sucursal:'999'})).bloqueos).toContain('POLITICA_APERTURA_SUPERVISION')
 })
 it('AH2-042 regresión: franja autorizada fuera de 08:00–09:00 con un único AUX presente → puede atender caja; sin autorización, no',async()=>{
  const base=()=>{const i=demoSucursalLab();i.supervisor_jornada_completa=false;i.demanda[0]=i.demanda[0].map((n,s)=>s>=20&&s<24?6:n);return i}
  const cajaLunes=(r:{asignacion_aux:Record<string,string[][]>})=>r.asignacion_aux['aux-sA'][0].slice(20,24).filter(v=>v==='CAJA').length
  const sin=await generarPropuestaHibrida(base(),{...OP,sucursal:'lab-sintetica'})
  expect(cajaLunes(sin.propuesta!)).toBe(0) // H-A2 ordinaria: el único AUX queda de pie
  const auth=Array.from({length:7},(_,d)=>Array.from({length:30},(_,s)=>d===0&&s>=20&&s<24))
  const con=await generarPropuestaHibrida({...base(),excepcion_apertura_aux_unico:auth},{...OP,sucursal:'lab-sintetica'})
  expect(cajaLunes(con.propuesta!)).toBeGreaterThan(0)
  expect((con.candidatos.A as {valido:boolean;infracciones:string[]})).toMatchObject({valido:true})
  expect((con.candidatos.A as {infracciones:string[]}).infracciones).not.toContain('H-A2')
  expect(con.excepcionApertura.franjasAplicadas).toBeGreaterThan(0)
  // Fuera de las franjas autorizadas (martes: tras las 17 solo queda aux-sB) sigue la regla ordinaria.
  expect(con.propuesta!.asignacion_aux['aux-sB'][1].slice(18,28).includes('CAJA')).toBe(false)
  const {K}=mascarasAH2040({...base(),excepcion_apertura_aux_unico:auth})
  expect(K['aux-sA'].has('0/21')).toBe(true);expect(mascarasAH2040(base()).K['aux-sA'].has('0/21')).toBe(false)
 })
 it('el contrato A→B transporta la excepción',()=>{
  expect(aEntradaB(apertura(TODA),'091').entrada.input.excepcion_apertura_aux_unico).toEqual(TODA)
 })
})

describe('AH2-042 · plan CP-SAT con AUX único en franja autorizada, validado por A',()=>{
 it('A acepta el plan de B y rechaza sentar al AUX fuera de la franja autorizada',async()=>{
  const caso=(await import('./fixtures/excepcionAuxUnicoCasoB.json')).default as unknown as {data:{input:InputAlgoritmo};plan:PlanB}
  const input=compilarDisponibilidadCaja(caso.data.input).input
  const semana={desde:new Date(0),hasta:new Date(0)}
  const r=planBaResultado(input,caso.plan,semana)
  const h=(x:ReturnType<typeof planBaResultado>)=>auditarEscenario(input,x).violaciones.filter(v=>v.nivel!=='DATOS').map(v=>v.codigo)
  expect(r.asignacion_aux['aux-sA'][0].slice(20,24)).toEqual(['CAJA','CAJA','CAJA','CAJA'])
  expect(h(r)).toEqual([])
  const malo=structuredClone(caso.plan);malo.AUX['aux-sA'][0]=[...malo.AUX['aux-sA'][0],25]
  expect(h(planBaResultado(input,malo,semana))).toContain('H-A2')
 })
})
