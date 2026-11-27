import {describe,it,expect} from 'vitest'
import type {InputAlgoritmo} from '../../algoritmo/types'
import {mejor} from '../orquestador'
import {metricasAH2040} from '../../algoritmo/ah2040'
const grid=()=>Array.from({length:7},()=>Array(30).fill(0))
type M=ReturnType<typeof metricasAH2040>
const met=(f:number[][]):M=>({faltantesPorFranja:f,sobrantesHoras:0,horasCajaEventual:{}} as unknown as M)

describe('AH2-072 · cobertura primero también frente a la protección de picos',()=>{
 const dem=grid();dem[0][5]=3;dem[1][10]=4
 const input={demanda:dem,presencia_aux:{},disponibilidad_eventual:{},colaboradores:[],equilibrio_semanal_version:2} as unknown as InputAlgoritmo
 const a=grid();a[1][10]=4
 it('B que cubre más horas en la semana gana aunque un pico quede peor',()=>{
  const b=grid();b[0][5]=1
  expect(mejor(input,met(a),met(b))).toBe(true)
 })
 it('con igual cobertura, B que descubre un pico de A no gana',()=>{
  const b=grid();b[0][5]=1;b[1][10]=3
  expect(mejor(input,met(a),met(b))).toBe(false)
 })
 it('B que cubre menos nunca gana',()=>{
  const b=grid();b[1][10]=4;b[1][11]=1
  expect(mejor(input,met(a),met(b))).toBe(false)
 })
})
