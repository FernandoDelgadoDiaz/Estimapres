import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest'
const auth=vi.hoisted(()=>({getUser:vi.fn(),getSession:vi.fn(),from:vi.fn()}))
vi.mock('../../lib/supabase',()=>({supabase:{auth,from:auth.from}}))
import {configuracionAutenticada,opcionesIntegradas,usaHibrido,verificarDatosActuales} from '../integracion'
import {generarSemanaIntegrada} from '../generacionIntegrada'
import {validarResultadoSemana} from '../../utils/validacionSemana'
import {semanaAFila,filaASemana} from '../../utils/almacen'
import {generarPDF} from '../../utils/exportPDF'
import type {InputAlgoritmo} from '../../algoritmo/types'
import type {ResultadoAsignacion,SemanaHistorial} from '../../types'
import casos from '../../algoritmo/__tests__/fixtures/ah2040SemanalCasos.json'
import resultados from '../../algoritmo/__tests__/fixtures/ah2040SemanalResultadosB.json'
const cfg={habilitado:true,servicio:'https://optimizer.example'}
const user={id:'owner-synthetic',is_anonymous:false}
afterEach(()=>vi.unstubAllGlobals())

describe('activación acotada y sesión de la app existente',()=>{
 it('solo 091 con HTTPS y flag; rollback y otras sucursales no acceden al híbrido',()=>{
  expect(usaHibrido('091',false,cfg)).toBe(true)
  for(const [s,a,c] of [['092',false,cfg],['091',true,cfg],['091',false,{...cfg,habilitado:false}],['091',false,{...cfg,servicio:'http://inseguro'}]] as const)expect(usaHibrido(s,a,c)).toBe(false)
 })
 it('reutiliza Auth y exige la misma cuenta/sucursal verificada, sin enviar dotación al cargar config',async()=>{
  auth.getUser.mockResolvedValue({data:{user},error:null});auth.getSession.mockResolvedValue({data:{session:{user,access_token:'synthetic-token'}}})
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({usuario:user.id,sucursal:'091',configuracion:{maxFrancosDia:99,topes_caja_eventual_contrato:{version:1,configuraciones:[]}}})))
  vi.stubGlobal('fetch',fetch)
  // Sin configuración guardada en la sucursal (AH2-042): rige la del servicio.
  auth.from.mockReturnValue({select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockResolvedValue({data:[],error:null})})
  const s=await configuracionAutenticada('091',undefined,cfg)
  expect(s.opciones).toEqual({topes_caja_eventual_contrato:{version:1,configuraciones:[]}})
  expect(s.fuente).toBe('servicio')
  expect(fetch.mock.calls[0][1].body).toBeUndefined()
  fetch.mockResolvedValue(new Response(JSON.stringify({usuario:'otra',sucursal:'091',configuracion:{}})))
  await expect(configuracionAutenticada('091',undefined,cfg)).rejects.toThrow('cuenta y sucursal')
  auth.getUser.mockResolvedValue({data:{user:{...user,is_anonymous:true}}})
  await expect(configuracionAutenticada('091',undefined,cfg)).rejects.toThrow('sesión')
 })
 it('relee Supabase y rechaza una copia anterior antes de optimizar',async()=>{
  auth.getUser.mockResolvedValue({data:{user},error:null})
  const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockResolvedValue({data:[],error:null})};auth.from.mockReturnValue(q)
  const base={cajeros:[],auxiliares:[],eventuales:[],reglas:[]}
  await expect(verificarDatosActuales(user.id,'091',base)).resolves.toBeUndefined()
  await expect(verificarDatosActuales(user.id,'091',{...base,cajeros:[{id:'previo',nombre:'Ficha anterior',tipo:'PART',activo:true,horasSemanales:32}]})).rejects.toThrow('cambiaron')
 })
 it('conserva las reglas de pantalla y edita topes sin universalizarlos',()=>{
  const op=opcionesIntegradas({maxFrancosDia:2},{},'091','2026-11-23',{FULL:{activo:true,horas:12},PART:{activo:false,horas:8}})
  expect(op.maxFrancosDia).toBe(2)
  expect(op.topes_caja_eventual_contrato?.configuraciones[0]).toMatchObject({sucursalId:'091',FULL:{activo:true,horas:12},PART:{activo:false,horas:8}})
  expect(()=>opcionesIntegradas({}, {},'092','2026-11-23')).toThrow('091')
 })
})

