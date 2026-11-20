/**
 * Orquestador híbrido de LABORATORIO: A (determinístico, respaldo) + B (CP-SAT por transporte inyectado) →
 * validación independiente → selección → salida única no oficial.
 *
 * Garantías:
 * - A se calcula siempre primero y se conserva como respaldo; B nunca bloquea la entrega de A.
 * - Ningún candidato con infracciones operativas o normativas se usa, venga de A o de B.
 * - B se elige solo si es válido y estrictamente mejor que A en orden lexicográfico (faltantes, sobrantes,
 *   horas-caja EVENTUAL); en empate se conserva A (reproducible).
 * - Timeout, error de transporte, respuesta inválida o sin solución → se informa y se usa A si es válido.
 * - Nunca publica ni persiste: `publicable` es siempre false y la salida se marca como NO OFICIAL.
 */
import type {InputAlgoritmo,ResultadoSemanal} from '../algoritmo/types'
import {auditarEscenario} from '../algoritmo/auditoriaV2'
import {mascarasAH2040,metricasAH2040,relacionesAH2040,verificarAH2040,type ConfigAH2040} from '../algoritmo/ah2040'
import {motorAConPolitica,motorASinRelacion,politicaLaboratorioV1} from './politica'
import {compilarDisponibilidadCaja,reporteDisponibilidadCaja,verificarDisponibilidadCaja} from '../algoritmo/disponibilidadCajaEventual'
import {aEntradaB,crearSobre,planBaResultado,validarRespuesta,type EstadoB,type ParametrosB,type RespuestaB} from './contrato'
import type {TransporteB} from './transporte'
import {medirEquilibrio,compararEquilibrio,protegeReferencia} from './equilibrio'

export const VERSION_SALIDA='aliada-salida-unica/1'
export type Origen='A'|'B'
export interface Conflicto {origen:'A'|'B'|'TRANSPORTE'|'CONTRATO'|'DATOS';codigo:string;nivel?:string;detalle?:string;colaboradorId?:string;dia?:number}
/** Evento de progreso REAL (emitido cuando ocurre cada etapa; las fases de B llegan desde CP-SAT). */
export interface EventoProgreso {etapa:'PREPARACION'|'A_INICIO'|'A_FIN'|'B_ENVIO'|'B_FASE'|'B_RESPUESTA'|'VALIDACION'|'SELECCION';ms:number;detalle?:string}
export interface OpcionesHibrido {transporte?:TransporteB;timeoutMs:number;parametros:ParametrosB;id:string;sucursal:string
 onProgreso?:(e:EventoProgreso)=>void
 /** Solo pruebas: reemplaza el motor A (por defecto `ejecutarAlgoritmo`). */
 motorA?:(input:InputAlgoritmo)=>ResultadoSemanal}

const DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const hora=(s:number)=>`${String(8+Math.floor(s/2)).padStart(2,'0')}:${s%2?'30':'00'}`

/** Candidato evaluado con los validadores de A (independientes del motor que lo produjo). */
function evaluar(input:InputAlgoritmo,r:ResultadoSemanal,raw:InputAlgoritmo){
// La verificación de totales semanales AH2-040 (modos de totales) ya está dentro de auditarEscenario.
 const v=auditarEscenario(input,r).violaciones
 const disp=verificarDisponibilidadCaja(raw,r)
 const infracciones=[...v.filter(x=>x.nivel!=='DATOS'),...disp.map(x=>({codigo:String(x.codigo),nivel:'OPERATIVA' as const,detalle:JSON.stringify(x),colaboradorId:x.colaboradorId as string|undefined}))]
 const datos=v.filter(x=>x.nivel==='DATOS')
 const m=metricasAH2040(input,r)
 return {valido:infracciones.length===0,infracciones,datos,metricas:m}
}

