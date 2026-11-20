/**
 * Configuración del motor híbrido de la sucursal (AH2-042): reglas PERMANENTES y EXCEPCIONES TEMPORALES por fecha.
 * - Guardar, cambiar o desactivar pasa por una simulación previa (no puede crear conflictos con otras reglas) y por
 *   funciones atómicas de la base con control de versión (si otra pestaña cambió la regla, no se pisa).
 * - Cambiar una permanente desde una fecha cierra la anterior el día previo; nada se borra (historial).
 * - «Ver semana» muestra exactamente qué reglas rigen cada día y los conflictos que bloquearían la generación.
 */
import {useCallback,useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabase'
import {useEventuales} from '../../hooks/useEventuales'
import {useColaboradores} from '../../hooks/useColaboradores'
import {configuracionAutenticada} from '../../hibrido/integracion'
import {aplicarCambio,cargarConfiguracionMotor,ErrorConfigMotor,HORAS_GRILLA,importarFilas,proponerImportacion,resolverConfiguracion,TIPOS_CONDICION,
 type ClaseConfig,type FilaConfigMotor,type FranjaApertura,type NuevaFila,type TipoCondicion,type TipoConfig} from '../../hibrido/configuracionPersistente'

const DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const ETIQUETA:Record<TipoConfig,string>={topes_caja_eventual_contrato:'Máximos semanales de caja EVENTUAL',perfil_caja_eventual:'Disponibilidad de caja de un EVENTUAL',
 excepcion_apertura_aux_unico:'Apertura con AUX único (por día y franja)',condicion_supervisor:'Condición del supervisor'}
const CONDICION:Record<TipoCondicion,string>={franco:'Franco un día',turno:'Turno (ventana de ingreso y salida)',exclusion_manual:'Gestionar manualmente (fuera del cálculo, semana completa)',
 max_francos:'Máximo de francos simultáneos (sucursal)',franco_medio_corrido:'Franco y medio corrido (preferencia semanal, FULL)'}
const card:React.CSSProperties={background:'var(--card)',borderRadius:16,border:'1px solid var(--border)',boxShadow:'var(--shadow)',padding:24,marginBottom:24}
const lunesDe=(d:Date)=>{const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));return x.toISOString().slice(0,10)}
const proximoLunes=()=>{const d=new Date();d.setDate(d.getDate()+7);return lunesDe(d)}
const Hora=({value,onChange,label}:{value:string;onChange:(v:string)=>void;label:string})=><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{HORAS_GRILLA.map(h=><option key={h} value={h}>{h}</option>)}</select>

interface Reserva {dias:number[];desde:string;hasta:string}
interface Form {tipo:TipoConfig;clase:ClaseConfig;desde:string;hasta:string;motivo:string
 fullActivo:boolean;fullHoras:string;partActivo:boolean;partHoras:string
 persona:string;acreditacion:string;contratoOrigen:string;maxCaja:string;funcionMin:string;horasContrato:string;reservas:Reserva[]
 franjas:FranjaApertura[];modo:'DEBE'|'PREFERIRIA';condicion:TipoCondicion;dia:string;turnoNombre:string;inicioMin:string;inicioMax:string;finMax:string;maxFrancos:string;condicionId:string}
const VACIO=():Form=>({tipo:'topes_caja_eventual_contrato',clase:'permanente',desde:proximoLunes(),hasta:'',motivo:'',fullActivo:true,fullHoras:'12',partActivo:true,partHoras:'8',
 persona:'',acreditacion:'TODA_LA_PRESENCIA',contratoOrigen:'FULL',maxCaja:'',funcionMin:'',horasContrato:'',reservas:[],
 franjas:[0,1,2,3,4,5,6].map(dia=>({dia,desde:HORAS_GRILLA[0],hasta:HORAS_GRILLA[2]})),modo:'DEBE',condicion:'franco',dia:'0',turnoNombre:'mañana',inicioMin:HORAS_GRILLA[2],inicioMax:HORAS_GRILLA[4],finMax:'',maxFrancos:'2',condicionId:''})

