/** Configuración editable por sucursal: permanentes vs excepciones temporales (AH2-042). Datos sintéticos. */
import {describe,expect,it,vi,beforeEach} from 'vitest'
import {ErrorConfigMotor,cargarConfiguracionMotor,guardarFilas,planReemplazo,proponerImportacion,reemplazarDesde,resolverConfiguracion,validarFila,
 type FilaConfigMotor,type NuevaFila} from '../configuracionPersistente'
import {compilarDisponibilidadCaja,validarDisponibilidadCaja,validarTopesContrato} from '../../algoritmo/disponibilidadCajaEventual'
import {compilarCondiciones} from '../../algoritmo/condicionesSupervisor'
import {demoSucursalLab} from '../demoSucursal'
import type {OpcionesGeneracion} from '../../algoritmo/adapter'

const S='lab-sintetica'
let n=0
const fila=(x:Partial<FilaConfigMotor>&Pick<FilaConfigMotor,'tipo'|'clase'|'vigencia_desde'|'datos'>):FilaConfigMotor=>({id:`f${++n}`,sucursal_id:S,colaborador_id:null,vigencia_hasta:null,activa:true,motivo:'',...x})
const topes=(full:number,part:number)=>({FULL:{activo:true,horas:full},PART:{activo:true,horas:part}})
const permTopes=fila({tipo:'topes_caja_eventual_contrato',clase:'permanente',vigencia_desde:'2026-11-23',datos:topes(12,8)})
const tempTopes=fila({tipo:'topes_caja_eventual_contrato',clase:'temporal',vigencia_desde:'2026-12-07',vigencia_hasta:'2026-12-13',datos:topes(6,4)})
const perfil=(id:string,clase:'permanente'|'temporal',desde:string,hasta:string|null,acred='TODA_LA_PRESENCIA')=>fila({tipo:'perfil_caja_eventual',clase,colaborador_id:id,vigencia_desde:desde,vigencia_hasta:hasta,datos:{acreditacion:acred,contratoOrigen:'FULL',fuente:'sintética'}})
const exclusion=(id:string,desde:string,hasta:string)=>fila({tipo:'condicion_supervisor',clase:'temporal',colaborador_id:id,vigencia_desde:desde,vigencia_hasta:hasta,datos:{id:`ex-${id}`,modo:'DEBE',tipo:'exclusion_manual',colaboradorId:id}})

describe('resolución por semana',()=>{
 it('una regla permanente rige todas las semanas siguientes sin recarga',()=>{
  for(const semana of ['2026-11-23','2026-11-30','2027-03-01']){
   const r=resolverConfiguracion([permTopes],S,semana)
   expect(r.opciones.topes_caja_eventual_contrato!.configuraciones[0]).toMatchObject({vigenciaDesde:semana,vigenciaHasta:r.domingo,FULL:{horas:12},PART:{horas:8}})
  }
  expect(resolverConfiguracion([permTopes],S,'2026-11-16').opciones).toEqual({}) // antes de su inicio no rige
 })
 it('la excepción temporal reemplaza a la permanente solo durante sus fechas y luego vuelve la permanente',()=>{
  const h=(semana:string)=>resolverConfiguracion([permTopes,tempTopes],S,semana).opciones.topes_caja_eventual_contrato!.configuraciones[0].FULL.horas
  expect([h('2026-11-30'),h('2026-12-07'),h('2026-12-14')]).toEqual([12,6,12])
  const t=resolverConfiguracion([permTopes,tempTopes],S,'2026-12-07').traza
  expect(t).toEqual([expect.objectContaining({clase:'temporal',filaId:tempTopes.id})])
 })
 it('perfiles por persona: la excepción de una persona no afecta a otra',()=>{
  const filas=[perfil('ev-a','permanente','2026-11-23',null),perfil('ev-b','permanente','2026-11-23',null),perfil('ev-b','temporal','2026-12-07','2026-12-13','NO_ACREDITADA')]
  const r=resolverConfiguracion(filas,S,'2026-12-07').opciones.disponibilidad_caja_eventual!
  expect(r.perfiles.map(p=>[p.colaboradorId,p.acreditacion])).toEqual([['ev-a','TODA_LA_PRESENCIA'],['ev-b','NO_ACREDITADA']])
  expect(validarDisponibilidadCaja(r).perfiles).toHaveLength(2)
 })
 it('condiciones del supervisor: solo las que se superponen con la semana, con sus fechas',()=>{
  const filas=[exclusion('p1','2026-11-23','2026-11-29')]
  expect(resolverConfiguracion(filas,S,'2026-11-23').opciones.condiciones_supervisor).toEqual({version:1,sucursal_id:S,semana:'2026-11-23',
   condiciones:[{id:'ex-p1',modo:'DEBE',tipo:'exclusion_manual',colaboradorId:'p1',desde:'2026-11-23',hasta:'2026-11-29'}]})
  expect(resolverConfiguracion(filas,S,'2026-11-30').opciones.condiciones_supervisor).toBeUndefined()
 })
 it('desactivadas, de otra sucursal o ambiguas: no se aplican o se rechazan sin elegir una',()=>{
  expect(resolverConfiguracion([{...permTopes,activa:false},{...permTopes,id:'x',sucursal_id:'otra'}],S,'2026-11-30').opciones).toEqual({})
  expect(()=>resolverConfiguracion([permTopes,{...permTopes,id:'dup'}],S,'2026-11-30')).toThrow(ErrorConfigMotor)
  expect(()=>resolverConfiguracion([permTopes],S,'2026-11-24')).toThrow('lunes')
  const nueva={...permTopes,id:'nueva',vigencia_desde:'2026-12-07',datos:topes(10,6)}
  expect(resolverConfiguracion([permTopes,nueva],S,'2026-12-07').opciones.topes_caja_eventual_contrato!.configuraciones[0].FULL.horas).toBe(10)
 })
})

