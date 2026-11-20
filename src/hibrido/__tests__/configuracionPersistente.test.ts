/** Configuración editable por sucursal (AH2-042): permanentes, excepciones por fecha, integridad y edición. Sintético. */
import {describe,expect,it,vi,beforeEach} from 'vitest'
import {aplicarCambio,cargarConfiguracionMotor,ErrorConfigMotor,importarFilas,proponerImportacion,resolverConfiguracion,semanasAfectadas,simularCambio,validarFila,
 type FilaConfigMotor,type NuevaFila} from '../configuracionPersistente'
import {compilarDisponibilidadCaja,validarDisponibilidadCaja,validarTopesContrato} from '../../algoritmo/disponibilidadCajaEventual'
import {compilarCondiciones} from '../../algoritmo/condicionesSupervisor'
import {demoSucursalLab} from '../demoSucursal'
import {filaDesdeFormulario} from '../../components/reglas/ConfiguracionMotorPanel'
import type {OpcionesGeneracion} from '../../algoritmo/adapter'

const S='lab-sintetica',L='2026-11-23' // lunes
let n=0
const fila=(x:Partial<FilaConfigMotor>&Pick<FilaConfigMotor,'tipo'|'clase'|'vigencia_desde'|'datos'>):FilaConfigMotor=>({id:`f${++n}`,sucursal_id:S,colaborador_id:null,vigencia_hasta:null,activa:true,motivo:'',version:1,...x})
const topes=(full:number|null,part:number|null)=>({FULL:full===null?{activo:false,horas:null}:{activo:true,horas:full},PART:part===null?{activo:false,horas:null}:{activo:true,horas:part}})
const tope=(clase:'permanente'|'temporal',desde:string,hasta:string|null,full:number|null,part:number|null)=>fila({tipo:'topes_caja_eventual_contrato',clase,vigencia_desde:desde,vigencia_hasta:hasta,datos:topes(full,part)})
const perfil=(id:string,clase:'permanente'|'temporal',desde:string,hasta:string|null,datos:Record<string,unknown>={acreditacion:'TODA_LA_PRESENCIA'})=>fila({tipo:'perfil_caja_eventual',clase,colaborador_id:id,vigencia_desde:desde,vigencia_hasta:hasta,datos:{contratoOrigen:'FULL',fuente:'sintética',...datos}})
const cond=(id:string,persona:string|null,desde:string,hasta:string,datos:Record<string,unknown>)=>fila({tipo:'condicion_supervisor',clase:'temporal',colaborador_id:persona,vigencia_desde:desde,vigencia_hasta:hasta,datos:{id,modo:'DEBE',...(persona?{colaboradorId:persona}:{}),...datos}})
const apertura=(clase:'permanente'|'temporal',desde:string,hasta:string|null,franjas:{dia:number;desde:string;hasta:string}[])=>fila({tipo:'excepcion_apertura_aux_unico',clase,vigencia_desde:desde,vigencia_hasta:hasta,datos:{franjas}})
const tp=(r:ReturnType<typeof resolverConfiguracion>)=>r.opciones.topes_caja_eventual_contrato!.configuraciones[0]

