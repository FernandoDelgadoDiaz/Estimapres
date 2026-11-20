/** AH2-037 (aprobado 20/11/2026): excepción local opt-in de apertura con AUX único 08:00–09:00 en A, validadores y salida. */
import {describe,expect,it} from 'vitest'
import type {InputAlgoritmo} from '../../algoritmo/types'
import {demoSucursalLab} from '../demoSucursal'
import {generarPropuestaHibrida} from '../orquestador'
import {erroresDatosRecursos} from '../../algoritmo/politicaRecursos'
import {aEntradaB} from '../contrato'

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
  expect(s.bloqueos).toEqual([])
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
  const fuera=TODA.map(r=>[...r]);fuera[0][5]=true
  expect(erroresDatosRecursos({excepcion_apertura_aux_unico:fuera},[])).toContain('Excepción de apertura AUX único inválida o fuera de la franja 08:00–09:00')
  expect((await generarPropuestaHibrida(apertura(undefined,'999'),{...OP,sucursal:'999'})).bloqueos).toContain('POLITICA_APERTURA_SUPERVISION')
 })
 it('el contrato A→B transporta la excepción',()=>{
  expect(aEntradaB(apertura(TODA),'091').entrada.input.excepcion_apertura_aux_unico).toEqual(TODA)
 })
})
