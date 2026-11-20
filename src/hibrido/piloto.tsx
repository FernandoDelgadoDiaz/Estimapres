/** Entrada de preview separada: sesión obligatoria, lecturas con RLS y servicio HTTP real. */
import {useEffect,useRef,useState,type FormEvent} from 'react'
import {createRoot} from 'react-dom/client'
import {supabase} from '../lib/supabase'
import {extraerNecesidadDesdePDF,type ResultadoParseoPDF} from '../utils/pdfParser'
import {convertirInputAV2,type OpcionesGeneracion} from '../algoritmo/adapter'
import {capFrancosDeReglas,configOperativaDeReglas,demandaMinimaDeReglas,reglasAExcepciones,validarConflictosReglas} from '../utils/preferencias'
import {cargarDatosPiloto} from './pilotoDatos'
import {generarPropuestaHibrida,type SalidaUnica} from './orquestador'
import {transporteHttpPiloto} from './transporteHttpPiloto'
import {generarPDFPrueba,grillaPlan} from './pdfPrueba'
import {editarTopes,topesVigentes,type EdicionTopes} from './topesContrato'
import './piloto.css'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl

const usuario=import.meta.env.VITE_AH2_PILOT_USER as string|undefined
const sucursal=import.meta.env.VITE_AH2_PILOT_BRANCH as string|undefined
const servicio=import.meta.env.VITE_AH2_PILOT_SERVICE as string|undefined
const dias=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
function App(){
 const [sesion,setSesion]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('')
 const [datos,setDatos]=useState<Awaited<ReturnType<typeof cargarDatosPiloto>>>(),[pom,setPom]=useState<ResultadoParseoPDF>(),[salida,setSalida]=useState<SalidaUnica>()
 const [config,setConfig]=useState<OpcionesGeneracion>({}),[topes,setTopes]=useState<EdicionTopes|null>(null),[ocupado,setOcupado]=useState(false),[estado,setEstado]=useState('')
 const [nombres,setNombres]=useState<Record<string,string>>({})
 const abort=useRef<AbortController|null>(null)
 const configurado=!!(supabase&&usuario&&sucursal&&servicio?.startsWith('https://'))
 async function cargar(){if(!configurado)return;try{setDatos(await cargarDatosPiloto(usuario!,sucursal!));setSesion(true)}catch{setSesion(false);setDatos(undefined);setError('La cuenta no tiene acceso al piloto o no pudo validarse la sesión.')}}
 useEffect(()=>{void cargar();const sub=supabase?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){abort.current?.abort();setSesion(false);setDatos(undefined);setSalida(undefined);setNombres({});setPom(undefined);setConfig({});setTopes(null)}});return()=>{abort.current?.abort();sub?.data.subscription.unsubscribe()}},[])
 async function login(e:FormEvent){e.preventDefault();setError('');if(!supabase)return;const r=await supabase.auth.signInWithPassword({email,password});setPassword('');if(r.error)return setError('No se pudo iniciar sesión.');await cargar()}
 async function leerPDF(file:File|undefined){setError('');setSalida(undefined);setPom(undefined);if(!file)return;setOcupado(true);try{const p=await extraerNecesidadDesdePDF(file);if(!p.semana.ok)throw new Error('La semana del POM no se identifica de forma inequívoca.');setPom(p)}catch(e){setError(e instanceof Error?e.message:'No se pudo leer el PDF.')}finally{setOcupado(false)}}
 async function leerConfig(file:File|undefined){setError('');setSalida(undefined);if(!file)return;try{const x=JSON.parse(await file.text()),c=x.opciones??x;const keys=['disponibilidad_caja_eventual','topes_caja_eventual_contrato','condiciones_supervisor','excepcion_apertura_aux_unico'];setConfig(Object.fromEntries(keys.filter(k=>c[k]!==undefined).map(k=>[k,c[k]])));setTopes(null)}catch{setError('La configuración privada no es válida.')}}
 let maxima:EdicionTopes|null=null
 try{if(pom?.semana.ok)maxima=topes??topesVigentes(config.topes_caja_eventual_contrato,sucursal!,pom.semana.semana.lunes)}catch{/* generar explica el error */}
 async function generar(){
  if(!datos||!pom?.semana.ok||!servicio||!supabase)return
  setError('');setSalida(undefined);setOcupado(true);const ctrl=new AbortController();abort.current=ctrl
  try{
   // Releer la cuenta evita usar una dotación anterior a cambios del supervisor.
   const actual=await cargarDatosPiloto(usuario!,sucursal!);setDatos(actual)
   const semana=pom.semana.semana.lunes
   const conflictos=validarConflictosReglas(actual.reglas,actual.cajeros)
   if(conflictos.length)throw new Error(conflictos.join(' '))
   const topesCaja=topes?editarTopes(config.topes_caja_eventual_contrato,sucursal!,semana,topes):config.topes_caja_eventual_contrato
   const input=convertirInputAV2(pom.franjas,actual.cajeros,actual.auxiliares,actual.eventuales,reglasAExcepciones(actual.reglas,semana),{
    ...configOperativaDeReglas(actual.reglas,semana),maxFrancosDia:capFrancosDeReglas(actual.reglas,semana),demandaMinima:demandaMinimaDeReglas(actual.reglas,semana),
    politica_recursos_version:1,...config,topes_caja_eventual_contrato:topesCaja,sucursal_id:sucursal!,semana,
   })
   input.equilibrio_semanal_version=1
   setNombres(Object.fromEntries(input.colaboradores.map(c=>[c.id,c.nombre])))
   const token=async()=>{const {data:{session}}=await supabase!.auth.getSession();if(!session)throw new Error('La sesión venció.');return session.access_token}
   const s=await generarPropuestaHibrida(input,{id:crypto.randomUUID(),sucursal:sucursal!,timeoutMs:150000,parametros:{segundos:120,modo:'global',semilla:20261119},
    transporte:transporteHttpPiloto(servicio,token,ctrl.signal),onProgreso:e=>setEstado(e.etapa==='A_INICIO'?'Preparando propuesta inicial…':e.etapa==='B_ENVIO'?'Buscando mejores horarios…':e.etapa==='B_FASE'?'Optimizando cobertura y distribución semanal…':'Revisando la propuesta…')})
   setSalida(s)
  }catch(e){setError(e instanceof Error?e.message:'No se pudo generar.')}finally{setOcupado(false);setEstado('');abort.current=null}
 }
 return <main><header><span>ALIADA HORARIOS</span><h1>Piloto privado</h1><p>Prueba no oficial · Sucursal {sucursal??'sin configurar'}</p></header>
  {!configurado?<section role="alert">El acceso privado todavía no está habilitado. Faltan el servicio y la configuración del piloto.</section>:!sesion?<section><h2>Ingresá a tu cuenta</h2><form onSubmit={login}><label>Correo<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button>Ingresar</button></form></section>:<>
   <section><h2>Cargá el PDF de POM</h2><label className="file">Seleccionar PDF<input type="file" accept="application/pdf,.pdf" disabled={ocupado} onChange={e=>leerPDF(e.target.files?.[0])}/></label>
    {pom?.semana.ok&&<p>Semana del {pom.semana.semana.lunes} al {pom.semana.semana.domingo} · {pom.horasCaja} horas-caja de demanda.</p>}
    {datos&&<p>Dotación activa: {datos.cajeros.length} cajeros, {datos.auxiliares.length} auxiliares y {datos.eventuales.length} eventuales.</p>}
   </section>
   <details><summary>Configuración de prueba</summary><p>Configuración privada reutilizable. Se aplica en esta sesión; todavía no se guarda en la cuenta.</p><label>Configuración aprobada<input type="file" accept="application/json,.json" disabled={ocupado} onChange={e=>leerConfig(e.target.files?.[0])}/></label>
    {maxima&&(['FULL','PART'] as const).map(k=><fieldset key={k}><legend>Máximo de caja EVENTUAL {k}</legend><label><input type="checkbox" checked={maxima![k].activo} disabled={ocupado} onChange={e=>{setSalida(undefined);setTopes({...maxima!,[k]:{...maxima![k],activo:e.target.checked}})}}/> Aplicar máximo</label><label>Horas semanales<input type="number" min="0" max="84" step="0.5" disabled={ocupado||!maxima![k].activo} value={maxima![k].horas??''} onChange={e=>{setSalida(undefined);setTopes({...maxima!,[k]:{...maxima![k],horas:e.target.value===''?null:Number(e.target.value)}})}}/></label></fieldset>)}
   </details>
   <button disabled={ocupado||!pom} onClick={generar}>Generar mejores horarios</button>{ocupado&&<><p role="status">{estado||'Preparando…'}</p><button className="secondary" onClick={()=>abort.current?.abort()}>Cancelar búsqueda</button></>}
   {salida&&<section><h2>Propuesta para revisar</h2><p>{salida.estadoB==='ERROR_TRANSPORTE'||salida.estadoB==='TIMEOUT'?'El servicio no completó la búsqueda. Se muestra la propuesta inicial disponible.':salida.origen==='B'?'Se encontró una propuesta mejor.':'Se conserva la propuesta inicial válida.'}</p><p>Cobertura {salida.coberturaPomPct?.toFixed(2)} % · Faltantes {salida.faltantesHoras} h · Sobrantes {salida.sobrantesHoras} h.</p>
    {salida.bloqueos.length>0&&<p role="alert">Datos pendientes: {salida.bloqueos.join(', ')}.</p>}
    {salida.equilibrioSemanal&&<div className="scroll"><table><thead><tr><th>Día</th><th>Demanda</th><th>Faltantes</th><th>Cobertura</th></tr></thead><tbody>{salida.equilibrioSemanal.porDia.map(d=><tr key={d.dia}><td>{dias[d.dia]}{d.diaPico?' · pico':''}</td><td>{d.demandaHoras} h</td><td>{d.faltantesHoras} h</td><td>{d.coberturaPct.toFixed(1)} %</td></tr>)}</tbody></table></div>}
    {salida.propuesta&&<><div className="scroll"><table><thead><tr>{['Persona','Rol',...dias].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{grillaPlan(salida.propuesta).map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{j===0?(nombres[v]??v):v}</td>)}</tr>)}</tbody></table></div><button onClick={()=>generarPDFPrueba(salida,{sucursal:sucursal!,nombres,semana:pom!.semana.ok?pom!.semana.semana.lunes:''}).save('horario-prueba.pdf')}>Descargar PDF de prueba</button></>}
    <p>Sin aprobación ni publicación oficial. Descanso del domingo anterior sin verificar cuando no hay antecedente. Validación jurídica pendiente.</p>
   </section>}
  </>}
  {error&&<p role="alert">{error}</p>}
 </main>
}
createRoot(document.getElementById('root')!).render(<App/> )
