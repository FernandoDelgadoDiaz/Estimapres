import {describe,it,expect} from 'vitest'
import type {InputAlgoritmo} from '../../algoritmo/types'
import {estructuraPicos,medirEquilibrio,compararEquilibrio,protegeReferencia,prioridadesFranja,costeReparto,costeConvexo} from '../equilibrio'
const grid=()=>Array.from({length:7},()=>Array(30).fill(0))
const input=(demanda:number[][])=>({demanda,presencia_aux:{},disponibilidad_eventual:{},colaboradores:[]} as InputAlgoritmo)

describe('equilibrio semanal y picos',()=>{
 it.each([0,2,6])('identifica el día pico %i desde el POM y los máximos diarios',d=>{
  const m=grid();m.forEach(r=>{r[3]=2;r[4]=1});m[d][5]=4
  const p=estructuraPicos(input(m));expect(p.diasPico.map((v,i)=>v?i:-1).filter(v=>v>=0)).toEqual([d])
  expect(p.mascara[d][4]).toBe(true);expect(p.mascara[(d+1)%7][3]).toBe(true);expect(p.mascara[(d+1)%7][4]).toBe(false)
 })
 it('reparte según demanda, sin igualar horas ni dividir por cero',()=>{
  const m=grid(),a=grid(),b=grid();m[0][3]=2;m[1][3]=6;a[0][3]=2;b[0][3]=1;b[1][3]=1
  const i=input(m),qa=medirEquilibrio(i,a),qb=medirEquilibrio(i,b)
  expect(qa.peorDeficitPct).toBe(100);expect(qb.peorDeficitPct).toBe(50)
  expect(qb.porDia[2].coberturaPct).toBe(100)
  // La comparación de equilibrio se prueba con el mismo coste pico: los picos preceden al balance.
  expect(compararEquilibrio({...qb,costePicos:qa.costePicos},qa,0,0,0,0)).toBeLessThan(0)
 })
 it('desempata el peor día con los siguientes déficits relativos, exactamente',()=>{
  const m=grid(),a=grid(),b=grid();m.forEach(r=>r[3]=6);a[0][3]=6;a[1][3]=4;b[0][3]=6;b[1][3]=2;b[2][3]=2
  const i=input(m),qa=medirEquilibrio(i,a),qb=medirEquilibrio(i,b)
  expect(qa.peorDeficitPct).toBe(qb.peorDeficitPct)
  expect(compararEquilibrio(qb,qa,0,0,0,0)).toBeLessThan(0)
  expect(compararEquilibrio(qa,qa,0,0,0,0)).toBe(0)
 })
 it('protege cada pico, los pesos configurados y los sobrantes de A',()=>{
  const m=grid(),a=grid(),b=grid();m.forEach(r=>{r[3]=2;r[4]=1});m[6][5]=3;a[0][4]=1;b[6][3]=1
  const i=input(m);expect(protegeReferencia(i,a,b,0,0)).toBe(false)
  expect(protegeReferencia(i,a,a,0,1)).toBe(false)
  i.pesos_franja=Array(30).fill(1);i.pesos_franja[4]=3
  expect(estructuraPicos(i).mascara[0][4]).toBe(true)
 })
})

describe('AH2-043 (v2): reparto con prioridad a horas y días pico',()=>{
 it('prioridad de hora y día pico y coste convexo, idénticos a CP-SAT',()=>{
  const m=grid();m[5][20]=6;m[5][28]=2;m[2][20]=3
  const p=prioridadesFranja(input(m));expect([p[5][20],p[5][28],p[2][20]]).toEqual([300,233,237])
  expect([0,1,2,3].map(k=>costeConvexo(6,k))).toEqual([0,1,3,6])
  // Mismo caso y valor que aliada-optimizer/tests/test_weekly_balance.py (paridad exacta).
  const dem=Array.from({length:7},(_,d)=>Array.from({length:30},(_,s)=>(d*7+s*3)%6))
  const f=dem.map((r,d)=>r.map((n,s)=>Math.min((d+s)%3,n)))
  expect(costeReparto({...input(dem),pesos_franja:Array(30).fill(1)},f)).toBe(205150)
 })
 it('el selector prefiere repartir de a una caja antes que abrir un hueco, y no toca el pico',()=>{
  const m=grid();m[0][10]=6;m[0][20]=2;m[0][28]=2
  const i={...input(m),equilibrio_semanal_version:2 as const}
  const hueco=grid(),repartido=grid(),pico=grid();hueco[0][20]=2;repartido[0][20]=1;repartido[0][28]=1;pico[0][10]=1;pico[0][20]=1
  const [h,r,p]=[hueco,repartido,pico].map(f=>medirEquilibrio(i,f))
  expect(compararEquilibrio(r,h,0,0,0,0)).toBeLessThan(0)
  expect(compararEquilibrio(r,p,0,0,0,0)).toBeLessThan(0)
  // En v1 el reparto no participa (coste 0): la regla anterior queda intacta como rollback.
  expect(medirEquilibrio(input(m),hueco).costeReparto).toBe(0)
 })
})