describe('vigencia por fecha (día a día)',()=>{
 it('permanentes rigen todas las semanas desde su inicio, sin recarga',()=>{
  const p=tope('permanente',L,null,12,8)
  for(const s of [L,'2026-11-30','2027-03-01'])expect(tp(resolverConfiguracion([p],S,s))).toMatchObject({vigenciaDesde:s,FULL:{horas:12},PART:{horas:8}})
  expect(resolverConfiguracion([p],S,'2026-11-16').opciones).toEqual({})
 })
 it('regresión punto 1: los máximos semanales NO se prorratean; rigen por semanas completas',()=>{
  // Una excepción de topes de miércoles a viernes se rechaza al guardar (no se inventa un valor intermedio).
  expect(()=>validarFila(tope('temporal','2026-12-09','2026-12-11',6,4))).toThrow('semanas completas')
  // Por semana completa: el valor exacto, sin prorrateo; la semana siguiente vuelve la permanente.
  const f=[tope('permanente',L,null,12,8),tope('temporal','2026-12-07','2026-12-13',6,4)]
  expect(tp(resolverConfiguracion(f,S,'2026-12-07'))).toMatchObject({FULL:{activo:true,horas:6},PART:{activo:true,horas:4}})
  expect(tp(resolverConfiguracion(f,S,'2026-12-14')).FULL.horas).toBe(12)
  // Datos que no respeten semanas completas (p. ej., cargados a mano) → conflicto explícito, nunca un promedio.
  const legado=[tope('permanente',L,null,12,8),{...tope('temporal','2026-12-07','2026-12-13',6,4),vigencia_desde:'2026-12-09',vigencia_hasta:'2026-12-11'}]
  const r=resolverConfiguracion(legado,S,'2026-12-07')
  expect(r.conflictos).toEqual([expect.objectContaining({tipo:'topes_caja_eventual_contrato',detalle:expect.stringContaining('semanas completas')})])
  expect(tp(r).FULL.horas).toBe(12) // nunca un valor intermedio; el conflicto bloquea la generación híbrida de esa semana
  // Si dos versiones válidas por semana completa se cruzaran dentro de una semana (no debería ocurrir), conflicto explícito.
  const cruzadas=resolverConfiguracion([tope('permanente',L,'2026-12-06',12,8),{...tope('permanente','2026-12-07',null,6,4),vigencia_desde:'2026-12-10'}],S,'2026-12-07')
  expect(cruzadas.conflictos.map(c=>c.tipo)).toContain('topes_caja_eventual_contrato')
 })
 it('regresión punto 1: una permanente de topes no puede empezar a mitad de semana',()=>{
  expect(()=>validarFila(tope('permanente','2026-12-10',null,12,null))).toThrow('lunes')
  expect(()=>validarFila(tope('permanente',L,'2026-12-10',12,8))).toThrow('domingo')
  expect(validarFila(tope('permanente',L,'2026-12-13',12,8))).toBeTruthy()
 })
 it('perfil: «no atiende caja» de miércoles a jueves se expresa como reservas de esos días; el motor lo compila sin bloqueos',()=>{
  const i=demoSucursalLab()
  const f=[perfil('ev-b','permanente',L,null),perfil('ev-b','temporal','2026-11-25','2026-11-26',{acreditacion:'NO_ACREDITADA'})]
  const r=resolverConfiguracion(f,S,i.semana!)
  const p=r.opciones.disponibilidad_caja_eventual!.perfiles[0]
  expect(p).toMatchObject({colaboradorId:'ev-b',acreditacion:'PRESENCIA_MENOS_RESERVAS',reservas:[{dias:[2],desde:'08:00',hasta:'23:00'},{dias:[3],desde:'08:00',hasta:'23:00'}]})
  validarDisponibilidadCaja(r.opciones.disponibilidad_caja_eventual)
  const {input,info}=compilarDisponibilidadCaja({...i,disponibilidad_caja_eventual:r.opciones.disponibilidad_caja_eventual})
  expect(info!.diagnosticos.filter(d=>d.colaboradorId==='ev-b'&&d.bloqueaPublicacion)).toEqual([])
  const res=input.reservas_sector_eventual!['ev-b']
  expect([2,3].every(d=>res[d].every((v,s)=>v||i.disponibilidad_eventual['ev-b'][d][s]==='NO_DISPONIBLE'))).toBe(true)
  expect([0,1,4,5,6].every(d=>!res[d].some(Boolean))).toBe(true)
 })
 it('regresión punto 1: perfil con máximo individual distinto un día → conflicto (sin prorrateo); igual valor → se conserva',()=>{
  const perm=perfil('ev-a','permanente',L,null,{acreditacion:'PRESENCIA_MENOS_RESERVAS',reservas:[{dias:[0,1,2,3,4,5],desde:'09:00',hasta:'11:00'}],maxCajaHoras:14})
  const r=resolverConfiguracion([perm,perfil('ev-a','temporal','2026-11-28','2026-11-28',{acreditacion:'TODA_LA_PRESENCIA'})],S,L)
  expect(r.conflictos).toEqual([expect.objectContaining({colaboradorId:'ev-a',detalle:expect.stringContaining('no se prorratean')})])
  expect(r.opciones.disponibilidad_caja_eventual).toBeUndefined()
  const igual=resolverConfiguracion([perm,perfil('ev-a','temporal','2026-11-28','2026-11-28',{acreditacion:'TODA_LA_PRESENCIA',maxCajaHoras:14})],S,L)
  const p=igual.opciones.disponibilidad_caja_eventual!.perfiles[0]
  expect(p.maxCajaHoras).toBe(14);expect(p.reservas!.map(x=>x.dias[0])).toEqual([0,1,2,3,4])
  // «No atiende caja» unos días no cambia el máximo semanal de los días con caja.
  const na=resolverConfiguracion([perm,perfil('ev-a','temporal','2026-11-25','2026-11-26',{acreditacion:'NO_ACREDITADA'})],S,L)
  expect(na.conflictos).toEqual([]);expect(na.opciones.disponibilidad_caja_eventual!.perfiles[0].maxCajaHoras).toBe(14)
 })
 it('regresión punto 4: apertura con franjas libres por sucursal (sin 08:00–09:00 fijo); excepción temporal la quita un día',()=>{
  const lunMar=apertura('permanente',L,null,[{dia:0,desde:'08:00',hasta:'09:00'},{dia:1,desde:'08:00',hasta:'08:30'}])
  expect(resolverConfiguracion([lunMar],S,L).opciones.excepcion_apertura_aux_unico!.map(r=>r.filter(Boolean).length)).toEqual([2,1,0,0,0,0,0])
  const todos=apertura('permanente',L,null,[0,1,2,3,4,5,6].map(dia=>({dia,desde:'08:00',hasta:'09:00'})))
  const sinMie=resolverConfiguracion([todos,apertura('temporal','2026-11-25','2026-11-25',[])],S,L).opciones.excepcion_apertura_aux_unico!
  expect(sinMie.map(r=>r.filter(Boolean).length)).toEqual([2,2,0,2,2,2,2])
  // Franja autorizada a media mañana y a la noche: válida y aplicada en sus franjas exactas.
  const libre=apertura('permanente',L,null,[{dia:2,desde:'10:00',hasta:'11:00'},{dia:5,desde:'21:00',hasta:'22:00'}])
  expect(validarFila(libre)).toBeTruthy()
  const m=resolverConfiguracion([libre],S,L).opciones.excepcion_apertura_aux_unico!
  expect(m[2].flatMap((v,s)=>v?[s]:[])).toEqual([4,5]);expect(m[5].flatMap((v,s)=>v?[s]:[])).toEqual([26,27])
  expect(()=>validarFila(apertura('permanente',L,null,[{dia:0,desde:'09:00',hasta:'08:00'}]))).toThrow('Franja inválida')
  expect(()=>validarFila(apertura('permanente',L,null,[{dia:7,desde:'08:00',hasta:'09:00'}]))).toThrow('Franja inválida')
 })
})

