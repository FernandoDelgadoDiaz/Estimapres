/**
 * ENSAYO PRIVADO (solo con autorización del propietario). Lee el PDF POM y la dotación desde una carpeta privada
 * (AH2_ENSAYO_DIR) fuera del repositorio y escribe allí los resultados. Sin la variable, se omite. Nunca se versiona
 * ningún dato real: este archivo solo contiene código.
 */
import {it} from 'vitest'
import {readFileSync,writeFileSync} from 'node:fs'
import {textoPDFNode} from '../../utils/__tests__/fixtures/pdfTextoNode'
import {interpretarTextoPOM} from '../../utils/pdfParser'
const dir=process.env.AH2_ENSAYO_DIR
it.skipIf(!dir)('ensayo privado · paso 1: semana y «Estimado de cajas necesarias» del PDF POM',async()=>{
 const texto=await textoPDFNode(new Uint8Array(readFileSync(`${dir}/pom.pdf`)))
 const r=interpretarTextoPOM(texto,'pom.pdf')
 writeFileSync(`${dir}/pom.json`,JSON.stringify({semana:r.semana,franjas:r.franjas,avisos:r.avisos,horasCaja:r.horasCaja,totalSlots:r.totalSlots},null,1))
})

// ── Paso 2: generación híbrida A + CP-SAT con la dotación de `${dir}/dotacion.json` ─────────────────────────────
// dotacion.json = {origen:'REAL'|'SINTETICA', sucursal, cajeros, auxiliares, eventuales, excepciones?, opciones?}
// (formato de pantalla; se traduce con el MISMO adaptador de la app). Sin perfiles EVENTUAL no se inventan: si faltan,
// el ejecutor lo informa como impedimento.
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {convertirInputAV2} from '../../algoritmo/adapter'
import {generarPropuestaHibrida,type EventoProgreso} from '../orquestador'
import {transporteProceso} from '../transporteProceso'
import {generarPDFPrueba} from '../pdfPrueba'
import {metricasAH2040} from '../../algoritmo/ah2040'
const B=process.env.AH2_OPTIMIZER_DIR??resolve(process.cwd(),'../aliada-optimizer')
it.skipIf(!dir||!existsSync(`${dir}/dotacion.json`))('ensayo privado · paso 2: A + CP-SAT, comparación y PDF',async()=>{
 const pom=JSON.parse(readFileSync(`${dir}/pom.json`,'utf8')),d=JSON.parse(readFileSync(`${dir}/dotacion.json`,'utf8'))
 // Impedimentos previos: con dotación REAL no se inventan perfiles de caja EVENTUAL ni disponibilidades.
 const impedimentos:string[]=[]
 if(String(d.origen).startsWith('REAL')&&d.eventuales?.some((e:{activo:boolean})=>e.activo)&&!d.opciones?.disponibilidad_caja_eventual)
  impedimentos.push('EVENTUAL activos sin perfiles de disponibilidad de caja acreditados (AH2-037): no se infieren.')
 if(impedimentos.length){writeFileSync(`${dir}/impedimentos.json`,JSON.stringify(impedimentos,null,1));return}
 const input=convertirInputAV2(pom.franjas,d.cajeros,d.auxiliares,d.eventuales,d.excepciones??[],{politica_recursos_version:1,...d.opciones,sucursal_id:d.sucursal,semana:pom.semana.lunes})
 const segundos=Number(process.env.AH2_ENSAYO_SEGUNDOS??30)
 const ev:EventoProgreso[]=[]
 const s=await generarPropuestaHibrida(input,{id:'ensayo-091',sucursal:d.sucursal,timeoutMs:(segundos+60)*1000,parametros:{segundos,modo:'global',semilla:20261119},
  transporte:transporteProceso({python:process.env.AH2_PYTHON??'python3',cwd:B,plazoMs:(segundos+60)*1000}),onProgreso:e=>ev.push(e)})
 writeFileSync(`${dir}/entrada-motor.json`,JSON.stringify(input))
 writeFileSync(`${dir}/salida.json`,JSON.stringify({...s,progreso:ev,origenDotacion:d.origen},null,1))
 if(s.propuesta&&!s.bloqueos.length)writeFileSync(`${dir}/propuesta-no-oficial.pdf`,Buffer.from(generarPDFPrueba(s,{sucursal:d.sucursal,semana:pom.semana.lunes}).output('arraybuffer')))
 void metricasAH2040
},600000)
