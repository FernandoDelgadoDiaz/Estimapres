import { useState, type FormEvent } from 'react'
import { DIAS_SEMANA } from '../../types'
import { horarioValido, type ExcepcionDisponibilidad, type HuecoSupervision, type OrigenDia } from '../../utils/disponibilidadHabitual'

interface Persona {
  id: string
  nombre: string
  tipo: 'AUX' | 'EVENTUAL'
  horarioSemanal: string[]
}

interface Props {
  fechas: string[]
  personas: Persona[]
  origen: Record<string, OrigenDia[]>
  excepciones: ExcepcionDisponibilidad[]
  huecos: HuecoSupervision[]
  errores: string[]
  autorSesion?: string
  onAgregar: (excepcion: ExcepcionDisponibilidad) => void
  onQuitar: (colaboradorId: string, fecha: string) => void
}

const fechaCorta = (fecha: string) => fecha.slice(5).split('-').reverse().join('/')

export default function DisponibilidadSemana({
  fechas, personas, origen, excepciones, huecos, errores, autorSesion, onAgregar, onQuitar,
}: Props) {
  const [colaboradorId, setColaboradorId] = useState('')
  const [fechaElegida, setFechaElegida] = useState('')
  const [horario, setHorario] = useState('')
  const [sinDisponibilidad, setSinDisponibilidad] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [autor, setAutor] = useState('')
  const [error, setError] = useState('')
  const fecha = fechaElegida || fechas[0]

  function agregar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const horarioEfectivo = sinDisponibilidad ? '' : horario.trim()
    const responsable = autorSesion || autor.trim()
    if (!personas.some(p => p.id === colaboradorId) || !fechas.includes(fecha)) {
      setError('Elegí una persona activa y una fecha de esta semana.')
      return
    }
    if ((!sinDisponibilidad && !horarioEfectivo) || !horarioValido(horarioEfectivo)) {
      setError('Ingresá bloques en medias horas, ordenados y sin superposición, o marcá Sin disponibilidad.')
      return
    }
    if (!motivo.trim() || !responsable) {
      setError('Completá el motivo y el autor.')
      return
    }
    if (excepciones.some(x => x.colaboradorId === colaboradorId && x.fecha === fecha)) {
      setError('Ya existe una excepción para esta persona y fecha. Quitala para reemplazarla.')
      return
    }
    onAgregar({ colaboradorId, fecha, horario: horarioEfectivo, motivo: motivo.trim(), autor: responsable, creadaEn: new Date().toISOString() })
    setHorario('')
    setMotivo('')
    setSinDisponibilidad(false)
    setError('')
  }

  return (
    <section aria-labelledby="disponibilidad-semana" className="rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <h3 id="disponibilidad-semana" className="mb-2 text-xl font-bold">Disponibilidad de AUX y eventuales</h3>
      <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        Se usa el patrón habitual de Colaboradores. Las excepciones se aplican a una fecha de esta planificación y se pierden al salir o recargar.
      </p>

      {errores.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg p-3" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <strong>Corregí estas inconsistencias para generar</strong>
          <ul className="ml-5 list-disc">{[...new Set(errores)].map(e => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div aria-live="polite" aria-atomic="true" className="mb-4 text-sm">
        {huecos.length > 0 ? (
          <details open className="rounded-lg p-3" style={{ background: 'var(--surface)' }}>
            <summary className="cursor-pointer font-bold">Faltantes de supervisión ({huecos.length})</summary>
            <p className="my-2">Con estos huecos, el motor genera un borrador y deja a los AUX fuera de caja toda la semana.</p>
            <ul className="ml-5 list-disc">
              {huecos.map(h => <li key={h.detalle}>{h.detalle}</li>)}
            </ul>
          </details>
        ) : <p>Supervisión cubierta según las franjas que comprueba el motor.</p>}
      </div>

      {personas.length > 0 && (
        <>
          <details className="mb-4">
            <summary className="cursor-pointer font-semibold">Ver patrón habitual y excepciones aplicadas</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="p-2">Persona</th>
                    {fechas.map((f, d) => <th scope="col" className="whitespace-nowrap p-2" key={f}>{DIAS_SEMANA[d]} {fechaCorta(f)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {personas.map(p => (
                    <tr key={p.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <th scope="row" className="p-2">{p.nombre} · {p.tipo}</th>
                      {fechas.map((f, d) => (
                        <td key={f} className="p-2 align-top">
                          <span className="block whitespace-nowrap">{p.horarioSemanal[d]?.trim() || 'Sin disponibilidad'}</span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {origen[p.id]?.[d] === 'excepcion' ? 'Excepción' : 'Habitual'}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details>
            <summary className="cursor-pointer font-semibold">Cargar excepción por fecha</summary>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={agregar}>
              <label>Persona
                <select className="block w-full rounded border p-2" required value={colaboradorId} onChange={e => setColaboradorId(e.target.value)}>
                  <option value="">Elegí una persona</option>
                  {personas.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.tipo}</option>)}
                </select>
              </label>
              <label>Fecha de la excepción
                <select className="block w-full rounded border p-2" value={fecha} onChange={e => setFechaElegida(e.target.value)}>
                  {fechas.map((f, d) => <option value={f} key={f}>{DIAS_SEMANA[d]} {fechaCorta(f)}</option>)}
                </select>
              </label>
              <label>Horario excepcional
                <input className="block w-full rounded border p-2" value={horario} disabled={sinDisponibilidad} required={!sinDisponibilidad}
                  placeholder="08:00-13:00|19:00-22:30" onChange={e => setHorario(e.target.value)} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sinDisponibilidad} onChange={e => setSinDisponibilidad(e.target.checked)} />
                Sin disponibilidad
              </label>
              <label>Motivo
                <input className="block w-full rounded border p-2" required value={motivo} onChange={e => setMotivo(e.target.value)} />
              </label>
              {!autorSesion && (
                <label>Autor
                  <input className="block w-full rounded border p-2" required value={autor} onChange={e => setAutor(e.target.value)} />
                </label>
              )}
              {error && <p role="alert" className="sm:col-span-2" style={{ color: 'var(--danger)' }}>{error}</p>}
              <button type="submit" className="justify-self-start rounded-lg border px-4 py-2">Aplicar excepción</button>
            </form>
          </details>
        </>
      )}

      {excepciones.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm" aria-label="Excepciones aplicadas">
          {excepciones.map(x => {
            const nombre = personas.find(p => p.id === x.colaboradorId)?.nombre ?? 'Persona fuera del roster'
            return (
              <li key={`${x.colaboradorId}|${x.fecha}`} className="flex flex-wrap items-center gap-2">
                <span>{nombre} · {fechaCorta(x.fecha)} · {x.horario || 'Sin disponibilidad'} · {x.motivo}</span>
                <button type="button" className="rounded border px-2 py-1" aria-label={`Quitar excepción de ${nombre} del ${fechaCorta(x.fecha)}`}
                  onClick={() => { onQuitar(x.colaboradorId, x.fecha); setError('') }}>Quitar</button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