const mejor=(input:InputAlgoritmo,a:ReturnType<typeof metricasAH2040>,b:typeof a)=>{
 const ev=(x:typeof a)=>Object.values(x.horasCajaEventual).reduce((s,y)=>s+y,0)
 if(input.equilibrio_semanal_version===1)return protegeReferencia(input,a.faltantesPorFranja,b.faltantesPorFranja,a.sobrantesHoras,b.sobrantesHoras)&&
  compararEquilibrio(medirEquilibrio(input,b.faltantesPorFranja),medirEquilibrio(input,a.faltantesPorFranja),b.sobrantesHoras,a.sobrantesHoras,ev(b),ev(a))<0
 const ka=[a.faltantesHoras,a.sobrantesHoras,ev(a)],kb=[b.faltantesHoras,b.sobrantesHoras,ev(b)]
 for(let i=0;i<3;i++){if(kb[i]<ka[i])return true;if(kb[i]>ka[i])return false}
 return false
}

export async function generarPropuestaHibrida(entradaOriginal:InputAlgoritmo,op:OpcionesHibrido){
 const t0=Date.now()
 const avisar=(etapa:EventoProgreso['etapa'],detalle?:string)=>op.onProgreso?.({etapa,ms:Date.now()-t0,detalle})
 const conflictos:Conflicto[]=[]
 avisar('PREPARACION','Política v1 de laboratorio (DIAS) y perfiles de caja EVENTUAL')
 const raw=politicaLaboratorioV1(entradaOriginal)
 const {input,info}=compilarDisponibilidadCaja(raw)
 const semana={desde:new Date(0),hasta:new Date(0)}
 // 1. A determinístico: siempre primero.
 let candA:{r:ResultadoSemanal;e:ReturnType<typeof evaluar>}|null=null
 try{
  avisar('A_INICIO')
  const r=(op.motorA??motorAConPolitica)(input)
  candA={r,e:evaluar(input,r,raw)}
  avisar('A_FIN',`A ${candA.e.valido?'válido':'con infracciones'} · faltantes ${candA.e.metricas.faltantesHoras} h`)
  if(!candA.e.valido)conflictos.push(...candA.e.infracciones.map(x=>({origen:'A' as const,codigo:x.codigo,nivel:x.nivel,detalle:x.detalle,colaboradorId:x.colaboradorId})))
 }catch(err){conflictos.push({origen:'A',codigo:'A_SIN_RESULTADO',detalle:err instanceof Error?err.message:String(err)})}
 // 2. B por transporte (opcional), con timeout y validación de contrato.
 let estadoB:EstadoB|'NO_EJECUTADO'|'TIMEOUT'|'ERROR_TRANSPORTE'|'RESPUESTA_INVALIDA'='NO_EJECUTADO'
 let respuestaB:RespuestaB|null=null,candB:{r:ResultadoSemanal;e:ReturnType<typeof evaluar>}|null=null
 const {entrada,noTransportables}=aEntradaB(input,op.sucursal,candA?.e.valido?candA.r:undefined)
 if(noTransportables.length)conflictos.push({origen:'CONTRATO',codigo:'CAMPOS_NO_TRANSPORTABLES',detalle:noTransportables.join(', ')})
 let hash:string|null=null
 if(op.transporte&&!noTransportables.length){
  const sobre=await crearSobre(op.id,entrada,op.parametros)
  hash=sobre.hashEntrada
  let crudo:unknown
  avisar('B_ENVIO',`Sobre ${sobre.id} · ${op.parametros.segundos} s · semilla ${op.parametros.semilla}`)
  try{crudo=await conTimeout(op.transporte(sobre,{onProgreso:f=>avisar('B_FASE',`${f.objetivo}: ${f.estado}`)}),op.timeoutMs)}
  catch(err){
   estadoB=err instanceof ErrorTimeout?'TIMEOUT':'ERROR_TRANSPORTE'
   conflictos.push({origen:'TRANSPORTE',codigo:estadoB,detalle:err instanceof Error?err.message.slice(0,200):undefined})
  }
  if(crudo!==undefined){
   avisar('B_RESPUESTA')
   const v=validarRespuesta(crudo,sobre,input)
   if(!v.ok){estadoB='RESPUESTA_INVALIDA';conflictos.push({origen:'CONTRATO',codigo:v.codigo})}
   else{
    respuestaB=v.respuesta;estadoB=v.respuesta.estado
    for(const c of v.respuesta.conflictos as {codigo?:string}[])conflictos.push({origen:'B',codigo:String(c?.codigo??'CONFLICTO_B')})
    for(const c of v.respuesta.incidencias as unknown[])conflictos.push({origen:'B',codigo:typeof c==='string'?c:String((c as {codigo?:string})?.codigo??'INCIDENCIA_B')})
    if(v.respuesta.plan){
     avisar('VALIDACION','Plan de B con los validadores independientes de A')
     const r=planBaResultado(input,v.respuesta.plan,semana)
     candB={r,e:evaluar(input,r,raw)}
     if(!candB.e.valido)conflictos.push(...candB.e.infracciones.map(x=>({origen:'B' as const,codigo:x.codigo,nivel:x.nivel,detalle:x.detalle,colaboradorId:x.colaboradorId})))
    }
   }
  }
 }
 // 3. Selección: solo candidatos válidos; B únicamente si es estrictamente mejor.
 const validoA=candA?.e.valido?candA:null,validoB=candB?.e.valido?candB:null
 let origen:Origen|null=null,motivo:string
 if(validoA&&validoB&&mejor(input,validoA.e.metricas,validoB.e.metricas)){origen='B';motivo=input.equilibrio_semanal_version===1?'B válido y mejor según cobertura, protección de picos y equilibrio semanal, sin descubrir picos de A.':'B válido y estrictamente mejor que A (faltantes → sobrantes → horas EVENTUAL).'}
 else if(validoA){origen='A';motivo=validoB?'A y B válidos; B no mejora a A: se conserva A.':op.transporte?`B no utilizable (${estadoB}); se usa A, válido.`:'Solo A (B no ejecutado en esta llamada).'}
 else if(validoB){origen='B';motivo='A inválido o sin resultado; B válido.'}
 else motivo='Ningún candidato cumple las restricciones obligatorias: no se presenta propuesta.'
 const elegido=origen==='A'?validoA:origen==='B'?validoB:null
 avisar('SELECCION',origen?`Propuesta: ${origen}`:'Sin propuesta válida')
 // Contrafáctico con el mismo motor A sin la relación semanal: faltantes atribuibles a la regla (estimación).
 let sinRelacion:number[][]|null=null
 if(elegido&&!op.motorA){try{sinRelacion=metricasAH2040(input,motorASinRelacion(input)).faltantesPorFranja}catch{sinRelacion=null}}
 const resumen=(c:{r:ResultadoSemanal;e:ReturnType<typeof evaluar>}|null,estado:string)=>c?{estado,valido:c.e.valido,coberturaPct:c.e.metricas.coberturaPct,faltantesHoras:c.e.metricas.faltantesHoras,sobrantesHoras:c.e.metricas.sobrantesHoras,
  horasCajaAux:c.e.metricas.horasCajaAux,horasCajaEventual:c.e.metricas.horasCajaEventual,infracciones:[...new Set(c.e.infracciones.map(x=>x.codigo))]}:{estado,valido:false}
 const candidatos={A:resumen(candA,candA?'CALCULADO':'SIN_RESULTADO'),B:resumen(candB,String(estadoB))}
 return construirSalida({candidatos,sinRelacion,raw,input,info,elegido,origen,motivo,estadoB,respuestaB,conflictos,hash,datosA:candA?.e.datos??[]})
}

