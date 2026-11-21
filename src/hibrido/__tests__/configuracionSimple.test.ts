import {describe,expect,it} from 'vitest'
import {resolverConfiguracion,simularCambio,validarFila,type FilaConfigMotor} from '../configuracionPersistente'
import {cambioPermanente,datosPerfil,datosTopes,ddmm,filaArmarAMano,leerTopes,normalizarFranjas,permanenteVigente,proximoLunesISO,temporalesVigentes} from '../configuracionSimple'

const S='091',L='2026-11-23',P='2026-11-30'
const fila=(p:Partial<FilaConfigMotor>&Pick<FilaConfigMotor,'tipo'|'datos'>):FilaConfigMotor=>({id:crypto.randomUUID(),sucursal_id:S,clase:'permanente',colaborador_id:null,vigencia_desde:L,vigencia_hasta:null,activa:true,motivo:'',version:1,...p})
const topes=fila({tipo:'topes_caja_eventual_contrato',datos:{FULL:{activo:true,horas:12},PART:{activo:true,horas:8}}})
const ev='00000000-0000-4000-8000-000000000001'
const perfil=fila({tipo:'perfil_caja_eventual',colaborador_id:ev,datos:{acreditacion:'TODA_LA_PRESENCIA',contratoOrigen:'FULL',horasContractuales:48}})
const apertura=fila({tipo:'excepcion_apertura_aux_unico',datos:{franjas:[0,1,2,3,4,5,6].map(dia=>({dia,desde:'08:00',hasta:'09:00'}))}})
const base=[topes,perfil,apertura]

describe('configuración simple del supervisor (AH2-044 sobre AH2-042)',()=>{
 it('el próximo lunes y la regla vigente',()=>{
  expect(proximoLunesISO(new Date(2026,10,21))).toBe(L)
  expect(proximoLunesISO(new Date(2026,10,23))).toBe(P)
  expect(permanenteVigente(base,'topes_caja_eventual_contrato',P)?.id).toBe(topes.id)
  expect(leerTopes(topes)).toEqual({FULL:{activo:true,horas:12},PART:{activo:true,horas:8}})
  expect(ddmm(P)).toBe('30/11')
 })
 it('cambiar los máximos reemplaza la regla vigente desde el próximo lunes, sin conflictos y por semana completa',()=>{
  const c=cambioPermanente(base,'topes_caja_eventual_contrato',datosTopes({activo:true,horas:14},{activo:false,horas:null}),S,P)
  expect(c).toMatchObject({tipo:'reemplazar',anterior:{id:topes.id},fila:{vigencia_desde:P,vigencia_hasta:null,datos:{FULL:{activo:true,horas:14},PART:{activo:false,horas:null}}}})
  expect(()=>validarFila((c as unknown as {fila:never}).fila)).not.toThrow()
  expect(simularCambio(base,c,S)).toEqual([])
  // Simulación del resultado: la semana del 23/11 conserva 12 h; desde el 30/11 rige 14 h y PART sin máximo.
  const despues=[{...topes,vigencia_hasta:'2026-11-29'},{...(c as unknown as {fila:FilaConfigMotor}).fila,id:'n',activa:true}] as FilaConfigMotor[]
  const tp=(sem:string)=>resolverConfiguracion([...despues,perfil,apertura],S,sem).opciones.topes_caja_eventual_contrato!.configuraciones[0]
  expect(tp(L).FULL).toMatchObject({activo:true,horas:12})
  expect(tp(P)).toMatchObject({FULL:{activo:true,horas:14},PART:{activo:false}})
 })
 it('sin regla previa crea una nueva',()=>{
  expect(cambioPermanente([],'topes_caja_eventual_contrato',datosTopes({activo:true,horas:10},{activo:true,horas:6}),S,P).tipo).toBe('crear')
 })
 it('franjas en que un supervisor solo puede atender caja: valida y ordena',()=>{
  expect(normalizarFranjas([{dia:3,desde:'21:30',hasta:'22:00'},{dia:0,desde:'08:00',hasta:'09:00'}])).toEqual({ok:true,franjas:[{dia:0,desde:'08:00',hasta:'09:00'},{dia:3,desde:'21:30',hasta:'22:00'}]})
  expect(normalizarFranjas([{dia:0,desde:'09:00',hasta:'09:00'}]).ok).toBe(false)
  const c=cambioPermanente(base,'excepcion_apertura_aux_unico',{franjas:[{dia:0,desde:'08:00',hasta:'09:00'},{dia:6,desde:'21:30',hasta:'22:00'}]},S,P)
  expect(simularCambio(base,c,S)).toEqual([])
 })
 it('disponibilidad de caja de un eventual: cambia solo eso y conserva contrato y horas',()=>{
  expect(datosPerfil(perfil.datos,'NO_ACREDITADA','PART')).toEqual({acreditacion:'NO_ACREDITADA',contratoOrigen:'FULL',horasContractuales:48,fuente:'Configuración del supervisor'})
  expect(datosPerfil({acreditacion:'PRESENCIA_MENOS_RESERVAS',reservas:[{dias:[0],desde:'08:00',hasta:'10:00'}],horasFuncionHabitualMinimas:4},'TODA_LA_PRESENCIA','FULL')).not.toHaveProperty('reservas')
  const c=cambioPermanente(base,'perfil_caja_eventual',datosPerfil(perfil.datos,'NO_ACREDITADA','FULL'),S,P,ev)
  expect(c).toMatchObject({tipo:'reemplazar',anterior:{id:perfil.id}})
  expect(simularCambio(base,c,S)).toEqual([])
 })
 it('«lo armo yo» por semanas completas: excepción temporal válida, que vence sola',()=>{
  const p='00000000-0000-4000-8000-000000000002'
  const f=filaArmarAMano(S,p,P,2)
  expect(f).toMatchObject({clase:'temporal',vigencia_desde:P,vigencia_hasta:'2026-12-13',datos:{tipo:'exclusion_manual',modo:'DEBE',colaboradorId:p}})
  expect(()=>validarFila(f)).not.toThrow()
  expect(simularCambio(base,{tipo:'crear',fila:f},S)).toEqual([])
  const conIt=[...base,{...f,id:'t',activa:true}] as FilaConfigMotor[]
  expect(temporalesVigentes(conIt,'2026-12-01').map(x=>x.id)).toEqual(['t'])
  expect(temporalesVigentes(conIt,'2026-12-14')).toEqual([])
 })
})
