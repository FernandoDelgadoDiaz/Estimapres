/** Edición local de topes de caja EVENTUAL por contrato de origen (sin persistencia). Datos sintéticos. */
import {describe,expect,it} from 'vitest'
import {editarTopes,SIN_TOPES,topesVigentes} from '../topesContrato'
import {demoSucursalLab} from '../demoSucursal'
import {generarPropuestaHibrida} from '../orquestador'

const OP={timeoutMs:5000,parametros:{segundos:5,modo:'global' as const,semilla:1},id:'t',sucursal:'lab'}

describe('editor de topes por contrato de origen',()=>{
 it('sin configuración: sin topes (desactivados, no 0); crear abre vigencia desde la semana',()=>{
  expect(topesVigentes(undefined,'s1','2026-11-23')).toEqual(SIN_TOPES)
  const c=editarTopes(undefined,'s1','2026-11-23',{FULL:{activo:true,horas:12},PART:{activo:true,horas:8}})
  expect(c.configuraciones).toEqual([expect.objectContaining({sucursalId:'s1',vigenciaDesde:'2026-11-23',vigenciaHasta:null,FULL:{activo:true,horas:12},PART:{activo:true,horas:8}})])
  expect(topesVigentes(c,'s1','2026-12-07')).toEqual({FULL:{activo:true,horas:12},PART:{activo:true,horas:8}}) // sin recarga semanal
  expect(topesVigentes(c,'s2','2026-11-23')).toEqual(SIN_TOPES) // otra sucursal
 })
 it('editar la vigente en su lugar, desactivar conserva el valor y no toca otras sucursales',()=>{
  let c=editarTopes(undefined,'s1','2026-11-23',{FULL:{activo:true,horas:12},PART:{activo:true,horas:8}})
  c=editarTopes(c,'s2','2026-11-23',{FULL:{activo:true,horas:20},PART:{activo:false,horas:null}})
  c=editarTopes(c,'s1','2026-11-30',{FULL:{activo:false,horas:12},PART:{activo:true,horas:6}})
  expect(c.configuraciones).toHaveLength(2)
  expect(topesVigentes(c,'s1','2026-11-30')).toEqual({FULL:{activo:false,horas:12},PART:{activo:true,horas:6}})
  expect(topesVigentes(c,'s2','2026-11-30').FULL).toEqual({activo:true,horas:20})
 })
 it('rechaza activo sin horas u horas inválidas',()=>{
  expect(()=>editarTopes(undefined,'s1','2026-11-23',{FULL:{activo:true,horas:null},PART:{activo:false}})).toThrow('activo sin horas')
  expect(()=>editarTopes(undefined,'s1','2026-11-23',{FULL:{activo:true,horas:85},PART:{activo:false}})).toThrow()
 })
 it('salida híbrida: el tope de clase limita la caja EVENTUAL y se informa en horas por persona',async()=>{
  const i=demoSucursalLab()
  const perfiles=i.disponibilidad_caja_eventual!.perfiles
  for(const p of perfiles)p.contratoOrigen='FULL'
  const ids=[...new Set(perfiles.filter(p=>p.acreditacion!=='NO_ACREDITADA').map(p=>p.colaboradorId))]
  const libre=await generarPropuestaHibrida(structuredClone(i),OP)
  i.topes_caja_eventual_contrato=editarTopes(undefined,i.sucursal_id!,i.semana!,{FULL:{activo:true,horas:1},PART:{activo:false}})
  const s=await generarPropuestaHibrida(i,OP)
  const ev=s.horasPorEmpleado.filter(x=>(x as {rol:string}).rol==='EVENTUAL') as {id:string;horasCaja:number;topeCajaHoras:number|null;contratoOrigen:string|null}[]
  expect(ev.length).toBeGreaterThan(0)
  for(const x of ev.filter(x=>ids.includes(x.id))){expect(x.horasCaja).toBeLessThanOrEqual(1);expect(x.contratoOrigen).toBe('FULL')}
  expect(s.conflictos.filter(c=>c.codigo==='EV_CAJA_SUPERA_TOPE')).toEqual([])
  expect(s.faltantesHoras!).toBeGreaterThanOrEqual(libre.faltantesHoras!)
 })
})
