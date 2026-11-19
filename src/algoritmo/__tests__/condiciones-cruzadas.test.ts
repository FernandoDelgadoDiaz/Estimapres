import {it,expect} from 'vitest'
import fixtures from './fixtures/condicionesBCalculadas.json'
import {compilarCondiciones} from '../condicionesSupervisor'
import {auditarEscenario} from '../auditoriaV2'
import {convertirOutputDeV2} from '../adapter'
import {generarPDF} from '../../utils/exportPDF'
import {abrirPDFNode} from '../../utils/__tests__/fixtures/pdfTextoNode'
import {ejecutarAlgoritmo} from '../orquestador'
import type {InputAlgoritmo,ResultadoSemanal} from '../types'
it('mismo snapshot A/B; las tres propuestas CP-SAT pasan el validador A',()=>{
 for(const row of fixtures){
  const input=row.data.input as unknown as InputAlgoritmo,n=compilarCondiciones(input)
  expect(n.auditoria).toEqual(row.audit)
  const asignacion_aux=Object.fromEntries(Object.entries(n.input.presencia_aux).map(([id,m])=>{
    const week=m.map((rs,d)=>rs.map((v,s)=>((row.plan.AUX as Record<string,number[][]>)[id][d].includes(s)?'CAJA':v)))
    return [id,week]
  }))
  const r:any={jornadas_full:{},jornadas_part:row.plan.jornadas,asignacion_aux,asignacion_eventual:{},reporte_reglas:{advertencias:[],violaciones:[]},metricas:{cobertura_total_pct:0,deficit_por_slot:Array.from({length:7},()=>Array(30).fill(0))},auditoria_condiciones:n.auditoria}
  expect(auditarEscenario(n.input,r).violaciones).toEqual([])
 }
})
it('PDF conserva DEBE, turno, persona, ventana y vigencia; snapshot revalida una edición sin excepciones compiladas',async()=>{
 const input=fixtures[1].data.input as unknown as InputAlgoritmo,r:ResultadoSemanal=ejecutarAlgoritmo(input)
 const roster=[{id:'p',nombre:'p',tipo:'PART' as const,activo:true,horasSemanales:32}]
 const aux=[{id:'a',nombre:'a',activo:true,horarioSemanal:Array(7).fill('08:00-16:00')},{id:'b',nombre:'b',activo:true,horarioSemanal:Array(7).fill('15:00-22:00')}]
 const out=convertirOutputDeV2(r,roster,aux,[])
 expect(out.condicionesSupervisor?.aplicadas[0].colaboradorId).toBe('p')
 const doc=generarPDF(out,roster,'Prueba sintética',aux,[],{})
 const pdf=await abrirPDFNode(new Uint8Array(doc.output('arraybuffer')))
 let text='';for(let p=1;p<=pdf.numPages;p++)text+=(await (await pdf.getPage(p)).getTextContent()).items.map((x:any)=>x.str).join(' ')
 expect(text).toContain('DEBE turno');expect(text).toContain('09:00');expect(text).toContain('2026-11-24');await pdf.destroy()
 const {validarResultadoSemana}=await import('../../utils/validacionSemana')
 out.horarios.find(h=>h.colaboradorId==='p')!.jornadas[1].turnos=[{inicio:'18:00',fin:'23:00'}]
 expect(validarResultadoSemana(out,roster,aux,[],{excepciones:[],necesidad:[]}).violaciones.some(v=>v.codigo==='OP_CONDICION_SUPERVISOR')).toBe(true)
})
