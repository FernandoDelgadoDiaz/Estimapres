import {describe,it,expect} from 'vitest'
import {compilarCondiciones,prevalidarCondiciones,costePreferencias} from '../condicionesSupervisor'
import {ejecutarAlgoritmo} from '../orquestador'
import {auditarEscenario} from '../auditoriaV2'
import {analizarComparabilidad} from '../comparabilidadAuxEventual'
import type {InputAlgoritmo} from '../types'
import type {CondicionSupervisor} from '../condicionesTipos'
import {entradaRecursos} from './fixtures/recursosSinteticos'
function data():InputAlgoritmo{return {sucursal_id:'synthetic',semana:'2026-11-23',apertura_solo_aux:false,
 colaboradores:[{id:'p',nombre:'p',rol:'PART',horasSemanales:32},{id:'a',nombre:'a',rol:'AUX'},{id:'b',nombre:'b',rol:'AUX'}],contratos:{p:{objetivoSlots:64,maximoSlots:64}},
 demanda:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s>=2&&s<28?1:0)),presencia_aux:{a:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<16?'PARADO':'NO_PRESENTE')),b:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s>=14&&s<28?'PARADO':'NO_PRESENTE'))},disponibilidad_eventual:{},omitir_impacto_horas:true}}
const row:CondicionSupervisor={id:'c1',tipo:'franco',modo:'DEBE',colaboradorId:'p',desde:'2026-11-23',hasta:'2026-11-29',dia:0}
function request(i:InputAlgoritmo,rows:CondicionSupervisor[]=[]){i.condiciones_supervisor={version:1,sucursal_id:'synthetic',semana:'2026-11-23',condiciones:rows,turnos:{mañana:{inicioMin:'09:00',inicioMax:'10:00',finMax:'16:00'},tarde:{inicioMin:'16:00',inicioMax:'18:00'}}};return i}
describe('AH2-039 condiciones opcionales',()=>{
 it('sin condiciones conserva el contrato previo; snapshot sin mutar entrada',()=>{
  const i=data();expect(compilarCondiciones(i).input).toBe(i)
  request(i,[row]);const before=structuredClone(i),n=compilarCondiciones(i)
  expect(i).toEqual(before);expect(n.auditoria?.publicable).toBe(false)
  expect(n.input.excepciones?.[0].dias).toEqual([0]);expect(prevalidarCondiciones(i).conflictos).toEqual([])
 })
 it('cumple franco y ventana en su fecha; rechaza edición incompatible con validador independiente',()=>{
  const i=request(data(),[row,{id:'c2',tipo:'turno',modo:'DEBE',colaboradorId:'p',desde:'2026-11-24',hasta:'2026-11-24',valor:'mañana'}])
  const r=ejecutarAlgoritmo(i),n=compilarCondiciones(i).input
  expect(r.jornadas_part.p[0].bloques).toEqual([]);expect(auditarEscenario(n,r).violaciones).toEqual([])
  expect(r.jornadas_part.p.flatMap(j=>j.bloques).reduce((s,b)=>s+b.slot_fin-b.slot_inicio,0)).toBe(64)
  const bad=structuredClone(r);bad.jornadas_part.p[1].bloques=[{slot_inicio:20,slot_fin:30}]
  expect(auditarEscenario(n,bad).violaciones.length).toBeGreaterThan(0)
 })
 it('incompatibilidad individual y capacidad de francos se demuestran sin relajar condiciones',()=>{
  const i=request(data(),[row,{...row,id:'c2',dia:1}]);expect(prevalidarCondiciones(i).conflictos.some(x=>x.demostrado)).toBe(true)
  expect(()=>ejecutarAlgoritmo(i)).toThrow('PREFLIGHT_BLOQUEADO')
  const cap=request(data(),[{id:'cap',tipo:'max_francos',modo:'DEBE',desde:row.desde,hasta:row.hasta,valor:0}]);expect(prevalidarCondiciones(cap).conflictos.some(x=>x.codigo==='CAPACIDAD_FRANCOS_INSUFICIENTE')).toBe(true)
  const late=request(data(),[{...row,tipo:'turno',dia:undefined,valor:'tarde'}]);expect(prevalidarCondiciones(late).conflictos.some(x=>x.codigo==='CONTRATO_INDIVIDUAL_INVIABLE')).toBe(true)
 })
 it.each(['branch','week','duplicate','date','person','window','partial'] as const)('rechaza dato %s',kind=>{
  const i=request(data(),[{...row}]),req=i.condiciones_supervisor!,c=req.condiciones[0]
  if(kind==='branch')req.sucursal_id='other'
  if(kind==='week')req.semana='2026-11-30'
  if(kind==='duplicate')req.condiciones.push({...c})
  if(kind==='date')c.desde='2026-02-30'
  if(kind==='person')c.colaboradorId='other'
  if(kind==='window'){c.tipo='turno';c.valor='undefined'}
  if(kind==='partial')c.tipo='exclusion_manual'
  expect(()=>compilarCondiciones(i)).toThrow()
 })
 it('ignora vencidas y excluye manual sin inventar franco ni modificar ficha',()=>{
  const i=request(data(),[{...row,desde:'2026-11-16',hasta:'2026-11-22'}]);expect(compilarCondiciones(i).auditoria?.ignoradas).toEqual(['c1'])
  request(i,[{...row,tipo:'exclusion_manual',dia:undefined}]);const before=structuredClone(i),n=compilarCondiciones(i)
  expect(n.input.colaboradores.map(c=>c.id)).toEqual(['a','b']);expect(n.auditoria?.excluidos).toEqual(['p']);expect(i).toEqual(before)
 })
 it('preferencias contradictorias son blandas; no degradan franjas ni sobrantes',()=>{
  const base=ejecutarAlgoritmo(request(data())),i=request(data(),[{...row,modo:'PREFERIRIA'},{...row,id:'c2',dia:1,modo:'PREFERIRIA'}])
  expect(prevalidarCondiciones(i).conflictos).toEqual([])
  const r=ejecutarAlgoritmo(i)
  expect(costePreferencias(r.auditoria_condiciones,r)).toBeGreaterThanOrEqual(1)
  r.metricas.deficit_por_slot.forEach((rs,d)=>rs.forEach((v,s)=>expect(v).toBeLessThanOrEqual(base.metricas.deficit_por_slot[d][s])))
  expect(r.metricas.exceso_por_slot.flat().reduce((a,b)=>a+b)).toBeLessThanOrEqual(base.metricas.exceso_por_slot.flat().reduce((a,b)=>a+b))
 })
})
it('AH2-040-P1: comparación individual propuesta; excluye supervisor y no impone tope',()=>{
 const i=entradaRecursos(),r=ejecutarAlgoritmo(i),before=structuredClone(r)
 const a=analizarComparabilidad(i,r,[{eventualId:'e',auxId:'b'}])
 expect(a.aprobada).toBe(false);expect(a.candidatos.map(c=>c.auxId).sort()).toEqual(['a','b']);expect(a.evaluaciones[0].comparablePropuesto).toBe(true);expect(r).toEqual(before)
 i.supervisor_jornada_completa=true;expect(analizarComparabilidad(i,r).candidatos.every(c=>c.auxId!=='a')).toBe(true)
 i.presencia_aux.b=i.presencia_aux.b.map(r=>r.map(()=>'NO_PRESENTE'));expect(analizarComparabilidad(i,r).sinComparable).toEqual(['e'])
})
it('condición por ID no afecta al homónimo; la exclusión no borra restricciones del otro',()=>{
 const i=request(data(),[row]);i.colaboradores[0].nombre='Mismo nombre';i.colaboradores.push({id:'q',nombre:'Mismo nombre',rol:'PART',horasSemanales:32});i.contratos!.q={objetivoSlots:64,maximoSlots:64};
 const c=compilarCondiciones(i).input;expect(c.excepciones![0].colaboradorId).toBe('p')
 const r=ejecutarAlgoritmo(i);expect(r.jornadas_part.p[0].bloques).toEqual([]);expect(auditarEscenario(c,r).violaciones).toEqual([])
 request(i,[{...row,tipo:'exclusion_manual',dia:undefined}]);i.excepciones=[{id:'other',colaboradorId:'q',colaboradorNombre:'Mismo nombre',tipo:'franco_dia',valor:'2',descripcion:'Franco de q'}]
 expect(compilarCondiciones(i).input.excepciones?.[0].colaboradorId).toBe('q')
})
it('ficha PART incompleta no se presenta como inviabilidad matemáticamente demostrada',()=>{
 const i=request(data(),[row]);i.contratos!.p.objetivoSlots=null
 const conflicts=prevalidarCondiciones(i).conflictos
 expect(conflicts.some(c=>c.codigo==='DATOS_HORAS_FICHA'&&!c.demostrado)).toBe(true)
})
it('preferencia de franco y medio franco FULL sigue subordinada a cobertura y no reduce horas',()=>{
 const i=request(data(),[{...row,tipo:'franco_medio_corrido',modo:'PREFERIRIA',dia:undefined}]);i.colaboradores[0]={...i.colaboradores[0],rol:'FULL',horasSemanales:48};delete i.contratos!.p
 const base=ejecutarAlgoritmo({...i,condiciones_supervisor:{...i.condiciones_supervisor!,condiciones:[]}}),r=ejecutarAlgoritmo(i)
 expect(r.jornadas_full.p.flatMap(j=>j.bloques).reduce((s,b)=>s+b.slot_fin-b.slot_inicio,0)).toBe(96)
 r.metricas.deficit_por_slot.forEach((rs,d)=>rs.forEach((v,s)=>expect(v).toBeLessThanOrEqual(base.metricas.deficit_por_slot[d][s])))
 expect([0,1]).toContain(r.preferencias_manuales_incumplidas)
})
