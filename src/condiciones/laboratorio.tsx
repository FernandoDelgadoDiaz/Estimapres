/**
 * Laboratorio integrado Aliada Horarios 2.0 (no productivo, no publica, no guarda).
 * Flujo: datos (demostración sintética o archivo local) → condiciones DEBE/PREFERIRÍA → preflight → A + CP-SAT
 * (servidor de desarrollo local, opcional) con progreso real → validación independiente y selección → propuesta
 * única → cobertura, faltantes, supervisión, horas-caja, AH2-040 → PDF A4 no oficial.
 */
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react'
import {createRoot} from 'react-dom/client'
import {entradaDemo} from './demo'
import {prevalidarCondiciones,ErrorCondiciones} from '../algoritmo/condicionesSupervisor'
import type {CondicionSupervisor} from '../algoritmo/condicionesTipos'
import type {InputAlgoritmo,Jornada} from '../algoritmo/types'
import {demoSucursalLab} from '../hibrido/demoSucursal'
import {cargarPaquete} from '../hibrido/paquete'
import {generarPropuestaHibrida,type EventoProgreso,type SalidaUnica} from '../hibrido/orquestador'
import {cpSatLabDisponible,transporteHttpLab} from '../hibrido/transporteHttpLab'
import {generarPDFPrueba} from '../hibrido/pdfPrueba'
import {politicaLaboratorioV1} from '../hibrido/politica'
import {compilarDisponibilidadCaja} from '../algoritmo/disponibilidadCajaEventual'
import {CONTRATOS,editarTopes,topesVigentes,type EdicionTopes} from '../hibrido/topesContrato'
import '../contingencias/laboratorio.css'

const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const hh=(s:number)=>`${String(8+Math.floor(s/2)).padStart(2,'0')}:${s%2?'30':'00'}`
const tramos=(slots:boolean[])=>{const out:string[]=[];let a=-1;for(let s=0;s<=30;s++){if(s<30&&slots[s]){if(a<0)a=s}else if(a>=0){out.push(`${hh(a)}–${hh(s)}`);a=-1}}return out.join(' / ')}
const jornadaTxt=(js:Jornada[]|undefined,d:number)=>{const j=js?.find(x=>x.dia===d);return !j||!j.bloques.length?'Franco':j.bloques.map(b=>`${hh(b.slot_inicio)}–${hh(b.slot_fin)}`).join(' / ')}
const ETAPAS:Record<EventoProgreso['etapa'],string>={PREPARACION:'Preparación',A_INICIO:'Motor A: inicio',A_FIN:'Motor A: terminado',B_ENVIO:'CP-SAT: sobre enviado',B_FASE:'CP-SAT: fase',B_RESPUESTA:'CP-SAT: respuesta',VALIDACION:'Validación independiente',SELECCION:'Selección'}
const FUENTES={demo:'Demostración: un cajero PART',sucursal:'Demostración: sucursal sintética con AUX y EVENTUALES',archivo:'Archivo JSON local'} as const

