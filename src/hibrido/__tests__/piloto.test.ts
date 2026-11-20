import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
const mock=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn()}))
vi.mock('../../lib/supabase',()=>({supabase:{auth:{getUser:mock.getUser},from:mock.from}}))
import {cargarDatosPiloto} from '../pilotoDatos'
import {transporteHttpPiloto} from '../transporteHttpPiloto'
import type {SobreSolicitud} from '../contrato'

beforeEach(()=>{vi.clearAllMocks();mock.getUser.mockResolvedValue({data:{user:{id:'allowed',is_anonymous:false}}})})
afterEach(()=>vi.unstubAllGlobals())

describe('piloto privado: solo lectura y sesión verificada',()=>{
 it.each([null,{id:'other',is_anonymous:false},{id:'allowed',is_anonymous:true}])('rechaza identidad no autorizada antes de consultar datos',async user=>{
  mock.getUser.mockResolvedValue({data:{user}})
  await expect(cargarDatosPiloto('allowed','synthetic')).rejects.toThrow('acceso')
  expect(mock.from).not.toHaveBeenCalled()
 })
 it('restringe ambas lecturas a usuario y sucursal, sin fallback ante errores',async()=>{
  const eq=vi.fn().mockReturnThis(),q={select:vi.fn().mockReturnThis(),eq,order:vi.fn().mockResolvedValue({data:[],error:null})}
  mock.from.mockReturnValue(q)
  expect(await cargarDatosPiloto('allowed','synthetic')).toMatchObject({cajeros:[],auxiliares:[],eventuales:[],reglas:[]})
  expect(mock.from.mock.calls.map(c=>c[0])).toEqual(['colaboradores','reglas_configurables'])
  expect(eq).toHaveBeenCalledWith('local_id','allowed');expect(eq).toHaveBeenCalledWith('sucursal_id','synthetic')
  q.order.mockResolvedValue({data:[],error:{message:'offline'}} as never)
  await expect(cargarDatosPiloto('allowed','synthetic')).rejects.toThrow('No se usa una copia local')
 })
 it('rechaza filas de otra sucursal incluso si la consulta las devuelve',async()=>{
  const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockResolvedValue({data:[{local_id:'allowed',sucursal_id:'other'}],error:null})};mock.from.mockReturnValue(q)
  await expect(cargarDatosPiloto('allowed','synthetic')).rejects.toThrow('fuera del ámbito')
 })
})

describe('transporte privado autenticado',()=>{
 it('envía el JWT, transmite progreso y conserva la respuesta final sin salto de línea',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response('{"tipo":"progreso","objetivo":"faltantes","estado":"OPTIMAL","segundos":1}\n{"tipo":"respuesta","respuesta":{"plan":null}}',{status:200}));vi.stubGlobal('fetch',fetch)
  const onProgreso=vi.fn(),transport=transporteHttpPiloto('https://synthetic.example',async()=>'session-token')
  expect(await transport({} as SobreSolicitud,{onProgreso})).toEqual({plan:null})
  expect(fetch.mock.calls[0][0]).toBe('https://synthetic.example/v1/optimizar')
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token')
  expect(onProgreso).toHaveBeenCalledWith({objetivo:'faltantes',estado:'OPTIMAL',segundos:1})
 })
 it('rechaza HTTP sin cifrar y sesiones ausentes',async()=>{
  expect(()=>transporteHttpPiloto('http://synthetic.example',async()=>'' )).toThrow('HTTPS')
  await expect(transporteHttpPiloto('https://synthetic.example',async()=>'' )({} as SobreSolicitud)).rejects.toThrow('sesión')
 })
})