describe('condiciones del supervisor (todas las que admite el motor)',()=>{
 it('franco, turno con definición, máximo de francos, exclusión y franco y medio: el motor las compila',()=>{
  const i=demoSucursalLab();i.colaboradores.push({id:'f1',nombre:'Cajero FULL',rol:'FULL',horasSemanales:48} as never)
  const [a,b]=i.colaboradores.filter(c=>c.rol==='PART').map(c=>c.id),full='f1'
  const f=[cond('c1',a,'2026-11-26','2026-11-26',{tipo:'franco',dia:3}),cond('c2',b,L,'2026-11-29',{tipo:'turno',valor:'mañana',modo:'PREFERIRIA',turno:{inicioMin:'09:00',inicioMax:'10:00',finMax:'16:00'}}),
   cond('c3',null,L,'2026-11-29',{tipo:'max_francos',valor:2}),cond('c4',full,L,'2026-11-29',{tipo:'franco_medio_corrido',modo:'PREFERIRIA'})]
  const r=resolverConfiguracion(f,S,i.semana!)
  expect(r.conflictos).toEqual([])
  expect(r.opciones.condiciones_supervisor!.turnos).toEqual({mañana:{inicioMin:'09:00',inicioMax:'10:00',finMax:'16:00'}})
  const out=compilarCondiciones({...i,condiciones_supervisor:r.opciones.condiciones_supervisor})
  expect(out.auditoria!.aplicadas.map(c=>c.id).sort()).toEqual(['c1','c2','c3','c4'])
  expect(out.auditoria!.aplicadas.find(c=>c.id==='c1')!.dias).toEqual([3])
 })
 it('regresión punto 3: una excepción temporal del supervisor reemplaza a la permanente SOLO en sus días',()=>{
  const i=demoSucursalLab()
  const perm=fila({tipo:'condicion_supervisor',clase:'permanente',colaborador_id:'p1',vigencia_desde:'2026-11-02',datos:{id:'t-man',modo:'DEBE',tipo:'turno',valor:'mañana',colaboradorId:'p1',turno:{inicioMin:'09:00',inicioMax:'10:00',finMax:'16:00'}}})
  const temp=cond('t-tar','p1','2026-11-25','2026-11-26',{tipo:'turno',valor:'tarde',turno:{inicioMin:'14:00',inicioMax:'15:00'}})
  const r=resolverConfiguracion([perm,temp],S,i.semana!)
  expect(r.conflictos).toEqual([])
  const c=r.opciones.condiciones_supervisor!
  expect(c.condiciones.map(x=>[x.id,x.valor,x.desde,x.hasta])).toEqual([
   ['t-man@2026-11-23','mañana','2026-11-23','2026-11-24'],['t-tar@2026-11-25','tarde','2026-11-25','2026-11-26'],['t-man@2026-11-27','mañana','2026-11-27','2026-11-29']])
  const out=compilarCondiciones({...i,condiciones_supervisor:c}).auditoria!
  const porTurno:Record<string,number[]>={};for(const a of out.aplicadas)(porTurno[String(a.valor)]??=[]).push(...a.dias)
  expect(porTurno).toEqual({mañana:[0,1,4,5,6],tarde:[2,3]})
  // Otra persona o otro tipo de condición no se reemplazan entre sí.
  const otro=resolverConfiguracion([perm,cond('f-p2','p2','2026-11-25','2026-11-25',{tipo:'franco',dia:2})],S,i.semana!).opciones.condiciones_supervisor!
  expect(otro.condiciones.map(x=>x.id)).toEqual(['t-man','f-p2'])
  // Mismo nombre de turno con otra definición en la misma semana: claves de turno separadas (sin conflicto ni pérdida).
  const tempMan=cond('t-man2','p1','2026-11-25','2026-11-25',{tipo:'turno',valor:'mañana',turno:{inicioMin:'08:30',inicioMax:'09:00'}})
  const dos=resolverConfiguracion([perm,tempMan],S,i.semana!).opciones.condiciones_supervisor!
  expect(Object.keys(dos.turnos!).sort()).toEqual(['mañana','mañana (2026-11-25)'])
  expect(compilarCondiciones({...i,condiciones_supervisor:dos}).auditoria!.aplicadas).toHaveLength(3)
 })
 it('regresión punto 3: exclusión permanente con excepción temporal a mitad de semana → conflicto explicado (el motor exige semana completa)',()=>{
  const perm=fila({tipo:'condicion_supervisor',clase:'permanente',colaborador_id:'p1',vigencia_desde:'2026-11-02',datos:{id:'ex',modo:'DEBE',tipo:'exclusion_manual',colaboradorId:'p1'}})
  expect(resolverConfiguracion([perm],S,L).conflictos).toEqual([])
  const r=resolverConfiguracion([perm,cond('ex2','p1','2026-11-25','2026-11-26',{tipo:'exclusion_manual'})],S,L)
  expect(r.conflictos.map(c=>c.detalle).join(' ')).toContain('semana completa')
 })
 it('exclusión manual que no cubre la semana: conflicto propio (el motor la exige completa); las demás reglas siguen',()=>{
  const r=resolverConfiguracion([cond('x',`p1`,'2026-11-25','2026-12-02',{tipo:'exclusion_manual'}),tope('permanente',L,null,12,8)],S,L)
  expect(r.conflictos.map(c=>c.tipo)).toEqual(['condicion_supervisor'])
  expect(tp(r).FULL.horas).toBe(12)
  expect(resolverConfiguracion([cond('x','p1','2026-11-25','2026-12-06',{tipo:'exclusion_manual'})],S,'2026-11-30').conflictos).toEqual([])
 })
 it('validaciones de cada tipo',()=>{
  const v=(d:Record<string,unknown>,persona:string|null='p1')=>()=>validarFila(cond('k',persona,L,'2026-11-29',d))
  expect(v({tipo:'franco'})).toThrow('día');expect(v({tipo:'turno',valor:'t'})).toThrow('turno')
  expect(v({tipo:'max_francos',valor:2})).toThrow('sucursal');expect(v({tipo:'max_francos',valor:2},null)).not.toThrow()
  expect(v({tipo:'exclusion_manual',modo:'PREFERIRIA'})).toThrow('DEBE');expect(v({tipo:'franco_medio_corrido'})).toThrow('PREFERIR')
  expect(v({tipo:'franco',dia:1},null)).toThrow('persona')
 })
})

