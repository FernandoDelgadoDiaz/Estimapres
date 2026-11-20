/**
 * Topes semanales de caja EVENTUAL por sucursal y contrato de origen (AH2-037/040, decisión 20/11/2026), motor A.
 * Mismos escenarios y compilación esperada que aliada-optimizer `optimizer/topes_contrato_lab.py` (fixture compartido).
 * Datos sintéticos.
 */
import {describe,expect,it} from 'vitest'
import casos from './fixtures/topesContratoCasos.json'
import type {InputAlgoritmo} from '../types'
import {compilarDisponibilidadCaja,validarTopesContrato,verificarDisponibilidadCaja} from '../disponibilidadCajaEventual'
import {aEntradaB} from '../../hibrido/contrato'
import {ejecutarAH2040} from '../ah2040'

type Caso={nombre:string;data:{input:InputAlgoritmo};esperado:{topes:Record<string,number>;origenTope:Record<string,string[]>;diagnosticos:[string,string,boolean][]}}
const CASOS=casos as unknown as Caso[]
const de=(n:string)=>structuredClone(CASOS.find(c=>c.nombre===n)!.data.input)
const conf=(full:[boolean,number|null]=[true,12],part:[boolean,number|null]=[true,8],extra:Record<string,unknown>={})=>({sucursalId:'synthetic',vigenciaDesde:'2026-11-01',vigenciaHasta:null,fuente:'configuración sintética',
 FULL:{activo:full[0],horas:full[1]},PART:{activo:part[0],horas:part[1]},...extra})

describe('topes de caja EVENTUAL por contrato de origen · A idéntico a B',()=>{
 for(const c of CASOS)it(`escenario ${c.nombre}`,()=>{
  const {input,info}=compilarDisponibilidadCaja(structuredClone(c.data.input))
  expect(Object.fromEntries(Object.entries(input.max_caja_eventual_slots??{}).sort())).toEqual(c.esperado.topes)
  expect(Object.fromEntries(Object.entries(info!.eventuales).map(([k,v])=>[k,v.origenTope]).sort())).toEqual(c.esperado.origenTope)
  expect(info!.diagnosticos.map(d=>[d.colaboradorId,d.codigo,d.bloqueaPublicacion]).sort()).toEqual(c.esperado.diagnosticos)
 })
})

describe('topes por contrato: forma, transporte y cumplimiento',()=>{
 it('rechaza configuraciones inválidas o superpuestas y contrato de origen inválido',()=>{
  const malos=[{version:2,configuraciones:[]},{version:1,configuraciones:[conf([true,null])]},{version:1,configuraciones:[conf([true,12.25])]},
   {version:1,configuraciones:[conf(undefined,undefined,{fuente:' '})]},{version:1,configuraciones:[{...conf(),PART:{activo:'si',horas:8}}]},{version:1,configuraciones:[conf(),conf([true,10])]}]
  for(const m of malos)expect(()=>{const i=de('activos-12-8');i.topes_caja_eventual_contrato=m as never;compilarDisponibilidadCaja(i)}).toThrow()
  const i=de('activos-12-8');(i.disponibilidad_caja_eventual!.perfiles[0] as {contratoOrigen:string}).contratoOrigen='AUX'
  expect(()=>compilarDisponibilidadCaja(i)).toThrow('contrato de origen')
  expect(validarTopesContrato({version:1,configuraciones:[conf([false,null],[false,8])]}).configuraciones).toHaveLength(1)
 })
 it('sin perfiles la configuración solo se valida (sin efecto ni default)',()=>{
  const i=de('activos-12-8');delete i.disponibilidad_caja_eventual
  expect(compilarDisponibilidadCaja(i).info).toBeNull()
 })
 it('el contrato A→B transporta la configuración y el contrato de origen sin pérdida',()=>{
  const i=de('activos-12-8')
  const {entrada,noTransportables}=aEntradaB(i,'synthetic')
  expect(noTransportables).toEqual([])
  expect(entrada.input.topes_caja_eventual_contrato).toEqual(i.topes_caja_eventual_contrato)
  expect((entrada.input.disponibilidad_caja_eventual as {perfiles:{contratoOrigen?:string}[]}).perfiles.some(p=>p.contratoOrigen==='FULL')).toBe(true)
 })
 it('A respeta los topes de clase y el verificador detecta el exceso',()=>{
  const i=de('activos-12-8');i.topes_caja_eventual_contrato={version:1,configuraciones:[conf([true,2],[true,1])]} as never
  const r=ejecutarAH2040(compilarDisponibilidadCaja(i).input,{modo:'DIAS',pares:[]}).resultado
  const caja=(id:string)=>r.asignacion_eventual[id].flat().filter(v=>v==='CAJA').length
  expect(caja('ev-1')).toBeLessThanOrEqual(2);expect(caja('ev-2')).toBeLessThanOrEqual(4);expect(caja('ev-3')).toBeLessThanOrEqual(4)
  expect(verificarDisponibilidadCaja(i,r)).toEqual([])
  const exceso=structuredClone(r);exceso.asignacion_eventual['ev-2']=exceso.asignacion_eventual['ev-2'].map(row=>row.map(v=>v==='NO_DISPONIBLE'?v:'CAJA'))
  expect(verificarDisponibilidadCaja(i,exceso).some(x=>x.codigo==='EV_CAJA_SUPERA_TOPE'&&x.colaboradorId==='ev-2')).toBe(true)
 })
})
