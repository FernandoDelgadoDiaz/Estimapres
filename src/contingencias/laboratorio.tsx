import { useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { bloques, cobertura, medir, preparar, tiposAusencia, type Ausencia, type SolicitudContingencia } from './modelo'
import { repararA } from './reparar'
import { aprobarPrueba } from './versionLocal'
import demo from './semana-demo.json'
import './laboratorio.css'

const snapshot = demo as SolicitudContingencia['snapshot']
const notificacion = '2026-11-16T18:00:00-03:00'
const actor = 'Supervisor de prueba'
const labels: Record<Ausencia['tipo'],string> = { licencia: 'Licencia', indisponibilidad: 'Indisponibilidad', otra: 'Otra ausencia' }
const horas = (slots: number) => new Intl.NumberFormat('es-AR').format(slots/2)
const hora = (slot: number) => `${String(8 + Math.floor(slot/2)).padStart(2,'0')}:${slot%2?'30':'00'}`
const jornada = (b: [number,number][]) => b.length ? b.map(([a,z]) => `${hora(a)}–${hora(z)}`).join(' / ') : 'Franco o sin asignación'

function App() {
  const [events, setEvents] = useState<Ausencia[]>([])
  const [journal, setJournal] = useState<{ id: string; accion: string; actor: string; instante: string }[]>([])
  const [person, setPerson] = useState(snapshot.input.colaboradores[0].id)
  const [kind, setKind] = useState<Ausencia['tipo']>('licencia')
  const [start, setStart] = useState('2026-11-16')
  const [end, setEnd] = useState('2026-11-18')
  const [editing, setEditing] = useState<string>()
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReturnType<typeof repararA>>()
  const [approvals, setApprovals] = useState<ReturnType<typeof aprobarPrueba>[]>([])
  const [approved, setApproved] = useState(false)
  const request = { snapshot, aviso: notificacion, zona: 'America/Argentina/Rio_Gallegos', ausencias: events }
  const context = preparar(request)
  const impact = medir(snapshot.baseline, context)
  function record(next: Ausencia[], id: string, accion: string) {
    preparar({ ...request, ausencias: next })
    setEvents(next)
    setJournal(j => [...j,{ id, accion, actor, instante: new Date().toISOString() }])
    setResult(undefined)
    setApproved(false)
    setEditing(undefined)
    setError('')
  }
  function save(e: FormEvent) {
    e.preventDefault()
    const id = editing ?? `aus-${events.length+1}`
    const entry: Ausencia = { id, persona: person, tipo: kind, desde: start, hasta: end, estado: 'confirmada' }
    try { record([...events.filter(x => x.id !== id),entry],id,editing ? 'Modificada' : 'Registrada') }
    catch { setError('Revisá el intervalo de fechas de la ausencia.') }
  }
  const supportSlots = (row: number[]) => row.filter((s,i) => i===0 || row[i-1]!==s-1).map(s => {
    let end=s+1
    while (row.includes(end)) end++
    return [s,end] as [number,number]
  })
  const changes = result ? snapshot.input.colaboradores.flatMap(p => context.fechas.flatMap((fecha,d) => {
    const original = (plan: typeof snapshot.baseline) => p.rol === 'AUX' || p.rol === 'EVENTUAL'
      ? supportSlots(plan[p.rol][p.id][d]) : bloques(plan.jornadas[p.id][d])
    const a = original(snapshot.baseline), b=original(result.plan)
    return JSON.stringify(a)===JSON.stringify(b) ? [] : [{ id:p.id, fecha, antes:jornada(a), despues:context.ausente(p.id,d) ? 'Ausencia' : jornada(b) }]
  })) : []
  return <main>
    <header><div><p className="tag">Simulación · Río Gallegos</p><h1>Replanificar cajas</h1></div><p>Semana del 16 al 22 de noviembre<br/><small>Aviso simulado el lunes 16</small></p></header>
    <section aria-labelledby="registro">
      <h2 id="registro">Registrar ausencia</h2>
      <form onSubmit={save}>
        <label>Colaborador<select value={person} onChange={e=>setPerson(e.target.value)}>{snapshot.input.colaboradores.map(p=><option key={p.id} value={p.id}>{p.id.toUpperCase()} · {p.rol}</option>)}</select></label>
        <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value as Ausencia['tipo'])}>{tiposAusencia.map(t=><option key={t} value={t}>{labels[t]}</option>)}</select></label>
        <label>Fecha inicial<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label>Fecha final<input type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
        <button type="submit">{editing ? 'Guardar modificación' : 'Registrar ausencia'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {events.length>0 && <ul className="events">{events.map(a=><li key={a.id}><span><strong>{a.persona.toUpperCase()} · {labels[a.tipo]}</strong><br/>{a.desde} al {a.hasta} · {a.estado}</span>
        {a.estado==='confirmada' && <div><button className="neutro" onClick={()=>{setEditing(a.id);setPerson(a.persona);setKind(a.tipo);setStart(a.desde);setEnd(a.hasta)}}>Editar</button>
        <button className="neutro" onClick={()=>record(events.map(x=>x.id===a.id ? {...x,estado:'anulada'}:x),a.id,'Anulada')}>Anular</button></div>}</li>)}</ul>}
    </section>
    <section aria-labelledby="cobertura">
      <div className="row"><h2 id="cobertura">Buscar cobertura</h2><button disabled={!context.modificable.some(Boolean)} onClick={()=>{try {setResult(repararA(request));setApproved(false);setError('')}catch{setError('No se pudo generar una propuesta.')}}}>Buscar cobertura</button></div>
      <dl><div><dt>Faltante el día del aviso</dt><dd>{horas(impact.delDiaAviso)} h-caja</dd></div><div><dt>Faltante en los días a reparar</dt><dd>{horas(impact.deficit)} h-caja</dd></div><div><dt>Días que pueden cambiar</dt><dd>{context.fechas.filter((_,d)=>context.modificable[d]).length}</dd></div></dl>
      <p className="nota">El día del aviso y los demás días fuera de la ausencia conservan los horarios comunicados.</p>
    </section>
    {result && <section aria-labelledby="revision">
      <h2 id="revision">Revisar cambios</h2>
      <dl><div><dt>Cobertura recuperada</dt><dd>{horas(result.antes.deficit-result.despues.deficit)} h-caja</dd></div><div><dt>Faltante residual</dt><dd>{horas(result.despues.deficit)} h-caja</dd></div><div><dt>Personas a avisar</dt><dd>{result.despues.personas.length}</dd></div></dl>
      {result.errores.length ? <p role="alert">No hay propuesta aprobable. {result.errores.join('. ')}.</p> :
       <><p>Se conservan los francos y las duraciones de las jornadas disponibles.</p>
       <table><thead><tr><th>Colaborador</th><th>Fecha</th><th>Comunicado</th><th>Propuesto</th></tr></thead>
       <tbody>{changes.map(c=><tr key={c.id+c.fecha}><td>{c.id.toUpperCase()}</td><td>{c.fecha}</td><td>{c.antes}</td><td>{c.despues}</td></tr>)}</tbody></table></>}
      <details><summary>Ver semana completa</summary><table><thead><tr><th>Fecha</th><th>Estado</th><th>Cobertura h-caja</th><th>Faltante h-caja</th></tr></thead><tbody>{cobertura(result.plan,context).map((f,d)=><tr key={context.fechas[d]}><td>{context.fechas[d]}</td><td>{context.modificable[d] ? 'Revisable' : 'Intacta'}</td><td>{horas(f.reduce((n,v,s)=>n+Math.min(v,snapshot.input.demanda[d][s]),0))}</td><td>{horas(result.despues.porDia[d])}</td></tr>)}</tbody></table></details>
      <div className="row footer"><button disabled={approved || !!result.errores.length} onClick={()=>{try{setApprovals(v=>[...v,aprobarPrueba(request,result,actor,new Date().toISOString(),v.length+1)]);setApproved(true)}catch{setError('La propuesta ya no es válida.')}}}>Aprobar en laboratorio</button>
      {approved && <strong role="status">Propuesta aprobada en laboratorio</strong>}</div>
    </section>}
    {!!journal.length && <details className="audit"><summary>Registro local · {journal.length} eventos · {approvals.length} versiones aprobadas</summary><ul>{journal.map((x,i)=><li key={i}>{x.accion} · {x.id} · {x.actor} · {x.instante}</li>)}</ul></details>}
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