describe('integridad: cada regla en su alcance',()=>{
 it('una regla inválida o en conflicto se informa sola; el resto se resuelve igual',()=>{
  const mala=fila({tipo:'topes_caja_eventual_contrato',clase:'permanente',vigencia_desde:L,datos:{FULL:{activo:true,horas:null},PART:{activo:false}}})
  const r=resolverConfiguracion([mala,perfil('ev-a','permanente',L,null),apertura('permanente',L,null,[{dia:0,desde:'08:00',hasta:'09:00'}])],S,L)
  expect(r.conflictos).toEqual([expect.objectContaining({tipo:'topes_caja_eventual_contrato',filaIds:[mala.id]})])
  expect(r.opciones.topes_caja_eventual_contrato).toBeUndefined()
  expect(r.opciones.disponibilidad_caja_eventual!.perfiles).toHaveLength(1)
  expect(r.opciones.excepcion_apertura_aux_unico).toBeDefined()
  const dos=[perfil('ev-a','temporal','2026-11-25','2026-11-26'),perfil('ev-a','temporal','2026-11-26','2026-11-27'),perfil('ev-b','permanente',L,null)]
  const r2=resolverConfiguracion(dos,S,L)
  expect(r2.conflictos).toEqual([expect.objectContaining({colaboradorId:'ev-a'})])
  expect(r2.opciones.disponibilidad_caja_eventual!.perfiles.map(p=>p.colaboradorId)).toEqual(['ev-b'])
 })
 it('contrato de origen distinto dentro de la semana: conflicto solo de esa persona',()=>{
  const r=resolverConfiguracion([perfil('ev-a','permanente',L,null),perfil('ev-a','temporal','2026-11-27','2026-11-27',{acreditacion:'TODA_LA_PRESENCIA',contratoOrigen:'PART'}),perfil('ev-b','permanente',L,null)],S,L)
  expect(r.conflictos.map(c=>c.colaboradorId)).toEqual(['ev-a'])
  expect(r.opciones.disponibilidad_caja_eventual!.perfiles.map(p=>p.colaboradorId)).toEqual(['ev-b'])
 })
 it('simulación previa: guardar, cambiar o desactivar no puede crear conflictos con otras reglas',()=>{
  const base=[perfil('ev-a','permanente',L,null),tope('permanente',L,null,12,8)]
  expect(simularCambio(base,{tipo:'desactivar',anterior:base[0]},S)).toEqual([])
  expect(simularCambio(base,{tipo:'crear',fila:{...perfil('ev-a','temporal','2026-12-02','2026-12-03',{acreditacion:'NO_ACREDITADA'})}},S)).toEqual([])
  const parcial=cond('ex','p1','2026-12-02','2026-12-09',{tipo:'exclusion_manual'})
  const c=simularCambio(base,{tipo:'crear',fila:parcial},S)
  expect(c.map(x=>x.detalle.slice(0,21))).toEqual(['Semana del 2026-11-30','Semana del 2026-12-07'])
  expect(semanasAfectadas('2026-12-02','2026-12-09')).toEqual(['2026-11-30','2026-12-07'])
 })
})

