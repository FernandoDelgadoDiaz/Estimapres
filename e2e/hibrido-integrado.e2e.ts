import {expect,test} from '@playwright/test'
import {jsPDF} from 'jspdf'
import {MATRIZ_POM_SINTETICA} from '../src/utils/__tests__/fixtures/pomSintetico'
function pdfPom() {
  const pdf = new jsPDF()
  pdf.text('Programación semanal 2026-11-16 - 2026-11-22', 12, 12)
  pdf.text('Programación de referencia: Persona de referencia', 12, 22)
  pdf.addPage()
  pdf.text('Resumen sintético', 12, 12)
  pdf.addPage()
  pdf.setFontSize(8)
  const cabecera = 'Horario Lunes Martes Miércoles Jueves Viernes Sábado Domingo'
  pdf.text('Diferencia de cajas necesarias', 12, 14)
  pdf.text(cabecera, 12, 20)
  MATRIZ_POM_SINTETICA.forEach(([hora], i) => pdf.text(`${hora}:00 -1 -1 -1 -1 -1 -1 -1`, 12, 26 + i * 5))
  pdf.text('Estimado de cajas necesarias', 105, 14)
  pdf.text(cabecera, 105, 20)
  MATRIZ_POM_SINTETICA.forEach(([hora, demanda], i) => pdf.text(`${hora}:00 ${demanda.join(' ')}`, 105, 26 + i * 5))
  return Buffer.from(pdf.output('arraybuffer'))
}

import {readFileSync} from 'node:fs'
const casos=JSON.parse(readFileSync(new URL('../src/algoritmo/__tests__/fixtures/ah2040SemanalCasos.json',import.meta.url),'utf8')) as any[]
const planes=JSON.parse(readFileSync(new URL('../src/algoritmo/__tests__/fixtures/ah2040SemanalResultadosB.json',import.meta.url),'utf8')) as any[]

test('Worker del flujo habitual: HTTPS → A/B → revalidación → PDF, cancelación',async({page})=>{
 const input=structuredClone(casos.find(x=>x.nombre.startsWith('S5'))!.data.input) as any
 Object.assign(input,{sucursal_id:'091',semana:'2026-11-23',politica_recursos_version:1,comparacion_aux_eventual:{modo:'DIAS',pares:[]},inicio_minimo_lunes_por_colaborador:{p1:0},
  disponibilidad_caja_eventual:{version:1,perfiles:Object.keys(input.disponibilidad_eventual).map(id=>({colaboradorId:id,sucursalId:'091',vigenciaDesde:'2026-11-23',acreditacion:'TODA_LA_PRESENCIA',fuente:'fixture validado'}))}})
 const plan=planes.find(x=>x.caso.startsWith('S5')&&x.modo==='SEMANAL')!.plan
 const envios:string[]=[]
 await page.route('https://optimizer.example/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}})
  envios.push(route.request().url())
  const s=route.request().postDataJSON()
  await route.fulfill({status:200,contentType:'application/x-ndjson',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({tipo:'respuesta',respuesta:{version:s.version,idSolicitud:s.id,hashEntrada:s.hashEntrada,estado:'FEASIBLE',plan,fases:[],lexCompleto:false,segundos:1,incidencias:[],conflictos:[],publicable:false,motor:'B-CP-SAT'}})})
 })
 await page.goto('/nueva-semana')
 const result=await page.evaluate(async input=>{
  const {ejecutarHibridoEnWorker}=await import('/src/workers/hibridoCliente.ts' as string)
  const {validarResultadoSemana}=await import('/src/utils/validacionSemana.ts' as string)
  const {generarPDF}=await import('/src/utils/exportPDF.ts' as string)
  const cajeros=input.colaboradores.filter((c:any)=>['FULL','PART'].includes(c.rol)).map((c:any)=>({id:c.id,nombre:c.id,tipo:c.rol,horasSemanales:c.horasSemanales,activo:true}))
  const aux=Object.keys(input.presencia_aux).map(id=>({id,nombre:id,horarioSemanal:Array(7).fill('09:00-22:00'),activo:true}))
  const ev=Object.keys(input.disponibilidad_eventual).map(id=>({id,nombre:id,horarioSemanal:Array(7).fill('09:00-22:00'),sector:'sintético',activo:true}))
  const e={entrada:{input,cajeros,auxiliares:aux,eventuales:ev,contexto:{necesidad:[],excepciones:[]}},servicio:'https://optimizer.example',token:'synthetic-token'}
  const progreso:string[]=[]
  const r=await ejecutarHibridoEnWorker(e,new AbortController().signal,(p:any)=>progreso.push(p.etapa),()=>{throw new Error('Se requiere Worker real')})
  const v=validarResultadoSemana(r,cajeros,aux,ev,e.entrada.contexto)
  const pdf=generarPDF(r,cajeros,'Integración sintética',aux,ev,{sucursal:'091',validacion:v}).output()
  const ctrl=new AbortController();ctrl.abort()
  const cancelado=await ejecutarHibridoEnWorker(e,ctrl.signal,()=>{},()=>{}).then(()=>false,(err:Error)=>err.name==='AbortError')
  return {publicable:v.publicable,codigos:v.violaciones.map((v:any)=>v.codigo),origen:r.hibrido.origen,progreso,pdf:pdf.startsWith('%PDF-'),cancelado,sinToken:!JSON.stringify(r).includes('synthetic-token')}
 },input)
 expect(result).toMatchObject({publicable:true,codigos:[],pdf:true,cancelado:true,sinToken:true})
 expect(result.progreso).toContain('B_RESPUESTA')
 expect(envios).toHaveLength(1)
})


test('activación 091 en Nueva semana y opción inmediata de usar el motor anterior',async({page})=>{
 await page.goto('/nueva-semana')
 await page.locator('input[type=file]').first().setInputFiles({name:'pom-sintetico.pdf',mimeType:'application/pdf',buffer:pdfPom()})
 const anterior=page.getByRole('checkbox',{name:'Usar motor anterior para esta generación'})
 await expect(anterior).toBeVisible();await expect(anterior).not.toBeChecked()
 await anterior.check();await expect(anterior).toBeChecked()
 await page.addInitScript(()=>localStorage.setItem('aliada_sucursal_actual','092'))
 await page.reload()
 await expect(anterior).toHaveCount(0)
})