class ErrorTimeout extends Error{constructor(ms:number){super(`B no respondió en ${ms} ms`)}}
export function conTimeout<T>(p:Promise<T>,ms:number):Promise<T>{
 let t:ReturnType<typeof setTimeout>
 return Promise.race([p,new Promise<T>((_,rej)=>{t=setTimeout(()=>rej(new ErrorTimeout(ms)),ms)})]).finally(()=>clearTimeout(t))
}

/** Cota estructural por franja: personas que podrían estar en caja ignorando contratos y jornadas. */
function personalMaximo(input:InputAlgoritmo,d:number,s:number){
 const {O,K}=mascarasAH2040(input),k=`${d}/${s}`
 return input.colaboradores.filter(c=>c.rol==='FULL'||c.rol==='PART').length+Object.values(K).filter(x=>x.has(k)).length+Object.values(O).filter(x=>x.has(k)).length
}

function construirSalida(x:{candidatos:Record<'A'|'B',Record<string,unknown>>;sinRelacion:number[][]|null;raw:InputAlgoritmo;input:InputAlgoritmo;info:ReturnType<typeof compilarDisponibilidadCaja>['info'];elegido:{r:ResultadoSemanal;e:ReturnType<typeof evaluar>}|null;origen:Origen|null;motivo:string;
 estadoB:string;respuestaB:RespuestaB|null;conflictos:Conflicto[];hash:string|null;datosA:{codigo:string;detalle:string;colaboradorId?:string}[]}){
 const {input,elegido}=x
 const cfg=(input as InputAlgoritmo&{comparacion_aux_eventual?:ConfigAH2040}).comparacion_aux_eventual
 const m=elegido?.e.metricas
 const franjas=(g:number[][]|undefined)=>(g??[]).flatMap((row,d)=>row.flatMap((n,s)=>n>0?[{dia:DIAS[d],franja:`${hora(s)}–${hora(s+1)}`,personas:n}]:[]))
 const sobrantes=elegido?input.demanda.map((row,d)=>row.map((n,s)=>{
  let c=0
  for(const w of [...Object.values(elegido.r.jornadas_full),...Object.values(elegido.r.jornadas_part)])for(const j of w)if(j.dia===d&&j.bloques.some(b=>b.slot_inicio<=s&&s<b.slot_fin))c++
  for(const mm of [...Object.values(elegido.r.asignacion_aux),...Object.values(elegido.r.asignacion_eventual)])if(mm[d][s]==='CAJA')c++
  return Math.max(0,c-n)})):undefined
 return {
  version:VERSION_SALIDA,noOficial:true as const,publicable:false as const,
  leyenda:'PRUEBA NO OFICIAL — laboratorio híbrido. No es un horario aprobado ni publicado.',
  origen:x.origen,motivoSeleccion:x.motivo,candidatos:x.candidatos,estadoB:x.estadoB,fasesB:x.respuestaB?.fases??[],hashEntrada:x.hash,
  propuesta:elegido?.r??null,
  coberturaPomPct:m?.coberturaPct??null,demandaHoras:m?.demandaHoras??null,faltantesHoras:m?.faltantesHoras??null,sobrantesHoras:m?.sobrantesHoras??null,
  equilibrioSemanal:m?{activo:input.equilibrio_semanal_version===1,...medirEquilibrio(input,m.faltantesPorFranja)}:null,
  faltantesPorFranja:franjas(m?.faltantesPorFranja),sobrantesPorFranja:franjas(sobrantes),
  horasPorEmpleado:elegido?reporteDisponibilidadCaja(x.raw,elegido.r as Required<ResultadoSemanal>):[],
  conflictos:[...x.conflictos,...x.datosA.map(d=>({origen:'DATOS' as const,codigo:d.codigo,detalle:d.detalle,colaboradorId:d.colaboradorId}))],
  condiciones:{solicitadas:(input.condiciones_supervisor?.condiciones??[]).map(c=>({id:c.id,modo:c.modo,tipo:c.tipo,colaboradorId:c.colaboradorId,dia:c.dia,valor:c.valor})),
   auditoria:elegido?.r.auditoria_condiciones??null,preferenciasIncumplidas:elegido?.r.preferencias_manuales_incumplidas??null},
  disponibilidadEventual:{diagnosticos:x.info?.diagnosticos??[],bloqueaPublicacion:x.info?.bloqueaPublicacion??false},
  comparabilidadAH2040:(()=>{
   const rel=cfg?relacionesAH2040(input,cfg):{rels:[],notas:[]}
   const atrib=m&&x.sinRelacion?m.faltantesPorFranja.map((row,d)=>row.map((n,s)=>Math.max(0,n-x.sinRelacion![d][s]))):null
   const sinPersonal=m?input.demanda.map((row,d)=>row.map((n,s)=>Math.max(0,n-personalMaximo(input,d,s)))):null
   const suma=(g:number[][]|null)=>g?g.flat().reduce((a,b)=>a+b,0)/2:null
   return {modo:cfg?.modo??null,politica:cfg?.modo==='DIAS'?'DIAS — política v1 de laboratorio (decisión del propietario 20/11/2026); no homologada para producción':'sin regla semanal',
    activacionDefinitiva:'Solo laboratorio: no productiva ni publicable',
    relaciones:rel.rels.map(r=>({eventualId:r.eventualId,auxId:r.auxId,horasEventual:m?.horasCajaEventual[r.eventualId]??null,horasAux:m?.horasCajaAux[r.auxId]??null})),
    sinAuxComparable:(rel.notas as {codigo:string;eventualId?:string}[]).filter(n=>n.codigo==='EVENTUAL_SIN_AUX_COMPARABLE').map(n=>n.eventualId!),
    incumplimientos:cfg&&elegido?verificarAH2040(input,elegido.r,cfg).violaciones:[],
    faltantesAtribuiblesReglaHoras:suma(atrib),faltantesAtribuiblesPorFranja:franjas(atrib??undefined),
    faltantesSinPersonalHoras:suma(sinPersonal),
    notaAtribucion:'Atribución estimada con el motor A: misma entrada con y sin la relación semanal. «Sin personal» es una cota estructural por franja.'}
  })(),
  // Bloqueos de política/datos que impiden un ensayo concluyente (no se resuelven automáticamente).
  bloqueos:[...new Set([...x.datosA.map(d=>d.codigo),...(x.info?.diagnosticos??[]).filter(d=>d.bloqueaPublicacion).map(d=>d.codigo),...x.conflictos.filter(c=>c.origen==='B'||c.origen==='DATOS').map(c=>c.codigo)]
   .map(c=>c.replace(/[-]/g,'_').split(':')[0]).filter(c=>c.startsWith('POLITICA_')||c.startsWith('DATOS_')||c.startsWith('EV_CAJA')))].sort(),
  excepcionApertura:{configurada:!!input.excepcion_apertura_aux_unico?.some(r=>r.some(Boolean)),
   franjasAplicadas:elegido?input.demanda.reduce((a,row,d)=>a+row.map((_,s)=>s).filter(s=>input.excepcion_apertura_aux_unico?.[d]?.[s]&&row[s]>0&&Object.values(elegido.r.asignacion_aux).filter(m=>m[d][s]!=='NO_PRESENTE').length===1&&Object.values(elegido.r.asignacion_aux).some(m=>m[d][s]==='CAJA')).length,0):0,
   regla:'AH2-037/042: en las franjas autorizadas por la sucursal, el AUX único atiende caja sentado sin otro supervisor de pie (excepción local aprobada); cuenta como hora-caja AUX.'},
  supervision:elegido?Object.keys(input.presencia_aux).sort().map(id=>({auxId:id,porDia:elegido.r.asignacion_aux[id].map((row,d)=>({dia:DIAS[d],
   presenteHoras:row.filter(v=>v!=='NO_PRESENTE').length/2,cajaHoras:row.filter(v=>v==='CAJA').length/2,supervisionHoras:row.filter(v=>v==='PARADO').length/2}))})):[],
 }
}
export type SalidaUnica=Awaited<ReturnType<typeof generarPropuestaHibrida>>