describe('escrituras atómicas y concurrencia (cliente)',()=>{
 const cliente=(rpc:(fn:string,args:Record<string,unknown>)=>{data?:unknown;error?:unknown})=>{const llamadas:[string,Record<string,unknown>][]=[];return {llamadas,db:{from:()=>{throw new Error('sin escrituras directas')},rpc:async(fn:string,a:Record<string,unknown>)=>{llamadas.push([fn,a]);return rpc(fn,a)}}}}
 const nueva:NuevaFila={sucursal_id:S,clase:'permanente',tipo:'topes_caja_eventual_contrato',colaborador_id:null,vigencia_desde:'2026-12-14',vigencia_hasta:null,datos:topes(10,6),motivo:'cambio'}
 it('crear, reemplazar y desactivar usan las funciones atómicas con la versión leída',async()=>{
  const ant={...tope('permanente',L,null,12,8),version:3}
  const c=cliente(()=>({data:{id:'n'},error:null}))
  await aplicarCambio(c.db,[ant],{tipo:'reemplazar',anterior:ant,fila:nueva},S)
  await aplicarCambio(c.db,[ant],{tipo:'desactivar',anterior:ant},S)
  await aplicarCambio(c.db,[],{tipo:'crear',fila:nueva},S)
  expect(c.llamadas.map(([fn,a])=>[fn,a.p_id??null,a.p_version??null])).toEqual([['cms_reemplazar',ant.id,3],['cms_desactivar',ant.id,3],['cms_crear',null,null]])
 })
 it('errores de la base → mensajes claros, sin cambios parciales',async()=>{
  const ant=tope('permanente',L,null,12,8)
  for(const [msg,cod] of [['CONFLICTO_CONCURRENTE','CONCURRENCIA'],['conflicting key value violates exclusion constraint "cms_sin_superposicion"','SUPERPOSICION'],['SESION_REQUERIDA','SESION'],['otro','ESCRITURA']] as const){
   const c=cliente(()=>({data:null,error:{message:msg}}))
   await expect(aplicarCambio(c.db,[ant],{tipo:'reemplazar',anterior:ant,fila:nueva},S)).rejects.toMatchObject({codigo:cod})
  }
 })
 it('un cambio que crearía conflictos se rechaza antes de escribir; la importación es todo o nada',async()=>{
  const c=cliente(()=>({data:[],error:null}))
  await expect(aplicarCambio(c.db,[],{tipo:'crear',fila:cond('ex','p1','2026-12-02','2026-12-09',{tipo:'exclusion_manual'})},S)).rejects.toMatchObject({codigo:'CONFLICTO'})
  await expect(importarFilas(c.db,[],[perfil('ev-a','temporal',L,'2026-11-24'),perfil('ev-a','temporal','2026-11-24','2026-11-25')],S)).rejects.toMatchObject({codigo:'CONFLICTO'})
  expect(c.llamadas).toEqual([])
  await importarFilas(c.db,[],[perfil('ev-a','permanente',L,null),tope('permanente',L,null,12,8)],S)
  expect(c.llamadas.map(x=>x[0])).toEqual(['cms_importar'])
 })
 it('lectura acotada por usuario y sucursal; tabla sin migrar → transición',async()=>{
  const q=(resp:unknown)=>{const l:string[]=[];const o:any={select:()=>o,eq:(c:string,v:string)=>(l.push(`${c}=${v}`),o),order:async()=>resp};return {l,db:{from:()=>o}}}
  expect(await cargarConfiguracionMotor(q({data:null,error:{code:'42P01'}}).db,'u','091')).toEqual({disponible:false,filas:[]})
  const x=q({data:[],error:null});await cargarConfiguracionMotor(x.db,'u','091');expect(x.l).toEqual(['local_id=u','sucursal_id=091'])
  await expect(cargarConfiguracionMotor(q({data:[{local_id:'otro',sucursal_id:'091'}],error:null}).db,'u','091')).rejects.toThrow('ámbito')
 })
})