describe('validación y reemplazo',()=>{
 const base:NuevaFila={sucursal_id:S,clase:'temporal',tipo:'topes_caja_eventual_contrato',colaborador_id:null,vigencia_desde:'2026-11-23',vigencia_hasta:null,datos:topes(12,8),activa:true,motivo:''}
 it('rechaza excepción temporal sin fin, alcances incorrectos y datos inválidos',()=>{
  expect(()=>validarFila(base)).toThrow('fecha de fin')
  expect(()=>validarFila({...base,clase:'permanente',datos:{FULL:{activo:true,horas:null},PART:{activo:false}}})).toThrow()
  expect(()=>validarFila({...base,clase:'permanente',colaborador_id:'p1'})).toThrow('sucursal')
  expect(()=>validarFila({...base,clase:'permanente',tipo:'perfil_caja_eventual',datos:{acreditacion:'TODA_LA_PRESENCIA'}})).toThrow('persona')
  expect(()=>validarFila({...base,clase:'permanente',tipo:'excepcion_apertura_aux_unico',datos:{dias:[7]}})).toThrow()
  expect(()=>validarFila({...base,vigencia_hasta:'2026-11-22'})).toThrow('anterior')
  expect(validarFila({...base,clase:'permanente'})).toBeTruthy()
 })
 it('cambiar una permanente desde una fecha cierra la anterior el día previo (historial sin borrados)',()=>{
  const p=planReemplazo(permTopes,{...base,clase:'permanente',vigencia_desde:'2026-12-07',datos:topes(10,6)})
  expect(p.cerrar).toEqual({id:permTopes.id,vigencia_hasta:'2026-12-06'})
  const cerrada={...permTopes,vigencia_hasta:'2026-12-06'},nueva={...permTopes,id:'n',vigencia_desde:'2026-12-07',datos:topes(10,6)}
  expect(resolverConfiguracion([cerrada,nueva],S,'2026-11-30').opciones.topes_caja_eventual_contrato!.configuraciones[0].FULL.horas).toBe(12)
  expect(resolverConfiguracion([cerrada,nueva],S,'2026-12-07').opciones.topes_caja_eventual_contrato!.configuraciones[0].FULL.horas).toBe(10)
  expect(()=>planReemplazo(permTopes,{...base,clase:'permanente',tipo:'excepcion_apertura_aux_unico',datos:{dias:[0]}})).toThrow('alcance')
 })
})