/** Formulario → fila. Exportado para pruebas. */
export function filaDesdeFormulario(f:Form,sucursal:string):NuevaFila{
 const num=(s:string)=>s===''?undefined:Number(s)
 const base={sucursal_id:sucursal,clase:f.clase,tipo:f.tipo,vigencia_desde:f.desde,vigencia_hasta:f.hasta||null,motivo:f.motivo.trim()}
 if(f.tipo==='topes_caja_eventual_contrato')return {...base,colaborador_id:null,datos:{FULL:{activo:f.fullActivo,horas:f.fullActivo?num(f.fullHoras)??null:num(f.fullHoras)??null},PART:{activo:f.partActivo,horas:num(f.partHoras)??null}}}
 if(f.tipo==='perfil_caja_eventual'){
  const pmr=f.acreditacion==='PRESENCIA_MENOS_RESERVAS'
  return {...base,colaborador_id:f.persona||null,datos:{acreditacion:f.acreditacion,contratoOrigen:f.contratoOrigen||null,fuente:f.motivo.trim()||'Configuración de la sucursal en Aliada Horarios',
   ...(pmr&&f.reservas.length?{reservas:f.reservas.map(r=>({dias:[...r.dias].sort(),desde:r.desde,hasta:r.hasta}))}:{}),...(pmr&&num(f.funcionMin)!==undefined?{horasFuncionHabitualMinimas:num(f.funcionMin)}:{}),
   ...(num(f.maxCaja)!==undefined?{maxCajaHoras:num(f.maxCaja)}:{}),...(num(f.horasContrato)!==undefined?{horasContractuales:num(f.horasContrato)}:{})}}
 }
 if(f.tipo==='excepcion_apertura_aux_unico')return {...base,colaborador_id:null,datos:{franjas:f.franjas.map(x=>({dia:x.dia,desde:x.desde,hasta:x.hasta}))}}
 const sinPersona=f.condicion==='max_francos'
 return {...base,colaborador_id:sinPersona?null:f.persona||null,datos:{id:f.condicionId||`cond-${crypto.randomUUID().slice(0,8)}`,modo:f.modo,tipo:f.condicion,
  ...(sinPersona?{}:{colaboradorId:f.persona||undefined}),...(f.condicion==='franco'?{dia:Number(f.dia)}:{}),
  ...(f.condicion==='max_francos'?{valor:Number(f.maxFrancos)}:{}),
  ...(f.condicion==='turno'?{valor:f.turnoNombre.trim(),turno:{inicioMin:f.inicioMin,inicioMax:f.inicioMax,...(f.finMax?{finMax:f.finMax}:{})}}:{})}}
}
function formularioDesdeFila(x:FilaConfigMotor):Form{
 const f=VACIO(),d=x.datos as Record<string,any>
 Object.assign(f,{tipo:x.tipo,clase:x.clase,desde:x.vigencia_desde,hasta:x.vigencia_hasta??'',motivo:x.motivo,persona:x.colaborador_id??''})
 if(x.tipo==='topes_caja_eventual_contrato')Object.assign(f,{fullActivo:d.FULL.activo,fullHoras:String(d.FULL.horas??''),partActivo:d.PART.activo,partHoras:String(d.PART.horas??'')})
 if(x.tipo==='perfil_caja_eventual')Object.assign(f,{acreditacion:d.acreditacion,contratoOrigen:d.contratoOrigen??'',maxCaja:String(d.maxCajaHoras??''),funcionMin:String(d.horasFuncionHabitualMinimas??''),horasContrato:String(d.horasContractuales??''),reservas:d.reservas??[]})
 if(x.tipo==='excepcion_apertura_aux_unico')f.franjas=d.franjas
 if(x.tipo==='condicion_supervisor')Object.assign(f,{modo:d.modo,condicion:d.tipo,condicionId:d.id,dia:String(d.dia??0),maxFrancos:String(d.valor??2),turnoNombre:String(d.tipo==='turno'?d.valor:'mañana'),
  inicioMin:d.turno?.inicioMin??f.inicioMin,inicioMax:d.turno?.inicioMax??f.inicioMax,finMax:d.turno?.finMax??'',persona:d.colaboradorId??x.colaborador_id??''})
 return f
}