describe('importación de la configuración actual',()=>{
 const servicio:OpcionesGeneracion={
  disponibilidad_caja_eventual:{version:1,perfiles:[
   {colaboradorId:'ev-a',sucursalId:S,vigenciaDesde:L,vigenciaHasta:'2026-11-29',acreditacion:'PRESENCIA_MENOS_RESERVAS',fuente:'ratificación',contratoOrigen:'FULL',horasContractuales:48,reservas:[{dias:[0,1,2,3,4,5],desde:'09:00',hasta:'11:00'}]},
   {colaboradorId:'ev-b',sucursalId:S,vigenciaDesde:L,vigenciaHasta:'2026-11-29',acreditacion:'TODA_LA_PRESENCIA',fuente:'ratificación',contratoOrigen:'PART',horasContractuales:30}]},
  topes_caja_eventual_contrato:{version:1,configuraciones:[{sucursalId:S,vigenciaDesde:L,vigenciaHasta:'2026-11-29',fuente:'MASTER',FULL:{activo:true,horas:12},PART:{activo:true,horas:8}}]},
  condiciones_supervisor:{version:1,sucursal_id:S,semana:L,condiciones:[{id:'ex-1',modo:'DEBE',tipo:'exclusion_manual',colaboradorId:'p-full',desde:L,hasta:'2026-11-29'},{id:'t-1',modo:'PREFERIRIA',tipo:'turno',valor:'tarde',colaboradorId:'p-part',desde:L,hasta:'2026-11-29'}],
   turnos:{tarde:{inicioMin:'16:00',inicioMax:'18:00'}}},
  excepcion_apertura_aux_unico:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2)),
 }
 const importadas=()=>proponerImportacion(servicio,S).map(x=>({...x,id:`i${++n}`,activa:true}) as FilaConfigMotor)
 it('propone permanentes (perfiles, topes, apertura en franjas) y temporales (condiciones con su turno)',()=>{
  const p=proponerImportacion(servicio,S)
  expect(p.map(x=>[x.tipo,x.clase])).toEqual([['perfil_caja_eventual','permanente'],['perfil_caja_eventual','permanente'],['topes_caja_eventual_contrato','permanente'],
   ['excepcion_apertura_aux_unico','permanente'],['condicion_supervisor','temporal'],['condicion_supervisor','temporal']])
  expect((p[3].datos as {franjas:unknown[]}).franjas).toHaveLength(7)
  expect(p[5].datos).toMatchObject({turno:{inicioMin:'16:00',inicioMax:'18:00'}})
  expect(proponerImportacion(servicio,'otra')).toEqual([])
 })
 it('la semana importada reproduce la configuración; la siguiente conserva permanentes sin las temporales',()=>{
  const s1=resolverConfiguracion(importadas(),S,L)
  expect(s1.conflictos).toEqual([])
  expect(s1.opciones.excepcion_apertura_aux_unico).toEqual(servicio.excepcion_apertura_aux_unico)
  expect(s1.opciones.condiciones_supervisor).toEqual(servicio.condiciones_supervisor)
  expect(s1.opciones.disponibilidad_caja_eventual!.perfiles.map(p=>({...p,fuente:''}))).toEqual(servicio.disponibilidad_caja_eventual!.perfiles.map(p=>({...p,fuente:''})))
  const s2=resolverConfiguracion(importadas(),S,'2026-11-30').opciones
  expect(s2.condiciones_supervisor).toBeUndefined()
  expect(validarTopesContrato(s2.topes_caja_eventual_contrato).configuraciones[0]).toMatchObject({vigenciaDesde:'2026-11-30',FULL:{horas:12}})
 })
})

