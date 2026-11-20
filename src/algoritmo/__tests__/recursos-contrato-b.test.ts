import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import fixture from './fixtures/recursosBCalculados.json'
import {auditarEscenario} from '../simulacionDotacion'
it('valida independientemente las tres propuestas B con el contrato A',()=>{
 const rows=process.env.AH2_RECURSOS_B?JSON.parse(readFileSync(process.env.AH2_RECURSOS_B,'utf8')):fixture
 for(const row of rows){
  const p=row.plan,input=row.input
  const out:any={jornadas_full:Object.fromEntries(Object.entries(p.jornadas).filter(([id])=>input.colaboradores.find((c:any)=>c.id===id).rol==='FULL')),jornadas_part:Object.fromEntries(Object.entries(p.jornadas).filter(([id])=>input.colaboradores.find((c:any)=>c.id===id).rol==='PART')),asignacion_aux:Object.fromEntries(Object.entries(input.presencia_aux).map(([id,m]:any)=>[id,m.map((d:any,day:number)=>d.map((v:any,s:number)=>p.AUX[id][day].includes(s)?'CAJA':v))])),asignacion_eventual:Object.fromEntries(Object.entries(input.disponibilidad_eventual).map(([id,m]:any)=>[id,m.map((d:any,day:number)=>d.map((v:any,s:number)=>p.EVENTUAL[id][day].includes(s)?'CAJA':v))])),metricas:{deficit_por_slot:[],cobertura_total_pct:row.B.cobertura},reporte_reglas:{advertencias:[],violaciones:[],duras_cumplidas:true}}
  // El validador vuelve a contar la cobertura desde jornadas/caja; no acepta métricas del solver.
  out.metricas.deficit_por_slot=Array.from({length:7},()=>Array(30).fill(0))
  expect(auditarEscenario({...input,inicio_minimo_lunes_por_colaborador:Object.fromEntries(Object.entries(input.fin_domingo_anterior??{}).map(([id,n])=>[id,Math.max(0,(n as number)-24)]))},out).violaciones).toEqual([])
 }
})
