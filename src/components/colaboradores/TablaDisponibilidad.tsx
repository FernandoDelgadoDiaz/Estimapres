import { useLayoutEffect, useRef, useState } from 'react'
import { DIAS_SEMANA, type Auxiliar, type Eventual } from '../../types'
import { interpretarHorario, mostrarHorario, opcionesHorarioMotor } from '../../utils/timeUtils'
import { minutosHorario } from '../../utils/horasSemanales'
import ResumenHoras from '../horarios/ResumenHoras'

interface Props {
  personas: (Auxiliar | Eventual)[]
  onEdit: (id: string, cambios: Partial<Auxiliar & Eventual>) => void
  onDelete: (id: string) => void
  onToggleActivo: (id: string) => void
  onEditarNombre?: (persona: Auxiliar) => void
}

function HorarioEditable({ valor, etiqueta, onGuardar, onBorrador }: {
  valor: string; etiqueta: string; onGuardar: (valor: string) => void; onBorrador: (valor: string | undefined) => void
}) {
  const [borrador, setBorrador] = useState<string>()
  const [error, setError] = useState('')
  const texto = borrador ?? mostrarHorario(valor)
  const campo = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const input = campo.current
    if (!input) return
    const ajustar = () => {
      input.style.height = '0px'
      input.style.height = `${input.scrollHeight + 2}px`
    }
    ajustar()
    let ancho = input.clientWidth
    const observer = new ResizeObserver(() => {
      if (ancho === input.clientWidth) return
      ancho = input.clientWidth
      ajustar()
    })
    if (input.parentElement) observer.observe(input.parentElement, { box: 'border-box' })
    return () => observer.disconnect()
  }, [texto])
  const guardar = () => {
    if (borrador === undefined) return
    const entrada = interpretarHorario(borrador, opcionesHorarioMotor)
    if (!entrada.ok) {
      setError(entrada.error)
      return
    }
    if (entrada.normalizado !== valor) onGuardar(entrada.normalizado)
    setBorrador(undefined)
    onBorrador(undefined)
    setError('')
  }
  return (
    <div>
      <div>
        <textarea ref={campo} aria-label={etiqueta} aria-invalid={!!error} rows={1}
          className="block min-h-11 min-w-0 w-full resize-none overflow-hidden rounded border border-gray-300 px-2 py-1 text-xs leading-5 tabular-nums text-gray-900 focus:ring-2 focus:ring-teal-600"
          placeholder="12 a 22" value={texto} onBlur={guardar}
          onChange={e => {
            setBorrador(e.target.value)
            onBorrador(e.target.value)
            setError('')
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              setBorrador(undefined)
              onBorrador(undefined)
              setError('')
            }
          }}
        />
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-800">{error}</p>}
    </div>
  )
}

function CampoTexto({ valor, etiqueta, onGuardar }: {
  valor: string; etiqueta: string; onGuardar: (texto: string) => void
}) {
  return <input key={valor} aria-label={etiqueta} defaultValue={valor} className="w-full min-w-0 rounded border px-2 py-1 text-xs"
    onBlur={e => {
      const nuevo = e.target.value.trim()
      if (nuevo !== valor) onGuardar(nuevo)
    }}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
  />
}

function FilaDisponibilidad({ persona, onEdit, onDelete, onToggleActivo, onEditarNombre }: Omit<Props, 'personas'> & { persona: Auxiliar | Eventual }) {
  const [borradores, setBorradores] = useState<Record<number, string | undefined>>({})
  const esEventual = 'sector' in persona
  const minutos = DIAS_SEMANA.reduce((total, _, dia) => {
    const guardado = persona.horarioSemanal[dia] ?? ''
    const borrador = borradores[dia]
    const entrada = borrador === undefined ? undefined : interpretarHorario(borrador, opcionesHorarioMotor)
    return total + minutosHorario(entrada?.ok ? entrada.normalizado : guardado)
  }, 0)

  return (
    <tr className="border-t align-top">
      <th scope="row" className="w-36 px-2 py-3 text-left text-sm font-semibold break-words">
        {esEventual
          ? <CampoTexto valor={persona.nombre} etiqueta="Nombre del eventual" onGuardar={nombre => { if (nombre) onEdit(persona.id, { nombre }) }} />
          : persona.nombre}
        {esEventual && <>
          <label className="mt-2 block text-xs font-normal">Sector</label>
          <CampoTexto valor={persona.sector} etiqueta={`Sector de ${persona.nombre}`} onGuardar={sector => onEdit(persona.id, { sector })} />
        </>}
      </th>
      {DIAS_SEMANA.map((dia, idx) => (
        <td key={dia} className="px-1 py-2">
          <HorarioEditable valor={persona.horarioSemanal[idx] ?? ''} etiqueta={`${persona.nombre}, ${dia}`}
            onBorrador={valor => setBorradores(prev => ({ ...prev, [idx]: valor }))}
            onGuardar={valor => {
              const horarioSemanal = Array.from({ length: 7 }, (_, d) => d === idx ? valor : persona.horarioSemanal[d] ?? '')
              onEdit(persona.id, { horarioSemanal })
            }}
          />
        </td>
      ))}
      <td className="w-24 px-2 py-2 text-xs">
        {onEditarNombre && <button type="button" className="block py-1 underline" onClick={() => onEditarNombre(persona)}>Editar ficha</button>}
        <button type="button" className="block py-1 underline" onClick={() => onToggleActivo(persona.id)}>{persona.activo ? 'Desactivar' : 'Activar'}</button>
        <button type="button" className="block py-1 text-red-800 underline" onClick={() => {
          if (window.confirm(`¿Eliminar a ${persona.nombre}?`)) onDelete(persona.id)
        }}>Eliminar</button>
      </td>
      <td className="w-32 px-2 py-2">
        <ResumenHoras minutos={minutos} tipo={esEventual ? 'EVENTUAL' : 'AUX'} objetivo={esEventual ? persona.maxHorasSemanales : persona.horasSemanales} etiqueta={esEventual ? 'Disponibles' : 'Presencia'} />
        {esEventual && <label className="mt-2 block text-xs">Máximo semanal
          <input key={persona.maxHorasSemanales ?? ''} type="number" min="1" max="168" step="1"
            defaultValue={persona.maxHorasSemanales ?? ''} className="mt-1 w-full rounded border px-2 py-1"
            onBlur={e => {
              const valor = e.target.valueAsNumber
              const maxHorasSemanales = e.target.value === '' ? undefined : valor
              if (e.target.validity.valid && maxHorasSemanales !== persona.maxHorasSemanales) {
                onEdit(persona.id, { maxHorasSemanales })
              }
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        </label>}
      </td>
    </tr>
  )
}

export default function TablaDisponibilidad({ personas, ...acciones }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white text-gray-900">
      <table className="w-full min-w-[970px] table-fixed">
        <thead className="bg-gray-50 text-left text-xs">
          <tr>
            <th className="w-36 p-2">Nombre</th>
            {DIAS_SEMANA.map(dia => <th key={dia} className="p-2">{dia}</th>)}
            <th className="w-24 p-2">Acciones</th><th className="w-32 p-2">Horas semanales</th>
          </tr>
        </thead>
        <tbody>{personas.map(persona => <FilaDisponibilidad key={persona.id} persona={persona} {...acciones} />)}</tbody>
      </table>
      <p className="border-t bg-gray-50 px-3 py-2 text-xs">Usá medias horas. Por ejemplo, 8 a 12 y 17:30 a 22. Dejá vacío para franco o sin disponibilidad.</p>
    </div>
  )
}