function App(){
 const [fuente,setFuente]=useState<keyof typeof FUENTES>('demo'),[archivo,setArchivo]=useState<{input:InputAlgoritmo;resumen:string}|null>(null)
 const [rows,setRows]=useState<CondicionSupervisor[]>([]),[mode,setMode]=useState<CondicionSupervisor['modo']>('DEBE'),[kind,setKind]=useState<CondicionSupervisor['tipo']>('franco'),[day,setDay]=useState(0),[turn,setTurn]=useState('mañana'),[cap,setCap]=useState(2),[persona,setPersona]=useState('')
 const [error,setError]=useState(''),[salida,setSalida]=useState<SalidaUnica>(),[progreso,setProgreso]=useState<EventoProgreso[]>([]),[ocupado,setOcupado]=useState(false)
 const [cpSat,setCpSat]=useState<boolean|null>(null),[usarCpSat,setUsarCpSat]=useState(true),[segundos,setSegundos]=useState(8)
 const [topes,setTopes]=useState<EdicionTopes|null>(null)
 const cancelar=useRef<AbortController|null>(null)
 useEffect(()=>{cpSatLabDisponible().then(setCpSat)},[])
 const base=useMemo(()=>fuente==='demo'?entradaDemo():fuente==='sucursal'?demoSucursalLab():archivo?.input??null,[fuente,archivo])
 const cajeros=(base?.colaboradores??[]).filter(c=>c.rol==='FULL'||c.rol==='PART')
 const elegido=cajeros.some(c=>c.id===persona)?persona:cajeros[0]?.id??''
 const sucursal=base?.sucursal_id??'demo',semana=base?.semana??'2026-11-23'
 let topesError=''
 let topesCfg=base?.topes_caja_eventual_contrato
 const topesActuales=(()=>{try{return topes??topesVigentes(topesCfg,sucursal,semana)}catch(e){topesError=e instanceof Error?e.message:'Topes inválidos.';return null}})()
 if(base&&topes){try{topesCfg=editarTopes(base.topes_caja_eventual_contrato,sucursal,semana,topes)}catch(e){topesError=e instanceof Error?e.message:'Topes inválidos.'}}
 const input:InputAlgoritmo|null=base&&{...base,topes_caja_eventual_contrato:topesCfg,sucursal_id:sucursal,semana,condiciones_supervisor:{version:1 as const,sucursal_id:sucursal,semana,condiciones:rows,turnos:{mañana:{inicioMin:'09:00',inicioMax:'10:00',finMax:'16:00'},tarde:{inicioMin:'16:00',inicioMax:'18:00'}}}}
 function clear(){setSalida(undefined);setError('');setProgreso([])}
 function add(e:FormEvent){e.preventDefault();clear();const fin=new Date(`${semana}T12:00:00`);fin.setDate(fin.getDate()+6)
  setRows(old=>[...old,{id:crypto.randomUUID(),modo:mode,tipo:kind,colaboradorId:kind==='max_francos'?undefined:elegido,desde:semana,hasta:fin.toISOString().slice(0,10),dia:kind==='franco'?day:undefined,valor:kind==='turno'?turn:kind==='max_francos'?cap:undefined}])}
 async function leer(f:File|undefined){clear();setRows([]);setTopes(null);if(!f)return;try{setArchivo(cargarPaquete(await f.text()))}catch(e){setArchivo(null);setError(e instanceof Error?e.message:'Archivo inválido.')}}
 async function generate(){
  clear();if(!input){setError('Cargá un archivo válido o elegí una demostración.');return}
  if(topesError){setError(topesError);return}
  try{const p=prevalidarCondiciones(compilarDisponibilidadCaja(politicaLaboratorioV1(input)).input);if(p.conflictos.length)throw new ErrorCondiciones('PREFLIGHT_BLOQUEADO',p.conflictos)}
  catch(e){setError(e instanceof ErrorCondiciones?`${e.codigo}. ${e.conflictos.map(c=>`${c.codigo}${c.persona?' · '+c.persona:''}`).join('; ')}. Revisá o quitá las condiciones indicadas; Aliada no las cambia automáticamente.`:e instanceof Error?e.message:'Revisá las condiciones.');return}
  setOcupado(true);const ctrl=new AbortController();cancelar.current=ctrl
  try{
   const s=await generarPropuestaHibrida(input,{id:crypto.randomUUID().slice(0,32),sucursal,timeoutMs:(segundos+30)*1000,parametros:{segundos,modo:'global',semilla:20261119},
    transporte:cpSat&&usarCpSat?transporteHttpLab('',ctrl.signal):undefined,onProgreso:e=>setProgreso(p=>[...p,e])})
   setSalida(s)
  }catch(e){setError(e instanceof Error?e.message:'No se pudo generar.')}
  finally{setOcupado(false);cancelar.current=null}
 }
 const r=salida?.propuesta
 const nombre=(id:string)=>base?.colaboradores.find(c=>c.id===id)?.nombre??id
 return <main><header><div><p className="tag">Aliada Horarios 2.0 · laboratorio</p><h1>Condiciones antes de generar</h1></div><p>Laboratorio aislado · No oficial · Sin guardados</p></header>
 <section aria-labelledby="datos"><h2 id="datos">1. POM y dotación</h2>
  <form onSubmit={e=>e.preventDefault()}><label>Datos<select aria-label="Datos" value={fuente} onChange={e=>{setFuente(e.target.value as keyof typeof FUENTES);setRows([]);setTopes(null);clear()}}>{Object.entries(FUENTES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  {fuente==='archivo'&&<label>Archivo<input type="file" accept="application/json,.json" aria-label="Archivo de POM y dotación" onChange={e=>leer(e.target.files?.[0])}/></label>}</form>
  <p className="nota">{fuente==='archivo'?(archivo?.resumen??'El archivo se lee en este navegador y no se sube a ningún servidor (salvo al CP-SAT local de esta máquina al generar).'):'Datos sintéticos. Nunca una dotación real.'}</p>
  {base&&<dl><div><dt>Demanda POM</dt><dd>{base.demanda.flat().reduce((a,b)=>a+b,0)/2} h</dd></div><div><dt>FULL/PART · AUX · EVENTUAL</dt><dd>{cajeros.length} · {Object.keys(base.presencia_aux).length} · {Object.keys(base.disponibilidad_eventual).length}</dd></div><div><dt>Semana</dt><dd>{semana}</dd></div></dl>}
 </section>
 <section><h2>2. Condiciones (opcional)</h2><p>Podés generar sin agregar ninguna condición. Nada se guarda ni publica.</p>
 <form onSubmit={add}><label>Colaborador<select aria-label="Colaborador" value={elegido} onChange={e=>setPersona(e.target.value)}>{cajeros.map(c=><option key={c.id} value={c.id}>{c.nombre} · {c.rol}{c.horasSemanales?` ${c.horasSemanales} h`:''}</option>)}</select></label><label>Prioridad<select aria-label="Prioridad" value={mode} onChange={e=>{setMode(e.target.value as typeof mode);clear()}}><option value="DEBE">DEBE</option><option value="PREFERIRIA">PREFERIRÍA</option></select></label>
 <label>Condición<select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);clear()}}><option value="franco">Día de franco</option><option value="turno">Turno</option><option value="exclusion_manual">Gestionar manualmente toda la semana</option><option value="max_francos">Máximo de francos simultáneos</option></select></label>
 {kind==='franco'&&<label>Día<select aria-label="Día" value={day} onChange={e=>setDay(Number(e.target.value))}>{days.map((d,i)=><option key={d} value={i}>{d}</option>)}</select></label>}
 {kind==='turno'&&<label>Turno<select value={turn} onChange={e=>setTurn(e.target.value)}><option value="mañana">Mañana</option><option value="tarde">Tarde</option></select></label>}
 {kind==='max_francos'&&<label>Máximo diario<input type="number" min="0" max="160" value={cap} onChange={e=>setCap(Number(e.target.value))}/></label>}
 <button>Agregar condición</button></form><p className="nota">Ventanas de turno de esta prueba: mañana, ingreso 09:00–10:00 y salida hasta 16:00; tarde, ingreso 16:00–18:00. Un turno no obliga a trabajar en el franco.</p>
 <ul>{rows.map((c,i)=><li key={c.id}>{c.modo==='DEBE'?'DEBE':'PREFERIRÍA'} · {c.tipo} · {c.colaboradorId?nombre(c.colaboradorId):'Sucursal'} · {c.dia!==undefined?days[c.dia]:c.valor??'Toda la semana'} <button className="neutro" onClick={()=>{clear();setRows(rows.filter((_,j)=>j!==i))}}>Quitar condición {i+1}</button></li>)}</ul></section>
 <section aria-labelledby="topes"><h2 id="topes">Topes de caja EVENTUAL por contrato de origen (sucursal {sucursal})</h2>
  <p className="nota">Máximos semanales opcionales; nunca mínimos ni objetivos. Desactivado significa sin tope de clase (no 0 h). La edición rige desde esta semana y las siguientes sin recargar. No cambia el rol EVENTUAL ni los contratos de los cajeros. No se guarda.</p>
  {topesActuales&&<form onSubmit={e=>e.preventDefault()}>{CONTRATOS.map(k=><fieldset key={k}><legend>EVENTUAL de contrato {k}</legend>
   <label><input type="checkbox" aria-label={`Tope ${k} activo`} checked={topesActuales[k].activo} onChange={e=>{clear();setTopes({...topesActuales,[k]:{...topesActuales[k],activo:e.target.checked,horas:topesActuales[k].horas??null}})}}/> Activo</label>
   <label>Máximo semanal (h)<input type="number" min="0" max="84" step="0.5" aria-label={`Tope ${k} horas`} value={topesActuales[k].horas??''} disabled={!topesActuales[k].activo} onChange={e=>{clear();setTopes({...topesActuales,[k]:{...topesActuales[k],horas:e.target.value===''?null:Number(e.target.value)}})}}/></label>
  </fieldset>)}</form>}
  {topesError&&<p role="alert">{topesError}</p>}
 </section>
 <section><h2>3. Generar</h2>
  <form onSubmit={e=>e.preventDefault()}><label>Motores<select aria-label="Motores" value={usarCpSat&&cpSat?'ab':'a'} disabled={!cpSat} onChange={e=>setUsarCpSat(e.target.value==='ab')}><option value="ab">A + CP-SAT</option><option value="a">Solo A</option></select></label>
  <label>Tiempo CP-SAT (s)<input type="number" min="1" max="120" value={segundos} disabled={!cpSat||!usarCpSat} onChange={e=>setSegundos(Math.min(120,Math.max(1,Number(e.target.value)||1)))}/></label></form>
  <p className="nota">{cpSat===null?'Buscando CP-SAT local…':cpSat?'CP-SAT disponible en el servidor local de laboratorio.':'CP-SAT no disponible en este servidor: se genera solo con A (respaldo determinístico).'}</p>
  <button onClick={generate} disabled={ocupado}>Verificar y generar prueba</button>{ocupado&&<button className="neutro" onClick={()=>cancelar.current?.abort()}>Cancelar</button>}
  {error&&<p role="alert">{error}</p>}
  {progreso.length>0&&<ol className="events" aria-label="Progreso">{progreso.map((p,i)=><li key={i}><span>{ETAPAS[p.etapa]}{p.detalle?` · ${p.detalle}`:''}</span><small>{(p.ms/1000).toFixed(1)} s</small></li>)}</ol>}
 </section>
 {salida&&!r&&<section><h2>Sin propuesta válida</h2><p role="alert">{salida.motivoSeleccion}</p></section>}
 {salida&&r&&<section aria-labelledby="propuesta"><h2 id="propuesta">Propuesta de laboratorio</h2><p>No aprobada · No publicable · Sin guardados · Origen: {salida.origen==='B'?'CP-SAT':'motor A'} · {salida.motivoSeleccion}</p>
  {salida.bloqueos.length>0&&<p role="alert">Bloqueos de política o datos (no se resuelven automáticamente): {salida.bloqueos.join(', ')}.</p>}
  <dl><div><dt>Cobertura POM</dt><dd>Cobertura: {salida.coberturaPomPct} %</dd></div><div><dt>Faltantes</dt><dd>{salida.faltantesHoras} h</dd></div><div><dt>Sobrantes</dt><dd>{salida.sobrantesHoras} h</dd></div></dl>
  <h3>Horarios de la semana</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Persona</th>{days.map(d=><th key={d}>{d.slice(0,3)}</th>)}</tr></thead><tbody>
   {cajeros.map(c=><tr key={c.id}><td>{c.nombre}</td>{days.map((_,d)=><td key={d}>{jornadaTxt(r.jornadas_full[c.id]??r.jornadas_part[c.id],d)}</td>)}</tr>)}
   {Object.entries(r.asignacion_aux).map(([id,m])=><tr key={id}><td>{nombre(id)} (AUX)</td>{days.map((_,d)=><td key={d}>{tramos(m[d].map(v=>v==='CAJA'))?`Caja ${tramos(m[d].map(v=>v==='CAJA'))}`:m[d].some(v=>v==='PARADO')?'Supervisa':'—'}</td>)}</tr>)}
   {Object.entries(r.asignacion_eventual).map(([id,m])=><tr key={id}><td>{nombre(id)} (EVENTUAL)</td>{days.map((_,d)=><td key={d}>{tramos(m[d].map(v=>v==='CAJA'))||'—'}</td>)}</tr>)}
  </tbody></table></div>
  <h3>Horas-caja por persona</h3><table><thead><tr><th>Persona</th><th>Rol</th><th>Contrato / presencia</th><th>Contrato de origen</th><th>Tope caja</th><th>Caja</th><th>Presencia fuera de caja</th><th>Reservado función</th><th>Disponible caja</th></tr></thead><tbody>
   {salida.horasPorEmpleado.map(x=>{const v=x as Record<string,unknown>;return <tr key={String(v.id)}><td>{nombre(String(v.id))}</td><td>{String(v.rol)}</td><td>{String(v.horasContractuales??v.horasPresencia??'—')}</td><td>{String(v.contratoOrigen??'—')}</td><td>{v.rol==='EVENTUAL'?(v.topeCajaHoras==null?'sin tope':`${v.topeCajaHoras} h`):'—'}</td><td>{String(v.horasCaja)}</td><td>{String(v.horasFuncionHabitualRealizadas??v.horasSupervisionOFueraDeCaja??'—')}</td><td>{String(v.horasReservadasFuncionHabitual??'—')}</td><td>{String(v.disponibilidadCajaEfectivaHoras??'—')}</td></tr>})}</tbody></table>
  <h3>Supervisión AUX</h3><table><thead><tr><th>AUX</th>{days.map(d=><th key={d}>{d.slice(0,3)}</th>)}</tr></thead><tbody>
   {salida.supervision.map(s=><tr key={s.auxId}><td>{nombre(s.auxId)}</td>{s.porDia.map(x=><td key={x.dia}>{x.presenteHoras?`${x.supervisionHoras} h sup. · ${x.cajaHoras} h caja`:'—'}</td>)}</tr>)}</tbody></table>
  <h3>AH2-040 · EVENTUAL ≤ AUX comparable (semanal)</h3><p className="nota">{salida.comparabilidadAH2040.politica}. {salida.comparabilidadAH2040.notaAtribucion}</p>
  <ul>{salida.comparabilidadAH2040.relaciones.map(x=><li key={x.eventualId+x.auxId}>{nombre(x.eventualId)} {x.horasEventual} h ≤ {nombre(x.auxId)} {x.horasAux} h</li>)}
   {salida.comparabilidadAH2040.sinAuxComparable.map(e=><li key={e}>{nombre(e)}: sin AUX comparable (no se aplica tope cero)</li>)}</ul>
  <p>Faltantes atribuibles a la regla: {salida.comparabilidadAH2040.faltantesAtribuiblesReglaHoras??'—'} h · imposibles por falta de personal: {salida.comparabilidadAH2040.faltantesSinPersonalHoras??'—'} h · incumplimientos: {salida.comparabilidadAH2040.incumplimientos.length}</p>
  <details><summary>Faltantes por franja ({salida.faltantesPorFranja.length})</summary><table><tbody>{salida.faltantesPorFranja.map((f,i)=><tr key={i}><td>{f.dia}</td><td>{f.franja}</td><td>{f.personas}</td></tr>)}</tbody></table></details>
  <details><summary>Conflictos y avisos ({salida.conflictos.length})</summary><ul>{salida.conflictos.map((c,i)=><li key={i}>{c.origen} · {c.codigo}{c.detalle?` · ${c.detalle.slice(0,160)}`:''}</li>)}</ul></details>
  {r.auditoria_condiciones?.excluidos.length!==0&&r.auditoria_condiciones&&<p>Persona excluida del cálculo automático: su horario queda pendiente de gestión manual, sin inferir ausencia ni franco.</p>}
  <button onClick={()=>generarPDFPrueba(salida,{sucursal,semana}).save('propuesta-prueba-no-oficial.pdf')}>Descargar PDF no oficial</button>
 </section>}
 <section><h2>Comparación AUX / EVENTUAL</h2><p>Política v1 de laboratorio: DIAS. Un AUX es comparable si puede atender caja sin descubrir la supervisión, comparte al menos una franja y tiene capacidad de caja todos los días en que el EVENTUAL puede atender. El total semanal del EVENTUAL no supera al de cada AUX comparable; nunca se usa un promedio ni un tope cero sin comparable. No homologada para producción.</p></section></main>
}
createRoot(document.getElementById('root')!).render(<App/> )