describe('importación desde la configuración del servicio y compatibilidad con el motor',()=>{
 const servicio:OpcionesGeneracion={
  disponibilidad_caja_eventual:{version:1,perfiles:[
   {colaboradorId:'ev-a',sucursalId:S,vigenciaDesde:'2026-11-23',vigenciaHasta:'2026-11-29',acreditacion:'PRESENCIA_MENOS_RESERVAS',fuente:'ratificación',contratoOrigen:'FULL',horasContractuales:48,reservas:[{dias:[0,1,2,3,4,5],desde:'09:00',hasta:'11:00'}]},
   {colaboradorId:'ev-b',sucursalId:S,vigenciaDesde:'2026-11-23',vigenciaHasta:'2026-11-29',acreditacion:'TODA_LA_PRESENCIA',fuente:'ratificación',contratoOrigen:'PART',horasContractuales:30}]},
  topes_caja_eventual_contrato:{version:1,configuraciones:[{sucursalId:S,vigenciaDesde:'2026-11-23',vigenciaHasta:'2026-11-29',fuente:'MASTER',FULL:{activo:true,horas:12},PART:{activo:true,horas:8}}]},
  condiciones_supervisor:{version:1,sucursal_id:S,semana:'2026-11-23',condiciones:[{id:'ex-1',modo:'DEBE',tipo:'exclusion_manual',colaboradorId:'p-full',desde:'2026-11-23',hasta:'2026-11-29'}]},
  excepcion_apertura_aux_unico:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2)),
 }
 const importadas=()=>proponerImportacion(servicio,S).map(x=>({...x,id:`i${++n}`}) as FilaConfigMotor)
 it('perfiles, topes y apertura pasan a permanentes; las condiciones quedan como excepciones temporales',()=>{
  const p=proponerImportacion(servicio,S)
  expect(p.map(x=>[x.tipo,x.clase,x.vigencia_desde,x.vigencia_hasta])).toEqual([
   ['perfil_caja_eventual','permanente','2026-11-23',null],['perfil_caja_eventual','permanente','2026-11-23',null],
   ['topes_caja_eventual_contrato','permanente','2026-11-23',null],['excepcion_apertura_aux_unico','permanente','2026-11-23',null],
   ['condicion_supervisor','temporal','2026-11-23','2026-11-29']])
  expect(proponerImportacion(servicio,'otra')).toEqual([])
 })
 it('la semana importada reproduce la configuración original; la siguiente conserva las permanentes sin la exclusión',()=>{
  const f=importadas()
  const s1=resolverConfiguracion(f,S,'2026-11-23').opciones
  expect(s1.excepcion_apertura_aux_unico).toEqual(servicio.excepcion_apertura_aux_unico)
  expect(s1.topes_caja_eventual_contrato!.configuraciones[0]).toMatchObject({FULL:{activo:true,horas:12},PART:{activo:true,horas:8}})
  expect(s1.disponibilidad_caja_eventual!.perfiles.map(p=>({...p,fuente:undefined}))).toEqual(servicio.disponibilidad_caja_eventual!.perfiles.map(p=>({...p,fuente:undefined})))
  expect(s1.condiciones_supervisor!.condiciones).toEqual(servicio.condiciones_supervisor!.condiciones)
  const s2=resolverConfiguracion(f,S,'2026-11-30').opciones
  expect(s2.condiciones_supervisor).toBeUndefined()
  expect(s2.disponibilidad_caja_eventual!.perfiles.every(p=>p.vigenciaDesde==='2026-11-30'&&p.vigenciaHasta==='2026-12-06')).toBe(true)
  expect(validarTopesContrato(s2.topes_caja_eventual_contrato).configuraciones).toHaveLength(1)
 })
 it('el motor compila la configuración resuelta sin diagnósticos de perfil faltante (formato idéntico)',()=>{
  const i=demoSucursalLab()
  const r=resolverConfiguracion(importadas(),S,i.semana!).opciones
  const {info}=compilarDisponibilidadCaja({...i,disponibilidad_caja_eventual:r.disponibilidad_caja_eventual,topes_caja_eventual_contrato:r.topes_caja_eventual_contrato})
  expect(info!.diagnosticos.filter(d=>d.bloqueaPublicacion)).toEqual([])
  expect(info!.eventuales['ev-b'].topeSlots).toBe(16) // PART 8 h
  const cajero=i.colaboradores.find(c=>c.rol==='FULL'||c.rol==='PART')!.id
  const c=resolverConfiguracion([exclusion(cajero,i.semana!,'2026-11-29')],S,i.semana!).opciones.condiciones_supervisor!
  expect(compilarCondiciones({...i,condiciones_supervisor:c}).auditoria!.excluidos).toEqual([cajero])
 })
})

