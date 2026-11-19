import {describe,it,expect} from 'vitest'
import {ejecutarPasada2} from '../pasada2-auxiliares'
import {ejecutarPasada3} from '../pasada3-eventuales'
import {ejecutarPasada1} from '../pasada1-fullpart'
import {convertirInputAV2,convertirOutputDeV2} from '../adapter'
import {ejecutarAlgoritmo} from '../orquestador'
import {validarResultadoSemana} from '../../utils/validacionSemana'
import type {InputAlgoritmo} from '../types'

export function entradaRecursos():InputAlgoritmo {
 return {politica_recursos_version:1,supervision_apertura_externa:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2)),
  demanda:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2?1:s===14||s===15?2:0)),
  colaboradores:[{id:'a',nombre:'a',rol:'AUX'},{id:'b',nombre:'b',rol:'AUX'},{id:'e',nombre:'e',rol:'EVENTUAL'}],
  presencia_aux:{a:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<16?'PARADO':'NO_PRESENTE')),b:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s>=14&&s<28?'PARADO':'NO_PRESENTE'))},
  disponibilidad_eventual:{e:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s===14||s===15?'NO_USADO':'NO_DISPONIBLE'))},max_caja_eventual_slots:{e:4},max_bloques_caja_eventual_dia:2,eventuales_caja_hora_limite:'22:00'}
}
const apoyo=(i:InputAlgoritmo)=>{const p2=ejecutarPasada2(i,ejecutarPasada1(i));return {p2,p3:ejecutarPasada3(i,p2)}}
describe('AH2-036/037 recursos',()=>{
 it('doble AUX: uno de pie, el otro antes de eventual; capacidad sin tope AUX',()=>{
  const i=entradaRecursos(),prev=structuredClone(i),{p2,p3}=apoyo(i)
  expect(p2.violaciones_input).toEqual([])
  for(let d=0;d<7;d++) for(const s of [14,15]){
   expect(Object.values(p2.asignacion_aux).filter(m=>m[d][s]==='CAJA')).toHaveLength(1)
   expect(Object.values(p2.asignacion_aux).filter(m=>m[d][s]==='PARADO')).toHaveLength(1)
  }
  expect(p3.horas_caja_por_eventual.e).toBe(2)
  expect(p3.deficit_3.flat().reduce((a,b)=>a+b)/2).toBe(5)
  expect(i).toEqual(prev)
 })
 it('sin déficit no asigna apoyo a caja',()=>{
  const i=entradaRecursos();i.demanda=i.demanda.map(r=>r.map(()=>0));const {p2,p3}=apoyo(i)
  expect(Object.values(p2.asignacion_aux).flat(2)).not.toContain('CAJA')
  expect(p3.horas_caja_por_eventual.e).toBe(0)
 })
 it('no autoriza al AUX único a ejercer simultáneamente supervisión y caja',()=>{
  const i=entradaRecursos();delete i.supervision_apertura_externa;const {p2}=apoyo(i)
  expect(p2.violaciones_input.some(v=>v.regla==='POLITICA-APERTURA-SUPERVISION')).toBe(true)
  expect(p2.asignacion_aux.a[0][0]).toBe('PARADO')
 })
 it('tope cero, tope ausente y reservas sectoriales, sin default doce horas',()=>{
  const i=entradaRecursos();i.max_caja_eventual_slots={e:0};expect(apoyo(i).p3.horas_caja_por_eventual.e).toBe(0)
  delete i.max_caja_eventual_slots;expect(apoyo(i).p2.violaciones_input.some(v=>v.regla==='POLITICA-EV-COMPARACION-PENDIENTE')).toBe(true)
  i.max_caja_eventual_slots={e:14};i.reservas_sector_eventual={e:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s===14))}
  expect(apoyo(i).p3.horas_caja_por_eventual.e).toBe(3.5)
 })
 it('tres AUX exige generalización aprobada, no la inventa',()=>{
  const i=entradaRecursos();i.presencia_aux.c=structuredClone(i.presencia_aux.a);i.colaboradores.push({id:'c',nombre:'c',rol:'AUX'});
  expect(apoyo(i).p2.violaciones_input.some(v=>v.regla==='POLITICA-AUX-MULTIPLE')).toBe(true)
 })
 it('validador UI rechaza eventual cuando un AUX puede cubrir la misma franja',()=>{
  const i=entradaRecursos();const aux=[{id:'a',nombre:'a',activo:true,horarioSemanal:Array(7).fill('08:00-16:00')},{id:'b',nombre:'b',activo:true,horarioSemanal:Array(7).fill('15:00-22:00')}]
  const ev=[{id:'e',nombre:'e',activo:true,sector:'sector',horarioSemanal:Array(7).fill('15:00-16:00')}]
  const need=Array.from({length:31},(_,fi)=>({hora:`${String(7+Math.floor(fi/2)).padStart(2,'0')}:${fi%2?'30':'00'}`,necesidad:Array.from({length:7},(_,d)=>i.demanda[d][fi-2]??0)}))
  const op={politica_recursos_version:1 as const,supervision_apertura_externa:i.supervision_apertura_externa,max_caja_eventual_slots:{e:4},aperturaSoloAux:true,sinAuxCierre:true,supervisorJornadaCompleta:false,francoMedioCorridos:false}
  const input=convertirInputAV2(need,[],aux,ev,[],op),r=convertirOutputDeV2(ejecutarAlgoritmo(input),[],aux,ev)
  expect(validarResultadoSemana(r,[],aux,ev,{necesidad:need,excepciones:[],operativa:op}).violaciones).toEqual([])
  expect(validarResultadoSemana(r,[],aux,ev,{necesidad:need,excepciones:[],operativa:{...op,max_caja_eventual_slots:{e:0}}}).violaciones.some(v=>v.codigo==='OP_EVENTUAL_TOPE_SEMANAL')).toBe(true)
  const reserve={e:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s===14))}
  expect(validarResultadoSemana(r,[],aux,ev,{necesidad:need,excepciones:[],operativa:{...op,reservas_sector_eventual:reserve}}).violaciones.some(v=>v.codigo==='OP_EVENTUAL_RESERVA_SECTOR')).toBe(true)
  expect(validarResultadoSemana(r,[],aux,ev,{necesidad:need,excepciones:[],operativa:op}).publicable).toBe(false) // AH2-039/040 aún sin homologar
  r.cajaAux!.find(a=>a.slotsCajaPorDia[0][14])!.slotsCajaPorDia[0][14]=false
  expect(validarResultadoSemana(r,[],aux,ev,{necesidad:need,excepciones:[],operativa:op}).violaciones.some(v=>v.codigo==='OP_PRIORIDAD_AUX')).toBe(true)
 })
})
it('la pasada eventual deja de asignar al alcanzar el tope individual',()=>{
 const i=entradaRecursos();const {p2,p3}=apoyo(i)
 expect(p3.horas_caja_por_eventual.e).toBe(2)
 i.max_caja_eventual_slots={e:1}
 expect(ejecutarPasada3(i,p2).horas_caja_por_eventual.e).toBe(.5)
})

it('la capacidad AUX deriva del solapamiento y puede superar doce horas sin un tope inventado',()=>{
 const i=entradaRecursos();i.max_caja_eventual_slots={e:0}
 i.presencia_aux.b=i.presencia_aux.b.map(()=>Array.from({length:30},(_,s)=>s>=4&&s<28?'PARADO':'NO_PRESENTE'))
 i.demanda=i.demanda.map(()=>Array.from({length:30},(_,s)=>s<2?1:s>=4&&s<16?2:0))
 const {p2}=apoyo(i)
 const horas=Object.values(p2.asignacion_aux).map(m=>m.flat().filter(x=>x==='CAJA').length/2)
 expect(horas.reduce((a,b)=>a+b)).toBe(49)
 expect(Math.max(...horas)).toBeGreaterThan(12)
})