describe('misma pantalla → contrato HTTP → resultado → historial/edición → PDF',()=>{
 let generado:ResultadoAsignacion
 const input=structuredClone((casos as unknown as {nombre:string;data:{input:InputAlgoritmo}}[]).find(x=>x.nombre.startsWith('S5'))!.data.input)
 input.disponibilidad_caja_eventual={version:1,perfiles:Object.keys(input.disponibilidad_eventual).map(id=>({colaboradorId:id,sucursalId:'091',vigenciaDesde:'2026-11-23',vigenciaHasta:null,acreditacion:'TODA_LA_PRESENCIA',fuente:'fixture validado'}))}
 Object.assign(input,{sucursal_id:'091',semana:'2026-11-23',politica_recursos_version:1,comparacion_aux_eventual:{modo:'DIAS',pares:[]},
  inicio_minimo_lunes_por_colaborador:Object.fromEntries(input.colaboradores.filter(p=>['FULL','PART'].includes(p.rol)).map(p=>[p.id,0]))})
 const cajeros=input.colaboradores.filter(c=>c.rol==='PART'||c.rol==='FULL').map(c=>({id:c.id,nombre:c.id,tipo:c.rol as 'PART'|'FULL',horasSemanales:c.horasSemanales,activo:true}))
 const aux=Object.keys(input.presencia_aux).map(id=>({id,nombre:id,horarioSemanal:Array(7).fill('09:00-22:00'),activo:true}))
 const ev=Object.keys(input.disponibilidad_eventual).map(id=>({id,nombre:id,horarioSemanal:Array(7).fill('09:00-22:00'),sector:'sintético',activo:true}))
 const ctx={necesidad:[],excepciones:[]}
 const entrada={input,cajeros,auxiliares:aux,eventuales:ev,contexto:ctx}
 beforeAll(async()=>{
  // Reutiliza un plan CP-SAT previamente validado: no repite optimización matemática.
  const plan=(resultados as any[]).find(x=>x.caso.startsWith('S5')&&x.modo==='SEMANAL').plan
  vi.stubGlobal('fetch',vi.fn(async(_url,op)=>{const s=JSON.parse(op.body);return new Response(JSON.stringify({tipo:'respuesta',respuesta:{version:s.version,idSolicitud:s.id,hashEntrada:s.hashEntrada,estado:'FEASIBLE',plan,fases:[],lexCompleto:false,segundos:1,incidencias:[],conflictos:[],publicable:false,motor:'B-CP-SAT'}}))}))
  generado=await generarSemanaIntegrada({entrada,servicio:cfg.servicio,token:'synthetic-token'})
  vi.unstubAllGlobals()
 })
 it('conserva identidad y reglas en el resultado habitual, sin credenciales en el snapshot',()=>{
  expect(generado.hibrido).toMatchObject({algoritmo:'ah2-hibrido-091-v1',entrada:{sucursal_id:'091',equilibrio_semanal_version:1}})
  expect(JSON.stringify(generado)).not.toContain('synthetic-token')
  expect(generado.horarios.map(h=>h.colaboradorId).sort()).toEqual([...cajeros,...aux,...ev].map(p=>p.id).sort())
  expect(validarResultadoSemana(generado,cajeros,aux,ev,ctx)).toMatchObject({publicable:true,violaciones:[]})
 })
 it('relee una edición inválida en vez de conservar la validación de generación',()=>{
  const r=structuredClone(generado),h=r.horarios.find(h=>h.rolGeneral==='cajero')!
  h.jornadas[0].esFranco=false;h.jornadas[0].turnos=[{inicio:'08:00',fin:'23:00'}]
  expect(validarResultadoSemana(r,cajeros,aux,ev,ctx).publicable).toBe(false)
  expect(validarResultadoSemana(generado,cajeros,aux,ev,{...ctx,limitaciones:['Sin domingo confirmado.']})).toMatchObject({publicable:false})
  const min=structuredClone(generado);min.hibrido!.minimosCajeros=[{dia:0,slotDesde:2,slotHasta:3,cantidad:99}]
  expect(validarResultadoSemana(min,cajeros,aux,ev,ctx).violaciones.map(v=>v.codigo)).toContain('OP_MIN_CAJEROS')
 })
 it('preserva el snapshot en el jsonb existente y exporta el PDF habitual sin migración',()=>{
  const s={id:'week-synthetic',fechaLunes:'2026-11-23',version:1,descripcion:'Integración sintética',generadoEl:'2026-11-20T16:00:00Z',editadoManualmente:false,resumenPorColaborador:{},horarios:generado.horarios,hibrido:generado.hibrido,cajaAux:generado.cajaAux,cajaEventual:generado.cajaEventual} as SemanaHistorial
  const fila=semanaAFila(s),vuelta=filaASemana({...fila,created_at:s.generadoEl} as Parameters<typeof filaASemana>[0])
  expect(vuelta.hibrido).toEqual(generado.hibrido)
  const pdf=generarPDF(generado,cajeros,s.descripcion,aux,ev,{sucursal:'091',validacion:validarResultadoSemana(generado,cajeros,aux,ev,ctx)})
  expect(pdf.output().startsWith('%PDF-')).toBe(true)
 })
 it('un fallo HTTPS conserva A válido y nunca lo presenta como B ejecutado',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')))
  const r=await generarSemanaIntegrada({entrada,servicio:cfg.servicio,token:'synthetic-token'})
  expect(r.hibrido).toMatchObject({origen:'A',estadoB:'ERROR_TRANSPORTE'})
  expect(r.alertas.join(' ')).toContain('respaldo')
 })
 it('una cancelación no produce un resultado tardío',async()=>{
  const ctrl=new AbortController();ctrl.abort()
  await expect(generarSemanaIntegrada({entrada,servicio:cfg.servicio,token:'synthetic-token'},undefined,ctrl.signal)).rejects.toMatchObject({name:'AbortError'})
 })
})
