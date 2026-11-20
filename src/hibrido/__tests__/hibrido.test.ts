/**
 * Integración híbrida de LABORATORIO: contrato A↔B, transporte, fallos, selección, salida única y PDF no oficial.
 * Las entradas son sintéticas (fixtures compartidos con aliada-optimizer). La prueba con proceso real de B se
 * ejecuta solo si el repositorio hermano y Python con OR-Tools están disponibles (AH2_OPTIMIZER_DIR o ../aliada-optimizer).
 */
import {describe,expect,it} from 'vitest'
import {existsSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import sobreGolden from './fixtures/sobreSintetico.json'
import casosSemanal from '../../algoritmo/__tests__/fixtures/ah2040SemanalCasos.json'
import resultadosSemanal from '../../algoritmo/__tests__/fixtures/ah2040SemanalResultadosB.json'
import condiciones from '../../algoritmo/__tests__/fixtures/condicionesBCalculadas.json'
import type {InputAlgoritmo,ResultadoSemanal} from '../../algoritmo/types'
import {aEntradaB,canonico,crearSobre,hashEntrada,validarRespuesta,VERSION_CONTRATO,type RespuestaB,type SobreSolicitud} from '../contrato'
import {generarPropuestaHibrida,type OpcionesHibrido} from '../orquestador'
import {transporteProceso} from '../transporteProceso'
import {generarPDFPrueba,grillaPlan,MARCA_NO_OFICIAL,tramos} from '../pdfPrueba'
import {abrirPDFNode} from '../../utils/__tests__/fixtures/pdfTextoNode'

type Caso={nombre:string;data:{input:InputAlgoritmo}}
const caso=(n:string,modo='P0')=>{const c=(casosSemanal as unknown as Caso[]).find(x=>x.nombre.startsWith(n))!;const i=structuredClone(c.data.input) as InputAlgoritmo&{comparacion_aux_eventual?:unknown};i.comparacion_aux_eventual={modo,pares:[]};return i as InputAlgoritmo}
const planB=(n:string,modo='P0')=>(resultadosSemanal as any[]).find(x=>x.caso.startsWith(n)&&x.modo===modo).plan
const OP:OpcionesHibrido={timeoutMs:2000,parametros:{segundos:5,modo:'global',semilla:20261119},id:'lab-1',sucursal:'synthetic'}
/** Transporte simulado que contesta a partir del sobre recibido. */
const responde=(f:(s:SobreSolicitud)=>Partial<RespuestaB>)=>async(s:SobreSolicitud)=>({version:VERSION_CONTRATO,idSolicitud:s.id,hashEntrada:s.hashEntrada,estado:'OPTIMAL',plan:null,
 fases:[],lexCompleto:true,segundos:0.1,incidencias:[],conflictos:[],publicable:false,motor:'B-CP-SAT',...f(s)})

describe('contrato A↔B',()=>{
 it('canónico y hash idénticos a Python (sobre de referencia generado por aliada-optimizer)',async()=>{
  expect(canonico({b:1,a:[1,{d:'ñ',c:0.5}]})).toBe('{"a":[1,{"c":0.5,"d":"ñ"}],"b":1}')
  expect(await hashEntrada(sobreGolden.entrada)).toBe(sobreGolden.hashEntrada)
 })
 it('traducción por lista blanca: informa campos desconocidos y mapea el antecedente dominical',()=>{
  const i={...caso('S5'),inicio_minimo_lunes_por_colaborador:{p1:4},semillas:{},campo_nuevo:1} as unknown as InputAlgoritmo
  const {entrada,noTransportables}=aEntradaB(i,'synthetic')
  expect(noTransportables).toEqual(['campo_nuevo'])
  expect(entrada.input.fin_domingo_anterior).toEqual({p1:28})
  expect('semillas' in entrada.input).toBe(false)
 })
 it('rechaza respuestas con versión, id, hash, estado, publicación o plan inválidos',async()=>{
  const input=caso('S5')
  const sobre=await crearSobre('x',aEntradaB(input,'synthetic').entrada,OP.parametros)
  const ok=await responde(()=>({plan:planB('S5')}))(sobre)
  expect(validarRespuesta(ok,sobre,input).ok).toBe(true)
  const mal=(cambio:Record<string,unknown>)=>validarRespuesta({...ok,...cambio},sobre,input)
  expect(mal({version:'aliada-hibrido/2'})).toEqual({ok:false,codigo:'RESPUESTA_VERSION'})
  expect(mal({idSolicitud:'otro'})).toEqual({ok:false,codigo:'RESPUESTA_ID_DISTINTO'})
  expect(mal({hashEntrada:'0'.repeat(64)})).toEqual({ok:false,codigo:'RESPUESTA_HASH_DISTINTO'})
  expect(mal({estado:'PERFECTO'})).toEqual({ok:false,codigo:'RESPUESTA_ESTADO_DESCONOCIDO'})
  expect(mal({publicable:true})).toEqual({ok:false,codigo:'RESPUESTA_PUBLICABLE'})
  expect(mal({plan:null})).toEqual({ok:false,codigo:'RESPUESTA_SIN_PLAN'})
  expect(mal({plan:{...planB('S5'),jornadas:{}}})).toEqual({ok:false,codigo:'PLAN_DOTACION'})
  const fuera=structuredClone(planB('S5'));fuera.EVENTUAL['ev-1'][0]=[31]
  expect(mal({plan:fuera})).toEqual({ok:false,codigo:'PLAN_MATRIZ'})
  await expect(crearSobre('x',sobre.entrada,{...OP.parametros,segundos:500})).rejects.toThrow('PARAMETROS_INVALIDOS')
 })
 it('exclusión manual DEBE (semana completa): A y B la dejan fuera del plan; el contrato no la exige',async()=>{
  const input=caso('S5');const fp=input.colaboradores.find(c=>c.rol==='FULL'||c.rol==='PART')!
  Object.assign(input,{sucursal_id:'synthetic',semana:'2026-11-23',condiciones_supervisor:{version:1,sucursal_id:'synthetic',semana:'2026-11-23',
   condiciones:[{id:'ex-1',modo:'DEBE',tipo:'exclusion_manual',colaboradorId:fp.id,desde:'2026-11-23',hasta:'2026-11-29'}]}})
  const sobre=await crearSobre('x',aEntradaB(input,'synthetic').entrada,OP.parametros)
  const plan=structuredClone(planB('S5'));delete plan.jornadas[fp.id]
  const ok=await responde(()=>({plan}))(sobre)
  expect(validarRespuesta(ok,sobre,input)).toMatchObject({ok:true})
  expect(validarRespuesta({...ok,plan:planB('S5')},sobre,input)).toEqual({ok:false,codigo:'PLAN_DOTACION'})
 })
})

describe('orquestador híbrido: respaldo A, fallos y selección',()=>{
 it('sin transporte: A válido como propuesta, salida no oficial',async()=>{
  const s=await generarPropuestaHibrida(caso('S5'),OP)
  expect(s).toMatchObject({origen:'A',estadoB:'NO_EJECUTADO',noOficial:true,publicable:false})
 })
 it('B mejor y válido: se elige B; salida única completa y coherente',async()=>{
  const s=await generarPropuestaHibrida(caso('S5'),{...OP,transporte:responde(()=>({plan:planB('S5')}))})
  expect(s.origen).toBe('B')
  expect(s.candidatos.A).toMatchObject({estado:'CALCULADO',valido:true})
  expect(s.candidatos.B).toMatchObject({estado:'OPTIMAL',valido:true,faltantesHoras:106})
  expect((s.candidatos.A as {faltantesHoras:number}).faltantesHoras).toBeGreaterThan(106)
  expect(s.faltantesHoras).toBe(106)
  expect(s.faltantesPorFranja.reduce((a,f)=>a+f.personas,0)/2).toBe(s.faltantesHoras)
  expect(s.sobrantesHoras).toBe(0)
  expect(s.horasPorEmpleado.map(x=>(x as {id:string}).id).sort()).toEqual(caso('S5').colaboradores.map(c=>c.id).sort())
  expect(s.coberturaPomPct).toBeGreaterThan(0)
 })
 it('B igual a A: se conserva A (reproducible)',async()=>{
  const a=(await generarPropuestaHibrida(caso('S1'),OP)).propuesta!
  const slots=(m:Record<string,string[][]>)=>Object.fromEntries(Object.entries(m).map(([id,w])=>[id,w.map(r=>r.flatMap((v,i)=>v==='CAJA'?[i]:[]))]))
  const mismo={jornadas:{...a.jornadas_full,...a.jornadas_part},AUX:slots(a.asignacion_aux),EVENTUAL:slots(a.asignacion_eventual)}
  const s=await generarPropuestaHibrida(caso('S1'),{...OP,transporte:responde(()=>({plan:mismo}))})
  expect(s.origen).toBe('A')
  expect(s.motivoSeleccion).toContain('no mejora')
 })
 it('timeout, error de transporte, respuesta inválida y ausencia de solución → A válido con el motivo registrado',async()=>{
  const nunca=await generarPropuestaHibrida(caso('S5'),{...OP,timeoutMs:50,transporte:()=>new Promise(()=>{})})
  expect(nunca).toMatchObject({origen:'A',estadoB:'TIMEOUT'})
  const cae=await generarPropuestaHibrida(caso('S5'),{...OP,transporte:async()=>{throw new Error('conexión rechazada')}})
  expect(cae).toMatchObject({origen:'A',estadoB:'ERROR_TRANSPORTE'})
  const hash=await generarPropuestaHibrida(caso('S5'),{...OP,transporte:responde(()=>({hashEntrada:'f'.repeat(64),plan:planB('S5')}))})
  expect(hash).toMatchObject({origen:'A',estadoB:'RESPUESTA_INVALIDA'})
  expect(hash.conflictos.some(c=>c.codigo==='RESPUESTA_HASH_DISTINTO')).toBe(true)
  const inf=await generarPropuestaHibrida(caso('S5'),{...OP,transporte:responde(()=>({estado:'INFEASIBLE',incidencias:[{codigo:'HORAS_FUERA_PERFIL'}]}))})
  expect(inf).toMatchObject({origen:'A',estadoB:'INFEASIBLE'})
  const unk=await generarPropuestaHibrida(caso('S5'),{...OP,transporte:responde(()=>({estado:'UNKNOWN'}))})
  expect(unk).toMatchObject({origen:'A',estadoB:'UNKNOWN'})
 })
 it('B con un resultado que viola reglas obligatorias nunca se usa, aunque cubra más',async()=>{
  // Plan P0 de B (sin regla) evaluado bajo la regla de totales: el EVENTUAL supera al AUX comparable.
  const s=await generarPropuestaHibrida(caso('S5','DIAS'),{...OP,transporte:responde(()=>({plan:planB('S5','P0')}))})
  expect(s.origen).toBe('A')
  expect(s.conflictos.some(c=>c.origen==='B'&&c.codigo==='OP_EVENTUAL_SUPERA_AUX_COMPARABLE')).toBe(true)
  expect(s.comparabilidadAH2040.incumplimientos).toEqual([])
 })
 it('sin ningún candidato válido no se presenta propuesta',async()=>{
  const roto=(i:InputAlgoritmo):ResultadoSemanal=>{throw new Error(`A sin resultado (${i.colaboradores.length})`)}
  const s=await generarPropuestaHibrida(caso('S5','DIAS'),{...OP,motorA:roto,transporte:responde(()=>({plan:planB('S5','P0')}))})
  expect(s).toMatchObject({origen:null,propuesta:null,coberturaPomPct:null})
  expect(s.conflictos.map(c=>c.codigo)).toContain('A_SIN_RESULTADO')
 })
 it('reporta condiciones DEBE/PREFERIRÍA y diagnósticos de disponibilidad EVENTUAL',async()=>{
  const modos=new Set<string>()
  for(const c of condiciones as any[]){
   const s=await generarPropuestaHibrida(structuredClone(c.data.input) as InputAlgoritmo,OP)
   expect(s.condiciones.solicitadas.length,c.nombre).toBeGreaterThan(0)
   for(const x of s.condiciones.solicitadas)modos.add(x.modo)
   if(s.origen)expect(s.condiciones.auditoria,c.nombre).not.toBeNull()
  }
  expect(modos).toEqual(new Set(['DEBE','PREFERIRIA']))
  const ev=caso('S8')
  const s2=await generarPropuestaHibrida(ev,OP)
  expect(s2.horasPorEmpleado.some(x=>(x as {horasReservadasFuncionHabitual?:number}).horasReservadasFuncionHabitual===12)).toBe(true)
 })
})

describe('PDF A4 de prueba (no oficial)',()=>{
 it('cada página es A4 vertical y lleva la marca NO OFICIAL; incluye las secciones de la salida única',async()=>{
  const s=await generarPropuestaHibrida(caso('S8','DIAS'),{...OP,transporte:responde(()=>({plan:planB('S8','DIAS')}))})
  const bytes=new Uint8Array(generarPDFPrueba(s,{sucursal:'synthetic',semana:'2026-11-23'}).output('arraybuffer'))
  if(process.env.AH2_HIBRIDO_OUT){writeFileSync(resolve(process.env.AH2_HIBRIDO_OUT,'salida-unica-sintetica.json'),JSON.stringify({...s,propuesta:undefined},null,1));writeFileSync(resolve(process.env.AH2_HIBRIDO_OUT,'propuesta-prueba-no-oficial.pdf'),bytes)}
  const pdf=await abrirPDFNode(bytes)
  let todo=''
  for(let i=1;i<=pdf.numPages;i++){
   const p=await pdf.getPage(i)
   expect(p.view[2]).toBeCloseTo(595.28,1);expect(p.view[3]).toBeCloseTo(841.89,1)
   const t=(await p.getTextContent()).items.map(x=>'str' in x?x.str:'').join(' ')
   expect(t).toContain(MARCA_NO_OFICIAL)
   todo+=t
  }
  for(const sec of ['Resumen','Horas por persona','Faltantes por franja','Conflictos y avisos','Condiciones del supervisor','Disponibilidad de caja EVENTUAL','AH2-040'])expect(todo).toContain(sec)
  expect(todo).toContain('Publicable')
 })
})

const DIR_B=process.env.AH2_OPTIMIZER_DIR??resolve(process.cwd(),'../aliada-optimizer')
const PY=process.env.AH2_PYTHON??'python3'
const hayB=existsSync(resolve(DIR_B,'optimizer/contrato.py'))&&spawnSync(PY,['-c','import ortools'],{cwd:DIR_B}).status===0
describe.skipIf(!hayB)('proceso real de B (laboratorio local)',()=>{
 it('A→sobre→CP-SAT→validación A→selección, y plazo vencido mata el proceso',async()=>{
  const t=transporteProceso({python:PY,cwd:DIR_B,plazoMs:60000})
  const s=await generarPropuestaHibrida(caso('S5','DIAS'),{...OP,timeoutMs:60000,transporte:t})
  expect(s.estadoB).toBe('OPTIMAL')
  expect(s.comparabilidadAH2040.incumplimientos).toEqual([])
  expect(['A','B']).toContain(s.origen)
  const corto=await generarPropuestaHibrida(caso('S5','DIAS'),{...OP,timeoutMs:60000,transporte:transporteProceso({python:PY,cwd:DIR_B,plazoMs:10})})
  expect(corto).toMatchObject({origen:'A',estadoB:'ERROR_TRANSPORTE'})
 },120000)
})

describe('PDF no oficial: grilla semanal de caja',()=>{
 it('tramos contiguos y grilla con jornada, franco y franjas de caja',()=>{
  expect(tramos([0,1,2,5,6,29])).toEqual(['08:00–09:30','10:30–11:30','22:30–23:00'])
  const g=grillaPlan({jornadas_full:{f:[{colab_id:'f',dia:0,bloques:[{slot_inicio:0,slot_fin:8},{slot_inicio:20,slot_fin:28}]}]},jornadas_part:{},
   asignacion_aux:{a:[['CAJA','CAJA','PARADO',...Array(27).fill('NO_PRESENTE')],...Array.from({length:6},()=>Array(30).fill('NO_PRESENTE'))]},asignacion_eventual:{}} as unknown as ResultadoSemanal)
  expect(g[0]).toEqual(['f','FULL','08:00–12:00 / 18:00–22:00','Franco','Franco','Franco','Franco','Franco','Franco'])
  expect(g[1].slice(0,4)).toEqual(['a','AUX','Caja 08:00–09:00','—'])
 })
})
