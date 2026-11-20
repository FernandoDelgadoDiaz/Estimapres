/**
 * Configuración del motor híbrido de la sucursal (AH2-042): reglas PERMANENTES y EXCEPCIONES TEMPORALES,
 * guardadas en Supabase (`configuracion_motor_sucursal`). Sin recarga semanal ni Secret Manager.
 * - Agregar una permanente con el mismo alcance que otra vigente la reemplaza desde la fecha indicada
 *   (la anterior se cierra el día previo; nada se borra).
 * - Una excepción temporal reemplaza a la permanente solo durante su vigencia.
 * - «Ver semana» muestra exactamente lo que recibirá el motor para ese lunes.
 */
import {useCallback,useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabase'
import {useEventuales} from '../../hooks/useEventuales'
import {useColaboradores} from '../../hooks/useColaboradores'
import {configuracionAutenticada} from '../../hibrido/integracion'
import {cargarConfiguracionMotor,desactivarFila,ErrorConfigMotor,guardarFilas,proponerImportacion,reemplazarDesde,resolverConfiguracion,
 type ClaseConfig,type FilaConfigMotor,type NuevaFila,type TipoConfig} from '../../hibrido/configuracionPersistente'

const DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const ETIQUETA:Record<TipoConfig,string>={topes_caja_eventual_contrato:'Máximos semanales de caja EVENTUAL',perfil_caja_eventual:'Disponibilidad de caja de un EVENTUAL',
 excepcion_apertura_aux_unico:'Apertura 08:00–09:00 con AUX único',condicion_supervisor:'Condición del supervisor'}
const card:React.CSSProperties={background:'var(--card)',borderRadius:16,border:'1px solid var(--border)',boxShadow:'var(--shadow)',padding:24,marginBottom:24}
const proximoLunes=()=>{const d=new Date();d.setDate(d.getDate()+((8-d.getDay())%7||7));return d.toISOString().slice(0,10)}

export function ConfiguracionMotorPanel({sucursal}:{sucursal:string}){
 const {eventuales}=useEventuales(),{colaboradores}=useColaboradores()
 const [usuario,setUsuario]=useState<string>(),[filas,setFilas]=useState<FilaConfigMotor[]>([]),[disponible,setDisponible]=useState<boolean>()
 const [error,setError]=useState(''),[aviso,setAviso]=useState(''),[ocupado,setOcupado]=useState(false)
 const [importacion,setImportacion]=useState<NuevaFila[]|null>(null)
 const [semana,setSemana]=useState(proximoLunes())
 const [f,setF]=useState({tipo:'topes_caja_eventual_contrato' as TipoConfig,clase:'permanente' as ClaseConfig,desde:proximoLunes(),hasta:'',motivo:'',
  fullActivo:true,fullHoras:'12',partActivo:true,partHoras:'8',persona:'',acreditacion:'TODA_LA_PRESENCIA',contratoOrigen:'FULL',maxCaja:'',dias:[0,1,2,3,4,5,6] as number[],condicion:'exclusion_manual',dia:'0'})
 const nombre=useCallback((id:string|null)=>id?(eventuales.find(e=>e.id===id)?.nombre??colaboradores.find(c=>c.id===id)?.nombre??'persona no encontrada'):'Sucursal',[eventuales,colaboradores])

 const recargar=useCallback(async()=>{
  if(!supabase)return
  setError('')
  try{
   const {data:{user}}=await supabase.auth.getUser()
   if(!user||user.is_anonymous){setError('Iniciá sesión para ver la configuración del motor.');return}
   setUsuario(user.id)
   const r=await cargarConfiguracionMotor(supabase,user.id,sucursal)
   setDisponible(r.disponible);setFilas(r.filas)
  }catch(e){setError(e instanceof Error?e.message:'No se pudo leer la configuración.')}
 },[sucursal])
 useEffect(()=>{void recargar()},[recargar])

 const activas=filas.filter(x=>x.activa)
 const vista=useMemo(()=>{try{return activas.length?{r:resolverConfiguracion(activas,sucursal,semana)}:null}catch(e){return {e:e instanceof Error?e.message:'Configuración inválida.'}}},[activas,sucursal,semana])

 async function ejecutar(fn:()=>Promise<void>,ok:string){setOcupado(true);setError('');setAviso('');try{await fn();setAviso(ok);await recargar()}catch(e){setError(e instanceof ErrorConfigMotor||e instanceof Error?e.message:'No se pudo guardar.')}finally{setOcupado(false)}}

 function construir():NuevaFila{
  const base={sucursal_id:sucursal,clase:f.clase,tipo:f.tipo,vigencia_desde:f.desde,vigencia_hasta:f.hasta||null,activa:true,motivo:f.motivo.trim()}
  if(f.tipo==='topes_caja_eventual_contrato')return {...base,colaborador_id:null,datos:{FULL:{activo:f.fullActivo,horas:f.fullHoras===''?null:Number(f.fullHoras)},PART:{activo:f.partActivo,horas:f.partHoras===''?null:Number(f.partHoras)}}}
  if(f.tipo==='perfil_caja_eventual')return {...base,colaborador_id:f.persona||null,datos:{acreditacion:f.acreditacion,contratoOrigen:f.contratoOrigen||null,fuente:f.motivo.trim()||'Configuración de la sucursal en Aliada Horarios',...(f.maxCaja!==''?{maxCajaHoras:Number(f.maxCaja)}:{})}}
  if(f.tipo==='excepcion_apertura_aux_unico')return {...base,colaborador_id:null,datos:{dias:[...f.dias].sort()}}
  return {...base,colaborador_id:f.persona||null,datos:{id:`cond-${crypto.randomUUID().slice(0,8)}`,modo:'DEBE',tipo:f.condicion,colaboradorId:f.persona||undefined,...(f.condicion==='franco'?{dia:Number(f.dia)}:{})}}
 }
 function agregar(){
  void ejecutar(async()=>{
   const nueva=construir()
   const previa=nueva.clase==='permanente'&&nueva.tipo!=='condicion_supervisor'?activas.find(x=>x.clase==='permanente'&&x.tipo===nueva.tipo&&x.colaborador_id===nueva.colaborador_id&&x.vigencia_hasta===null):undefined
   if(previa)await reemplazarDesde(supabase!,previa,nueva);else await guardarFilas(supabase!,[nueva])
  },'Configuración guardada. Rige desde la fecha indicada para todas las semanas siguientes que correspondan.')
 }
 async function prepararImportacion(){
  setError('');setAviso('')
  try{const c=await configuracionAutenticada(sucursal);setImportacion(proponerImportacion(c.opcionesServicio,sucursal))}
  catch(e){setError(e instanceof Error?e.message:'No se pudo leer la configuración del servicio.')}
 }

 if(disponible===false)return <section style={card} aria-label="Configuración del motor"><h2>Configuración del motor (sucursal {sucursal})</h2>
  <p>La persistencia todavía no está habilitada en la base (migración pendiente de aprobación). Mientras tanto se usa la configuración del servicio.</p></section>

 return <section style={card} aria-label="Configuración del motor">
  <h2 style={{marginTop:0}}>Configuración del motor (sucursal {sucursal})</h2>
  <p style={{color:'var(--text-muted)'}}>Las reglas <b>permanentes</b> rigen todas las semanas desde su inicio, sin recargarlas. Una <b>excepción temporal</b> reemplaza a la permanente del mismo alcance solo durante sus fechas. Nada se borra: los cambios quedan en el historial.</p>
  {error&&<p role="alert">{error}</p>}{aviso&&<p role="status">{aviso}</p>}
  {usuario&&!activas.length&&<div><p>Esta sucursal todavía no tiene reglas guardadas: el motor usa la configuración del servicio.</p>
   <button disabled={ocupado} onClick={()=>void prepararImportacion()}>Importar la configuración actual del servicio</button></div>}
  {importacion&&<div aria-label="Importación propuesta"><h3>Revisá antes de guardar ({importacion.length})</h3><ul>{importacion.map((x,i)=><li key={i}>{x.clase==='permanente'?'Permanente':'Temporal'} · {ETIQUETA[x.tipo]} · {nombre(x.colaborador_id)} · desde {x.vigencia_desde}{x.vigencia_hasta?` hasta ${x.vigencia_hasta}`:''}</li>)}</ul>
   <button disabled={ocupado} onClick={()=>void ejecutar(async()=>{await guardarFilas(supabase!,importacion);setImportacion(null)},'Configuración importada.')}>Confirmar importación</button> <button className="neutro" onClick={()=>setImportacion(null)}>Cancelar</button></div>}

  {(['permanente','temporal'] as const).map(cl=><div key={cl}><h3>{cl==='permanente'?'Reglas permanentes':'Excepciones temporales'}</h3>
   <ul>{activas.filter(x=>x.clase===cl).map(x=><li key={x.id}>{ETIQUETA[x.tipo]} · {nombre(x.colaborador_id)} · desde {x.vigencia_desde}{x.vigencia_hasta?` hasta ${x.vigencia_hasta}`:' (sin fin)'} · <code>{JSON.stringify(x.datos)}</code>{x.motivo?` · ${x.motivo}`:''} <button className="neutro" disabled={ocupado} onClick={()=>void ejecutar(()=>desactivarFila(supabase!,x.id),'Configuración desactivada.')}>Desactivar</button></li>)}
    {!activas.some(x=>x.clase===cl)&&<li>Ninguna.</li>}</ul></div>)}

  <h3>Agregar o cambiar</h3>
  <form onSubmit={e=>{e.preventDefault();agregar()}} style={{display:'grid',gap:8}}>
   <label>Qué<select value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value as TipoConfig})}>{(Object.keys(ETIQUETA) as TipoConfig[]).map(t=><option key={t} value={t}>{ETIQUETA[t]}</option>)}</select></label>
   <label>Tipo de regla<select value={f.clase} onChange={e=>setF({...f,clase:e.target.value as ClaseConfig})}><option value="permanente">Permanente</option><option value="temporal">Excepción temporal</option></select></label>
   <label>Desde<input type="date" required value={f.desde} onChange={e=>setF({...f,desde:e.target.value})}/></label>
   <label>Hasta{f.clase==='permanente'?' (vacío = sin fin)':''}<input type="date" required={f.clase==='temporal'} value={f.hasta} onChange={e=>setF({...f,hasta:e.target.value})}/></label>
   {f.tipo==='topes_caja_eventual_contrato'&&(['full','part'] as const).map(k=><fieldset key={k}><legend>EVENTUAL de contrato {k.toUpperCase()}</legend>
    <label><input type="checkbox" checked={f[`${k}Activo`]} onChange={e=>setF({...f,[`${k}Activo`]:e.target.checked})}/> Aplicar máximo (desactivado = sin máximo, no 0 h)</label>
    <label>Horas semanales<input type="number" min="0" max="84" step="0.5" value={f[`${k}Horas`]} onChange={e=>setF({...f,[`${k}Horas`]:e.target.value})}/></label></fieldset>)}
   {(f.tipo==='perfil_caja_eventual'||f.tipo==='condicion_supervisor')&&<label>Persona<select required value={f.persona} onChange={e=>setF({...f,persona:e.target.value})}><option value="">Elegí…</option>
    {(f.tipo==='perfil_caja_eventual'?eventuales.filter(e=>e.activo):colaboradores.filter(c=>c.tipo==='FULL'||c.tipo==='PART')).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>}
   {f.tipo==='perfil_caja_eventual'&&<><label>Disponibilidad para caja<select value={f.acreditacion} onChange={e=>setF({...f,acreditacion:e.target.value})}><option value="TODA_LA_PRESENCIA">Toda su presencia</option><option value="NO_ACREDITADA">No atiende caja</option></select></label>
    <label>Contrato de origen<select value={f.contratoOrigen} onChange={e=>setF({...f,contratoOrigen:e.target.value})}><option value="FULL">FULL</option><option value="PART">PART</option></select></label>
    <label>Máximo individual (h, opcional)<input type="number" min="0" max="84" step="0.5" value={f.maxCaja} onChange={e=>setF({...f,maxCaja:e.target.value})}/></label></>}
   {f.tipo==='excepcion_apertura_aux_unico'&&<fieldset><legend>Días</legend>{DIAS.map((d,i)=><label key={d}><input type="checkbox" checked={f.dias.includes(i)} onChange={e=>setF({...f,dias:e.target.checked?[...f.dias,i]:f.dias.filter(x=>x!==i)})}/> {d}</label>)}</fieldset>}
   {f.tipo==='condicion_supervisor'&&<><label>Condición<select value={f.condicion} onChange={e=>setF({...f,condicion:e.target.value})}><option value="exclusion_manual">Gestionar manualmente (fuera del cálculo)</option><option value="franco">Franco obligatorio un día</option></select></label>
    {f.condicion==='franco'&&<label>Día<select value={f.dia} onChange={e=>setF({...f,dia:e.target.value})}>{DIAS.map((d,i)=><option key={d} value={i}>{d}</option>)}</select></label>}</>}
   <label>Motivo (opcional)<input value={f.motivo} onChange={e=>setF({...f,motivo:e.target.value})}/></label>
   <button disabled={ocupado||!usuario}>Guardar</button>
  </form>

  <h3>Ver semana</h3>
  <label>Lunes<input type="date" value={semana} onChange={e=>setSemana(e.target.value)}/></label>
  {vista&&'e' in vista&&<p role="alert">{vista.e}</p>}
  {vista&&'r' in vista&&vista.r&&<ul>{vista.r.traza.map(t=><li key={t.filaId}>{t.clase==='temporal'?'Excepción':'Permanente'} · {ETIQUETA[t.tipo]} · {nombre(t.colaboradorId)}</li>)}</ul>}
  {filas.some(x=>!x.activa||x.vigencia_hasta!==null&&x.clase==='permanente')&&<details><summary>Historial</summary><ul>{filas.filter(x=>!x.activa||x.vigencia_hasta!==null&&x.clase==='permanente').map(x=><li key={x.id}>{ETIQUETA[x.tipo]} · {nombre(x.colaborador_id)} · {x.vigencia_desde}–{x.vigencia_hasta??'…'} · {x.activa?'cerrada':'desactivada'}</li>)}</ul></details>}
 </section>
}