describe('capa de datos (Supabase con RLS)',()=>{
 const cliente=(resp:{data?:unknown;error?:unknown})=>{
  const llamadas:string[]=[]
  const q:any={select:()=>(llamadas.push('select'),q),eq:(c:string,v:string)=>(llamadas.push(`eq:${c}=${v}`),q),order:()=>Promise.resolve(resp),
   insert:(x:unknown)=>(llamadas.push(`insert:${JSON.stringify(x).length}`),{select:()=>Promise.resolve({data:[{id:'nuevo'}],error:null})}),
   update:(x:Record<string,unknown>)=>(llamadas.push(`update:${JSON.stringify(x)}`),{eq:()=>Promise.resolve({error:null})})}
  return {db:{from:(t:string)=>(llamadas.push(`from:${t}`),q)},llamadas}
 }
 it('tabla sin migrar → no disponible (se sigue usando el servicio); filtra por usuario y sucursal',async()=>{
  expect(await cargarConfiguracionMotor(cliente({data:null,error:{code:'42P01'}}).db,'u','091')).toEqual({disponible:false,filas:[]})
  const c=cliente({data:[],error:null})
  expect(await cargarConfiguracionMotor(c.db,'u','091')).toEqual({disponible:true,filas:[]})
  expect(c.llamadas).toEqual(['from:configuracion_motor_sucursal','select','eq:local_id=u','eq:sucursal_id=091'])
  await expect(cargarConfiguracionMotor(cliente({data:[{local_id:'otro',sucursal_id:'091'}],error:null}).db,'u','091')).rejects.toThrow('ámbito')
  await expect(cargarConfiguracionMotor(cliente({data:null,error:{code:'500'}}).db,'u','091')).rejects.toThrow('leer')
 })
 it('guardar valida antes de escribir; reemplazar crea la nueva y cierra la anterior',async()=>{
  const c=cliente({})
  await expect(guardarFilas(c.db,[{sucursal_id:S,clase:'temporal',tipo:'topes_caja_eventual_contrato',colaborador_id:null,vigencia_desde:'2026-11-23',vigencia_hasta:null,datos:topes(1,1),activa:true,motivo:''}])).rejects.toThrow()
  expect(c.llamadas).toEqual([])
  await reemplazarDesde(c.db,permTopes,{sucursal_id:S,clase:'permanente',tipo:'topes_caja_eventual_contrato',colaborador_id:null,vigencia_desde:'2026-12-07',vigencia_hasta:null,datos:topes(10,6),activa:true,motivo:'cambio'})
  expect(c.llamadas.filter(x=>x.startsWith('insert')||x.startsWith('update'))).toEqual([expect.stringMatching(/^insert/),'update:{"vigencia_hasta":"2026-12-06"}'])
 })
})

describe('precedencia en el flujo integrado',()=>{
 beforeEach(()=>{vi.resetModules();vi.unstubAllGlobals();vi.unstubAllEnvs()})
 async function flujo(filas:FilaConfigMotor[]|'sin-tabla'){
  vi.stubEnv('VITE_AH2_HIBRIDO_091','true');vi.stubEnv('VITE_AH2_OPTIMIZER_URL','https://servicio.example')
  const user={id:'u1',is_anonymous:false}
  const q:any={select:()=>q,eq:()=>q,order:()=>Promise.resolve(filas==='sin-tabla'?{data:null,error:{code:'PGRST205'}}:{data:filas.map(f=>({...f,local_id:'u1',sucursal_id:'091'})),error:null})}
  vi.doMock('../../lib/supabase',()=>({supabase:{auth:{getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session:{user,access_token:'jwt'}}})},from:()=>q}}))
  vi.doMock('../../utils/sucursal',()=>({getSucursalActual:()=>'091'}))
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({usuario:'u1',sucursal:'091',configuracion:{topes_caja_eventual_contrato:{version:1,configuraciones:[{sucursalId:'091',vigenciaDesde:'2026-11-23',fuente:'servicio',FULL:{activo:true,horas:99},PART:{activo:false}}]}}}),{status:200}))
  const {configuracionAutenticada}=await import('../integracion')
  return configuracionAutenticada('091',undefined,undefined,'2026-11-30')
 }
 it('sin filas guardadas (o sin tabla) usa la configuración del servicio',async()=>{
  for(const caso of [[],'sin-tabla'] as const){const r=await flujo(caso as never);expect(r.fuente).toBe('servicio');expect(r.opciones.topes_caja_eventual_contrato!.configuraciones[0].FULL.horas).toBe(99)}
 })
 it('con filas guardadas, son la única fuente y se resuelven para la semana pedida',async()=>{
  const r=await flujo([{...permTopes,sucursal_id:'091'}])
  expect(r.fuente).toBe('persistida')
  expect(r.opciones.topes_caja_eventual_contrato!.configuraciones[0]).toMatchObject({sucursalId:'091',vigenciaDesde:'2026-11-30',FULL:{horas:12}})
  expect(r.traza).toHaveLength(1)
 })
})
