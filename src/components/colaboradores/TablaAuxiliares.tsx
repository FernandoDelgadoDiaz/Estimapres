import { Auxiliar } from '../../types'
import { DIAS_SEMANA } from '../../types'

function normalizarHorario(valor: string): { normalizado: string, esValido: boolean } {
  const trimmed = valor.trim()
  if (trimmed === '') {
    return { normalizado: '', esValido: true }
  }

  // Reemplazar separadores " a " y " y " por "|"
  let conPipe = trimmed.replace(/\s+a\s+/g, '|').replace(/\s+y\s+/g, '|')
  // Separar por "|"
  const bloques = conPipe.split('|').map(b => b.trim()).filter(Boolean)

  const bloquesNormalizados: string[] = []
  let esValido = true

  for (const bloque of bloques) {
    // Separar por "-" (puede tener espacios alrededor)
    const partes = bloque.split(/\s*-\s*/)
    if (partes.length !== 2) {
      esValido = false
      break
    }
    let [inicio, fin] = partes

    // Normalizar formato HH:MM
    const normalizarHora = (h: string): string => {
      // Si no tiene ":", agregar ":00"
      if (!h.includes(':')) {
        // Asegurar dos dígitos
        return h.padStart(2, '0') + ':00'
      }
      // Si tiene ":", asegurar dos dígitos en hora y minuto
      const [horas, minutos] = h.split(':')
      return `${horas.padStart(2, '0')}:${(minutos || '00').padEnd(2, '0')}`
    }

    const inicioNorm = normalizarHora(inicio)
    const finNorm = normalizarHora(fin)

    // Validar formato HH:MM (00:00 a 23:59)
    const horaRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!horaRegex.test(inicioNorm) || !horaRegex.test(finNorm)) {
      esValido = false
      break
    }

    bloquesNormalizados.push(`${inicioNorm}-${finNorm}`)
  }

  if (!esValido) {
    return { normalizado: trimmed, esValido: false }
  }

  const normalizado = bloquesNormalizados.join('|')
  // Validar formato final: HH:MM-HH:MM o HH:MM-HH:MM|HH:MM-HH:MM
  const formatoFinalRegex = /^(([01]?[0-9]|2[0-3]):[0-5][0-9]-([01]?[0-9]|2[0-3]):[0-5][0-9])(\|([01]?[0-9]|2[0-3]):[0-5][0-9]-([01]?[0-9]|2[0-3]):[0-5][0-9])?$/
  const esFormatoFinalValido = formatoFinalRegex.test(normalizado)
  return { normalizado: esFormatoFinalValido ? normalizado : trimmed, esValido: esFormatoFinalValido }
}

interface TablaAuxiliaresProps {
  auxiliares: Auxiliar[]
  onEdit: (id: string, cambios: Partial<Auxiliar>) => void
  onDelete: (id: string) => void
  onToggleActivo: (id: string) => void
}

export default function TablaAuxiliares({
  auxiliares,
  onEdit,
  onDelete,
  onToggleActivo,
}: TablaAuxiliaresProps) {
  const handleHorarioChange = (id: string, diaIndex: number, valor: string) => {
    const nuevoHorario = [...(auxiliares.find(a => a.id === id)?.horarioSemanal || [])]
    nuevoHorario[diaIndex] = valor
    onEdit(id, { horarioSemanal: nuevoHorario })
  }

  const handleHorarioBlur = (id: string, diaIndex: number, valor: string) => {
    const { normalizado, esValido } = normalizarHorario(valor)
    if (esValido && normalizado !== valor) {
      const nuevoHorario = [...(auxiliares.find(a => a.id === id)?.horarioSemanal || [])]
      nuevoHorario[diaIndex] = normalizado
      onEdit(id, { horarioSemanal: nuevoHorario })
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nombre
            </th>
            {DIAS_SEMANA.map((dia, _) => (
              <th key={dia} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {dia}
              </th>
            ))}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {auxiliares.map((aux) => (
            <tr key={aux.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{aux.nombre}</div>
              </td>
              {DIAS_SEMANA.map((_, idx) => (
                <td key={idx} className="px-3 py-4 whitespace-nowrap">
                  <input
                    type="text"
                    value={aux.horarioSemanal[idx] || ''}
                    onChange={(e) => handleHorarioChange(aux.id, idx, e.target.value)}
                    onBlur={(e) => handleHorarioBlur(aux.id, idx, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.target.select()}
                    placeholder="HH:MM-HH:MM o 8-13, 8 a 12 y 18 a 23"
                    className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 ${
                      normalizarHorario(aux.horarioSemanal[idx] || '').esValido
                        ? 'border-gray-300'
                        : 'border-red-500'
                    }`}
                  />
                </td>
              ))}
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                    aux.activo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {aux.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-3">
                  <button
                    onClick={() => onEdit(aux.id, {})}
                    className="text-blue-500 hover:text-blue-700"
                    title="Guardar cambios"
                  >
                    <span className="text-xl">💾</span>
                  </button>
                  <button
                    onClick={() => onToggleActivo(aux.id)}
                    className="text-gray-500 hover:text-gray-700"
                    title={aux.activo ? 'Desactivar' : 'Activar'}
                  >
                    {aux.activo ? (
                      <span className="text-xl">🔴</span>
                    ) : (
                      <span className="text-xl">🟢</span>
                    )}
                  </button>
                  <button
                    onClick={() => onDelete(aux.id)}
                    className="text-red-500 hover:text-red-700"
                    title="Eliminar"
                  >
                    <span className="text-xl">🗑️</span>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-6 py-3 bg-gray-50 text-xs text-gray-500 border-t border-gray-200">
        Formatos aceptados: HH:MM-HH:MM (08:00-17:00), 8-13, 8 a 12, 8 a 12 y 18 a 23, 08:00-13:00|19:00-23:00. Dejar vacío para franco. Se normaliza automáticamente al salir.
      </div>
    </div>
  )
}