describe('formularios del editor → reglas válidas',()=>{
 const base={clase:'permanente' as const,desde:L,hasta:'',motivo:'',fullActivo:true,fullHoras:'12',partActivo:false,partHoras:'8',persona:'ev-a',acreditacion:'PRESENCIA_MENOS_RESERVAS',contratoOrigen:'FULL',maxCaja:'',funcionMin:'4',horasContrato:'48',
  reservas:[{dias:[1,0],desde:'09:00',hasta:'11:00'}],franjas:[{dia:0,desde:'08:00',hasta:'09:00'}],modo:'DEBE' as const,condicion:'franco' as const,dia:'2',turnoNombre:'mañana',inicioMin:'09:00',inicioMax:'10:00',finMax:'16:00',maxFrancos:'2',condicionId:''}
 it.each(['topes_caja_eventual_contrato','perfil_caja_eventual','excepcion_apertura_aux_unico','condicion_supervisor'] as const)('%s',tipo=>{
  const f=filaDesdeFormulario({...base,tipo},S)
  expect(validarFila(f)).toBeTruthy()
  if(tipo==='perfil_caja_eventual')expect(f.datos).toMatchObject({reservas:[{dias:[0,1]}],horasFuncionHabitualMinimas:4,horasContractuales:48})
 })
 it.each(['turno','max_francos','exclusion_manual'] as const)('condición %s',c=>{
  const f=filaDesdeFormulario({...base,tipo:'condicion_supervisor',condicion:c,persona:c==='max_francos'?'':'p1',clase:'temporal',hasta:'2026-11-29'},S)
  expect(validarFila(f)).toBeTruthy()
 })
})

