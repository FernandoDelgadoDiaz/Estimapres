import {it,expect} from 'vitest'
import {writeFileSync} from 'node:fs'
import {simularDotacion} from '../simulacionDotacion'
import {resumirRecursos} from '../recursosResumen'
import type {InputAlgoritmo} from '../types'

export function fixtureDotacion():InputAlgoritmo{
 return {politica_recursos_version:1,apertura_solo_aux:true,sin_aux_cierre:true,supervision_apertura_externa:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2)),
 demanda:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2?1:s>=2&&s<28?3:0)),
 contratos:{basepart:{objetivoSlots:64,maximoSlots:64,estadoFicha:'valida'}},inicio_minimo_lunes_por_colaborador:{basefull:0,basepart:0},
 colaboradores:[{id:'basefull',nombre:'basefull',rol:'FULL',horasSemanales:48},{id:'basepart',nombre:'basepart',rol:'PART',horasSemanales:32},{id:'a',nombre:'a',rol:'AUX'},{id:'b',nombre:'b',rol:'AUX'},{id:'e',nombre:'e',rol:'EVENTUAL'}],
 presencia_aux:{a:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<16?'PARADO':'NO_PRESENTE')),b:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s>=14&&s<28?'PARADO':'NO_PRESENTE'))},
 disponibilidad_eventual:{e:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s>=14&&s<26?'NO_USADO':'NO_DISPONIBLE'))},
 max_caja_eventual_slots:{e:16},max_bloques_caja_eventual_dia:2,eventuales_caja_hora_limite:'22:00'}
}
it('calcula plantilla actual/+32/+48, contratos exactos, mismas reglas y presencia; no estima linealmente',()=>{
 const input=fixtureDotacion(),copy=structuredClone(input),rows=simularDotacion(input)
 expect(input).toEqual(copy)
 for(const row of rows){
  expect(row.resultado.reporte_reglas.duras_cumplidas).toBe(true)
  expect(row.validacion.violaciones).toEqual([])
  expect(row.input.presencia_aux).toEqual(input.presencia_aux)
  expect(row.input.disponibilidad_eventual).toEqual(input.disponibilidad_eventual)
  if(row.horasAdicionales){const id=`simulado_${row.horasAdicionales}`,j=[...Object.values(row.resultado.jornadas_full),...Object.values(row.resultado.jornadas_part)].find(w=>w[0].colab_id===id)!;expect(j.flatMap(j=>j.bloques).reduce((n,b)=>n+b.slot_fin-b.slot_inicio,0)/2).toBe(row.horasAdicionales)}
  expect(resumirRecursos(row.input,row.resultado).eventuales[0].cajaHoras).toBeLessThanOrEqual(8)
 }
 expect(rows[1].faltantesHoras).toBeLessThan(rows[0].faltantesHoras)
 expect(rows[2].faltantesHoras).toBeLessThan(rows[0].faltantesHoras)
 if(process.env.AH2_RECURSOS_RESULTADOS)writeFileSync(process.env.AH2_RECURSOS_RESULTADOS,JSON.stringify(rows))
},60_000)

it('la saturación de demanda limita la mejora aun agregando 32/48 h contractuales',()=>{
 const i=fixtureDotacion();i.colaboradores=i.colaboradores.filter(c=>c.rol==='AUX'||c.rol==='EVENTUAL');i.contratos={};i.inicio_minimo_lunes_por_colaborador={}
 i.max_caja_eventual_slots={e:4}
 i.demanda=i.demanda.map(row=>row.map((_,s)=>s<2?1:s===14||s===15?2:0))
 const rows=simularDotacion(i)
 for(const r of rows){expect(r.validacion.violaciones).toEqual([]);if(r.horasAdicionales)expect(rows[0].faltantesHoras-r.faltantesHoras).toBeLessThan(r.horasAdicionales)}
 if(process.env.AH2_RECURSOS_SATURACION)writeFileSync(process.env.AH2_RECURSOS_SATURACION,JSON.stringify(rows))
},60_000)