export function ConfiguracionMotorPanel({sucursal}:{sucursal:string}){
 const {eventuales}=useEventuales(),{colaboradores}=useColaboradores()
 const [usuario,setUsuario]=useState<string>(),[filas,setFilas]=useState<FilaConfigMotor[]>([]),[disponible,setDisponible]=useState<boolean>()
 const [error,setError]=useState(''),[aviso,setAviso]=useState(''),[ocupado,setOcupado]=useState(false)
 const [importacion,setImportacion]=useState<NuevaFila[]|null>(null)
 const [semana,setSemana]=useState(proximoLunes())
 const [f,setF]=useState<Form>(VACIO()),[editando,setEditando]=useState<FilaConfigMotor|null>(null)
 const nombre=useCallback((id:string|null)=>id?(eventuales.find(e=>e.id===id)?.nombre??colaboradores.find(c=>c.id===id)?.nombre??'persona no encontrada'):'Sucursal',[eventuales,colaboradores])

 const recargar=useCallback(async()=>{
  if(!supabase)return
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
 const vista=useMemo(()=>{try{return resolverConfiguracion(activas,sucursal,semana)}catch{return null}},[activas,sucursal,semana])
 async function ejecutar(fn:()=>Promise<unknown>,ok:string){
  setOcupado(true);setError('');setAviso('')
  try{await fn();setAviso(ok);setEditando(null);setF(VACIO())}
  catch(e){setError(e instanceof ErrorConfigMotor||e instanceof Error?e.message:'No se pudo guardar. No se aplicó ningún cambio.')}
  finally{setOcupado(false);await recargar()}
 }
 function guardar(){
  void ejecutar(async()=>{
   const nueva=filaDesdeFormulario(f,sucursal)
   if(editando)return aplicarCambio(supabase as never,filas,{tipo:'reemplazar',anterior:editando,fila:nueva},sucursal)
   // Una permanente nueva con el mismo alcance que otra vigente sin fin la reemplaza desde su fecha.
   const previa=nueva.clase==='permanente'&&nueva.tipo!=='condicion_supervisor'?activas.find(x=>x.clase==='permanente'&&x.tipo===nueva.tipo&&x.colaborador_id===nueva.colaborador_id&&x.vigencia_hasta===null&&x.vigencia_desde<nueva.vigencia_desde):undefined
   return aplicarCambio(supabase as never,filas,previa?{tipo:'reemplazar',anterior:previa,fila:nueva}:{tipo:'crear',fila:nueva},sucursal)
  },editando?'Regla cambiada desde la fecha indicada; la versión anterior quedó en el historial.':'Regla guardada.')
 }
 async function prepararImportacion(){
  setError('');setAviso('')
  try{const c=await configuracionAutenticada(sucursal);setImportacion(proponerImportacion(c.opcionesServicio,sucursal))}
  catch(e){setError(e instanceof Error?e.message:'No se pudo leer la configuración del servicio.')}
 }
 const set=(p:Partial<Form>)=>setF({...f,...p})

 if(disponible===false)return <section style={card} aria-label="Configuración del motor"><h2>Configuración del motor (sucursal {sucursal})</h2>
  <p>La persistencia todavía no está habilitada en la base (migración pendiente de aprobación). Mientras tanto se usa la configuración del servicio.</p></section>

 return <section style={card} aria-label="Configuración del motor">
  <h2 style={{marginTop:0}}>Configuración del motor (sucursal {sucursal})</h2>
  <p style={{color:'var(--text-muted)'}}>Las reglas <b>permanentes</b> rigen cada día desde su inicio, todas las semanas. Una <b>excepción temporal</b> rige solo en sus fechas (aunque empiece o termine a mitad de semana) y, esos días, reemplaza a la permanente de lo mismo. Nada se borra.</p>
  {error&&<p role="alert">{error}</p>}{aviso&&<p role="status">{aviso}</p>}
  {usuario&&!activas.length&&!importacion&&<div><p>Esta sucursal todavía no tiene reglas guardadas: el motor usa la configuración del servicio.</p>
   <button disabled={ocupado} onClick={()=>void prepararImportacion()}>Importar la configuración actual del servicio</button></div>}
  {importacion&&<div aria-label="Importación propuesta"><h3>Revisá antes de guardar ({importacion.length})</h3><ul>{importacion.map((x,i)=><li key={i}>{x.clase==='permanente'?'Permanente':'Temporal'} · {ETIQUETA[x.tipo]} · {nombre(x.colaborador_id)} · desde {x.vigencia_desde}{x.vigencia_hasta?` hasta ${x.vigencia_hasta}`:''}</li>)}</ul>
   <button disabled={ocupado} onClick={()=>void ejecutar(async()=>{await importarFilas(supabase as never,filas,importacion,sucursal);setImportacion(null)},'Configuración importada.')}>Confirmar importación</button> <button className="neutro" onClick={()=>setImportacion(null)}>Cancelar</button></div>}

  {(['permanente','temporal'] as const).map(cl=><div key={cl}><h3>{cl==='permanente'?'Reglas permanentes':'Excepciones temporales'}</h3>
   <ul>{activas.filter(x=>x.clase===cl).map(x=><li key={x.id}>{ETIQUETA[x.tipo]} · {nombre(x.colaborador_id)} · desde {x.vigencia_desde}{x.vigencia_hasta?` hasta ${x.vigencia_hasta}`:' (sin fin)'}{x.motivo?` · ${x.motivo}`:''} <code>{JSON.stringify(x.datos)}</code>{' '}
    <button className="neutro" disabled={ocupado} onClick={()=>{setEditando(x);setF({...formularioDesdeFila(x),desde:x.clase==='permanente'&&x.vigencia_desde<proximoLunes()?proximoLunes():x.vigencia_desde})}}>Cambiar</button>{' '}
    <button className="neutro" disabled={ocupado} onClick={()=>void ejecutar(()=>aplicarCambio(supabase as never,filas,{tipo:'desactivar',anterior:x},sucursal),'Regla desactivada; las demás no cambiaron.')}>Desactivar</button></li>)}
    {!activas.some(x=>x.clase===cl)&&<li>Ninguna.</li>}</ul></div>)}

  <h3>{editando?`Cambiar: ${ETIQUETA[editando.tipo]} · ${nombre(editando.colaborador_id)}`:'Agregar'}</h3>
  <form onSubmit={e=>{e.preventDefault();guardar()}} style={{display:'grid',gap:8}}>
   <label>Qué<select value={f.tipo} disabled={!!editando} onChange={e=>set({tipo:e.target.value as TipoConfig})}>{(Object.keys(ETIQUETA) as TipoConfig[]).map(t=><option key={t} value={t}>{ETIQUETA[t]}</option>)}</select></label>
   <label>Tipo de regla<select value={f.clase} disabled={!!editando} onChange={e=>set({clase:e.target.value as ClaseConfig})}><option value="permanente">Permanente</option><option value="temporal">Excepción temporal</option></select></label>
   <label>{editando?'Rige desde':'Desde'}<input type="date" required value={f.desde} onChange={e=>set({desde:e.target.value})}/></label>
   <label>Hasta{f.clase==='permanente'?' (vacío = sin fin)':''}<input type="date" required={f.clase==='temporal'} value={f.hasta} onChange={e=>set({hasta:e.target.value})}/></label>

   {f.tipo==='topes_caja_eventual_contrato'&&(['full','part'] as const).map(k=><fieldset key={k}><legend>EVENTUAL de contrato {k.toUpperCase()}</legend>
    <label><input type="checkbox" checked={f[`${k}Activo`]} onChange={e=>set({[`${k}Activo`]:e.target.checked} as Partial<Form>)}/> Aplicar máximo (desactivado = sin máximo, no 0 h)</label>
    <label>Horas semanales<input type="number" min="0" max="84" step="0.5" value={f[`${k}Horas`]} onChange={e=>set({[`${k}Horas`]:e.target.value} as Partial<Form>)}/></label></fieldset>)}

   {f.tipo==='perfil_caja_eventual'&&<>
    <label>Persona<select required value={f.persona} disabled={!!editando} onChange={e=>set({persona:e.target.value})}><option value="">Elegí…</option>{eventuales.filter(e=>e.activo).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
    <label>Disponibilidad para caja<select value={f.acreditacion} onChange={e=>set({acreditacion:e.target.value})}><option value="TODA_LA_PRESENCIA">Toda su presencia</option><option value="PRESENCIA_MENOS_RESERVAS">Su presencia menos reservas de su función habitual</option><option value="NO_ACREDITADA">No atiende caja</option></select></label>
    <label>Contrato de origen<select value={f.contratoOrigen} onChange={e=>set({contratoOrigen:e.target.value})}><option value="FULL">FULL</option><option value="PART">PART</option></select></label>
    <label>Horas de contrato (informativo, opcional)<input type="number" min="0" max="84" step="0.5" value={f.horasContrato} onChange={e=>set({horasContrato:e.target.value})}/></label>
    <label>Máximo individual de caja (h/semana, opcional)<input type="number" min="0" max="84" step="0.5" value={f.maxCaja} onChange={e=>set({maxCaja:e.target.value})}/></label>
    {f.acreditacion==='PRESENCIA_MENOS_RESERVAS'&&<fieldset><legend>Reservas de función habitual (no atiende caja en estas franjas)</legend>
     {f.reservas.map((r,i)=><div key={i} role="group" aria-label={`Reserva ${i+1}`}>{DIAS.map((d,di)=><label key={d}><input type="checkbox" checked={r.dias.includes(di)} onChange={e=>set({reservas:f.reservas.map((x,j)=>j!==i?x:{...x,dias:e.target.checked?[...x.dias,di]:x.dias.filter(y=>y!==di)})})}/>{d}</label>)}
      <Hora label={`Reserva ${i+1} desde`} value={r.desde} onChange={v=>set({reservas:f.reservas.map((x,j)=>j!==i?x:{...x,desde:v})})}/> a <Hora label={`Reserva ${i+1} hasta`} value={r.hasta} onChange={v=>set({reservas:f.reservas.map((x,j)=>j!==i?x:{...x,hasta:v})})}/>
      <button type="button" className="neutro" onClick={()=>set({reservas:f.reservas.filter((_,j)=>j!==i)})}>Quitar</button></div>)}
     <button type="button" className="neutro" onClick={()=>set({reservas:[...f.reservas,{dias:[0,1,2,3,4],desde:HORAS_GRILLA[2],hasta:HORAS_GRILLA[6]}]})}>Agregar reserva horaria</button>
     <label>Mínimo semanal de función habitual (h, opcional)<input type="number" min="0" max="84" step="0.5" value={f.funcionMin} onChange={e=>set({funcionMin:e.target.value})}/></label>
    </fieldset>}
   </>}

   {f.tipo==='excepcion_apertura_aux_unico'&&<fieldset><legend>Franjas por día en que un AUX único puede atender caja sentado</legend>
    <p className="nota">La franja admitida la valida el motor (hoy, la apertura del día). Un día sin franjas no tiene excepción.</p>
    {f.franjas.map((x,i)=><div key={i} role="group" aria-label={`Franja ${i+1}`}><select aria-label={`Franja ${i+1} día`} value={x.dia} onChange={e=>set({franjas:f.franjas.map((y,j)=>j!==i?y:{...y,dia:Number(e.target.value)})})}>{DIAS.map((d,di)=><option key={d} value={di}>{d}</option>)}</select>
     <Hora label={`Franja ${i+1} desde`} value={x.desde} onChange={v=>set({franjas:f.franjas.map((y,j)=>j!==i?y:{...y,desde:v})})}/> a <Hora label={`Franja ${i+1} hasta`} value={x.hasta} onChange={v=>set({franjas:f.franjas.map((y,j)=>j!==i?y:{...y,hasta:v})})}/>
     <button type="button" className="neutro" onClick={()=>set({franjas:f.franjas.filter((_,j)=>j!==i)})}>Quitar</button></div>)}
    <button type="button" className="neutro" onClick={()=>set({franjas:[...f.franjas,{dia:0,desde:HORAS_GRILLA[0],hasta:HORAS_GRILLA[2]}]})}>Agregar franja</button>
   </fieldset>}

   {f.tipo==='condicion_supervisor'&&<>
    <label>Condición<select value={f.condicion} disabled={!!editando} onChange={e=>{const c=e.target.value as TipoCondicion;set({condicion:c,modo:c==='franco_medio_corrido'?'PREFERIRIA':c==='exclusion_manual'||c==='max_francos'?'DEBE':f.modo})}}>{TIPOS_CONDICION.map(t=><option key={t} value={t}>{CONDICION[t]}</option>)}</select></label>
    <label>Prioridad<select value={f.modo} disabled={['exclusion_manual','max_francos','franco_medio_corrido'].includes(f.condicion)} onChange={e=>set({modo:e.target.value as Form['modo']})}><option value="DEBE">DEBE (obligatoria)</option><option value="PREFERIRIA">PREFERIRÍA (preferencia)</option></select></label>
    {f.condicion!=='max_francos'&&<label>Persona<select required value={f.persona} disabled={!!editando} onChange={e=>set({persona:e.target.value})}><option value="">Elegí…</option>{colaboradores.filter(c=>f.condicion==='franco_medio_corrido'?c.tipo==='FULL':c.tipo==='FULL'||c.tipo==='PART').map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>}
    {f.condicion==='franco'&&<label>Día<select value={f.dia} onChange={e=>set({dia:e.target.value})}>{DIAS.map((d,i)=><option key={d} value={i}>{d}</option>)}</select></label>}
    {f.condicion==='max_francos'&&<label>Máximo de francos por día<input type="number" min="0" max="160" value={f.maxFrancos} onChange={e=>set({maxFrancos:e.target.value})}/></label>}
    {f.condicion==='turno'&&<fieldset><legend>Turno</legend><label>Nombre<input required value={f.turnoNombre} onChange={e=>set({turnoNombre:e.target.value})}/></label>
     <label>Ingreso desde <Hora label="Ingreso desde" value={f.inicioMin} onChange={v=>set({inicioMin:v})}/></label><label>Ingreso hasta <Hora label="Ingreso hasta" value={f.inicioMax} onChange={v=>set({inicioMax:v})}/></label>
     <label>Salida hasta (opcional)<select aria-label="Salida hasta" value={f.finMax} onChange={e=>set({finMax:e.target.value})}><option value="">Sin límite</option>{HORAS_GRILLA.map(h=><option key={h} value={h}>{h}</option>)}</select></label></fieldset>}
   </>}
   <label>Motivo (opcional)<input maxLength={500} value={f.motivo} onChange={e=>set({motivo:e.target.value})}/></label>
   <div><button disabled={ocupado||!usuario}>{editando?'Guardar cambio':'Guardar'}</button>{editando&&<> <button type="button" className="neutro" onClick={()=>{setEditando(null);setF(VACIO())}}>Cancelar</button></>}</div>
  </form>

  <h3>Ver semana</h3>
  <label>Lunes<input type="date" value={semana} onChange={e=>setSemana(lunesDe(new Date(`${e.target.value}T12:00:00`)))}/></label>
  {vista&&vista.conflictos.length>0&&<div role="alert"><p>Conflictos que bloquean la generación híbrida esta semana:</p><ul>{vista.conflictos.map((c,i)=><li key={i}>{ETIQUETA[c.tipo]} · {nombre(c.colaboradorId)}: {c.detalle}</li>)}</ul></div>}
  {vista&&<ul>{vista.traza.map(t=><li key={t.filaId+t.dias.join()}>{t.clase==='temporal'?'Excepción':'Permanente'} · {ETIQUETA[t.tipo]} · {nombre(t.colaboradorId)} · {t.dias.length===7?'toda la semana':t.dias.map(d=>DIAS[d]).join(', ')}</li>)}{!vista.traza.length&&<li>Sin reglas para esta semana.</li>}</ul>}
  {vista?.notas.map((n,i)=><p key={i} className="nota">{n}</p>)}
  {filas.some(x=>!x.activa||(x.clase==='permanente'&&x.vigencia_hasta!==null))&&<details><summary>Historial</summary><ul>{filas.filter(x=>!x.activa||(x.clase==='permanente'&&x.vigencia_hasta!==null)).map(x=><li key={x.id}>{ETIQUETA[x.tipo]} · {nombre(x.colaborador_id)} · {x.vigencia_desde}–{x.vigencia_hasta??'…'} · {x.activa?'cerrada por un cambio':'desactivada'}{x.reemplaza_a?' · reemplaza a una versión anterior':''}</li>)}</ul></details>}
 </section>
}
