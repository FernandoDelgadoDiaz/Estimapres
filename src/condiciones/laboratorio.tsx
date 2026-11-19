import {useState,type FormEvent} from 'react'
import {createRoot} from 'react-dom/client'
import {entradaDemo} from './demo'
import {prevalidarCondiciones,ErrorCondiciones} from '../algoritmo/condicionesSupervisor'
import {ejecutarAlgoritmo} from '../algoritmo/orquestador'
import type {CondicionSupervisor} from '../algoritmo/condicionesTipos'
import type {ResultadoSemanal} from '../algoritmo/types'
import '../contingencias/laboratorio.css'
const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
function App(){
 const [rows,setRows]=useState<CondicionSupervisor[]>([]),[mode,setMode]=useState<CondicionSupervisor['modo']>('DEBE'),[kind,setKind]=useState<CondicionSupervisor['tipo']>('franco'),[day,setDay]=useState(0),[turn,setTurn]=useState('mañana'),[cap,setCap]=useState(2),[error,setError]=useState(''),[result,setResult]=useState<ResultadoSemanal>()
 const input={...entradaDemo(),condiciones_supervisor:{version:1 as const,sucursal_id:'demo',semana:'2026-11-23',condiciones:rows,turnos:{mañana:{inicioMin:'09:00',inicioMax:'10:00',finMax:'16:00'},tarde:{inicioMin:'16:00',inicioMax:'18:00'}}}}
 function clear(){setResult(undefined);setError('')}
 function add(e:FormEvent){e.preventDefault();clear();setRows(old=>[...old,{id:crypto.randomUUID(),modo:mode,tipo:kind,colaboradorId:kind==='max_francos'?undefined:'p',desde:'2026-11-23',hasta:'2026-11-29',dia:kind==='franco'?day:undefined,valor:kind==='turno'?turn:kind==='max_francos'?cap:undefined}])}
 function generate(){clear();try{const p=prevalidarCondiciones(input);if(p.conflictos.length)throw new ErrorCondiciones('PREFLIGHT_BLOQUEADO',p.conflictos);setResult(ejecutarAlgoritmo(input))}catch(e){setError(e instanceof ErrorCondiciones?`${e.codigo}. ${e.conflictos.map(c=>`${c.codigo}${c.persona?' · '+c.persona:''}`).join('; ')}. Revisá o quitá las condiciones indicadas; Aliada no las cambia automáticamente.`:e instanceof Error?e.message:'Revisá las condiciones.')}}
 return <main><header><h1>Condiciones antes de generar</h1><p>Laboratorio aislado · Solo datos sintéticos</p></header><section><h2>Opcional</h2><p>Podés generar sin agregar ninguna condición. Nada se guarda ni publica. Semana de prueba: 23 al 29/11/2026.</p>
 <form onSubmit={add}><label>Colaborador<select disabled><option>Cajero de prueba · PART 32 h</option></select></label><label>Prioridad<select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);clear()}}><option value="DEBE">DEBE</option><option value="PREFERIRIA">PREFERIRÍA</option></select></label>
 <label>Condición<select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);clear()}}><option value="franco">Día de franco</option><option value="turno">Turno</option><option value="exclusion_manual">Gestionar manualmente toda la semana</option><option value="max_francos">Máximo de francos simultáneos</option></select></label>
 {kind==='franco'&&<label>Día<select value={day} onChange={e=>setDay(Number(e.target.value))}>{days.map((d,i)=><option key={d} value={i}>{d}</option>)}</select></label>}
 {kind==='turno'&&<label>Turno<select value={turn} onChange={e=>setTurn(e.target.value)}><option value="mañana">Mañana</option><option value="tarde">Tarde</option></select></label>}
 {kind==='max_francos'&&<label>Máximo diario<input type="number" min="0" max="160" value={cap} onChange={e=>setCap(Number(e.target.value))}/></label>}
 <button>Agregar condición</button></form><p>Ventanas configuradas solo para esta demostración: mañana, ingreso 09:00–10:00 y salida hasta 16:00; tarde, ingreso 16:00–18:00. Un turno no obliga a trabajar en el franco.</p>
 <ul>{rows.map((c,i)=><li key={c.id}>{c.modo==='DEBE'?'DEBE':'PREFERIRÍA'} · {c.tipo} · {c.dia!==undefined?days[c.dia]:c.valor??'Toda la semana'} <button className="neutro" onClick={()=>{clear();setRows(rows.filter((_,j)=>j!==i))}}>Quitar condición {i+1}</button></li>)}</ul>
 <button onClick={generate}>Verificar y generar prueba</button>{error&&<p role="alert">{error}</p>}</section>
 {result&&<section><h2>Propuesta de laboratorio</h2><p>No aprobada · No publicable · Sin guardados</p><p>Cobertura: {result.metricas.cobertura_total_pct.toFixed(2)} %. Preferencias incumplidas: {result.preferencias_manuales_incumplidas??0}.</p><table><thead><tr><th>Día</th><th>Caja · Cajero de prueba</th></tr></thead><tbody>{result.jornadas_part.p?.map(j=><tr key={j.dia}><td>{days[j.dia]}</td><td>{j.bloques.length?j.bloques.map(b=>`${8+b.slot_inicio/2}–${8+b.slot_fin/2}`).join(' / '):'Franco'}</td></tr>)}</tbody></table>{result.auditoria_condiciones?.excluidos.length!==0&&<p>Persona excluida del cálculo automático: su horario queda pendiente de gestión manual, sin inferir ausencia ni franco.</p>}</section>}
 <section><h2>Comparación AUX / EVENTUAL</h2><p>AH2-040-P1 es una propuesta pendiente de aprobación. Comparar personas con oportunidades compatibles y excluir al supervisor exclusivo; nunca usar un promedio grupal. No se aplica un límite nuevo en este laboratorio.</p></section></main>
}
createRoot(document.getElementById('root')!).render(<App/> )