describe('precedencia en el flujo integrado',()=>{
 beforeEach(()=>{vi.resetModules();vi.unstubAllGlobals();vi.unstubAllEnvs()})
 async function flujo(filas:FilaConfigMotor[]|'sin-tabla'){
  vi.resetModules();vi.stubEnv('VITE_AH2_HIBRIDO_091','true');vi.stubEnv('VITE_AH2_OPTIMIZER_URL','https://servicio.example')
  const user={id:'u1',is_anonymous:false}
  const q:any={select:()=>q,eq:()=>q,order:()=>Promise.resolve(filas==='sin-tabla'?{data:null,error:{code:'PGRST205'}}:{data:filas.map(f=>({...f,local_id:'u1',sucursal_id:'091'})),error:null})}
  vi.doMock('../../lib/supabase',()=>({supabase:{auth:{getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session:{user,access_token:'jwt'}}})},from:()=>q}}))
  vi.doMock('../../utils/sucursal',()=>({getSucursalActual:()=>'091'}))
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({usuario:'u1',sucursal:'091',configuracion:{topes_caja_eventual_contrato:{version:1,configuraciones:[{sucursalId:'091',vigenciaDesde:L,fuente:'servicio',FULL:{activo:true,horas:99},PART:{activo:false}}]}}}),{status:200}))
  const {configuracionAutenticada}=await import('../integracion')
  return configuracionAutenticada('091',undefined,undefined,'2026-11-30')
 }
 it('sin filas guardadas (o sin tabla) rige la configuración del servicio',async()=>{
  for(const caso of [[],'sin-tabla'] as const){const r=await flujo(caso as never);expect(r.fuente).toBe('servicio');expect(r.opciones.topes_caja_eventual_contrato!.configuraciones[0].FULL.horas).toBe(99)}
 })
 it('regresión punto 2: después de importar, desactivar todo NO vuelve a Secret Manager',async()=>{
  const r=await flujo([{...tope('permanente',L,null,12,8),sucursal_id:'091',activa:false,desactivada_en:'2026-11-21T00:00:00Z'}])
  expect(r.fuente).toBe('persistida')
  expect(r.opciones).toEqual({}) // sin reglas vigentes: nada del servicio (99 h) se cuela
  expect(r.opcionesServicio.topes_caja_eventual_contrato!.configuraciones[0].FULL.horas).toBe(99)
 })
 it('con filas guardadas son la única fuente, por fecha; un conflicto bloquea solo la generación híbrida con su detalle',async()=>{
  const r=await flujo([{...tope('permanente',L,null,12,8),sucursal_id:'091'}])
  expect(r.fuente).toBe('persistida');expect(tp({opciones:r.opciones} as never)).toMatchObject({sucursalId:'091',vigenciaDesde:'2026-11-30',FULL:{horas:12}})
  await expect(flujo([{...cond('ex','p1','2026-12-02','2026-12-09',{tipo:'exclusion_manual'}),sucursal_id:'091'}])).rejects.toThrow('semana completa')
 })
})

it('ErrorConfigMotor conserva el código',()=>{expect(new ErrorConfigMotor('X','y').codigo).toBe('X')})
