import { Eventual } from '../../types'
import { DIAS_SEMANA } from '../../types'

interface TablaEventualesProps {
  eventuales: Eventual[]
  onEdit: (id: string, cambios: Partial<Eventual>) => void
  onDelete: (id: string) => void
  onToggleActivo: (id: string) => void
}

export default function TablaEventuales({
  eventuales,
  onEdit,
  onDelete,
  onToggleActivo,
}: TablaEventualesProps) {
  const handleHorarioChange = (id: string, diaIndex: number, valor: string) => {
    const nuevoHorario = [...(eventuales.find(e => e.id === id)?.horarioSemanal || [])]
    nuevoHorario[diaIndex] = valor
    onEdit(id, { horarioSemanal: nuevoHorario })
  }

  const handleSectorChange = (id: string, sector: string) => {
    onEdit(id, { sector })
  }

  const handleNombreChange = (id: string, nombre: string) => {
    onEdit(id, { nombre })
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nombre
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Sector
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
          {eventuales.map((ev) => (
            <tr key={ev.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <input
                  type="text"
                  value={ev.nombre}
                  onChange={(e) => handleNombreChange(ev.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <input
                  type="text"
                  value={ev.sector}
                  onChange={(e) => handleSectorChange(ev.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                />
              </td>
              {DIAS_SEMANA.map((_, idx) => (
                <td key={idx} className="px-3 py-4 whitespace-nowrap">
                  <input
                    type="text"
                    value={ev.horarioSemanal[idx] || ''}
                    onChange={(e) => handleHorarioChange(ev.id, idx, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.target.select()}
                    placeholder="HH:MM-HH:MM"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  />
                </td>
              ))}
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                    ev.activo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {ev.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-3">
                  <button
                    onClick={() => onEdit(ev.id, {})}
                    className="text-blue-500 hover:text-blue-700"
                    title="Guardar cambios"
                  >
                    <span className="text-xl">💾</span>
                  </button>
                  <button
                    onClick={() => onToggleActivo(ev.id)}
                    className="text-gray-500 hover:text-gray-700"
                    title={ev.activo ? 'Desactivar' : 'Activar'}
                  >
                    {ev.activo ? (
                      <span className="text-xl">🔴</span>
                    ) : (
                      <span className="text-xl">🟢</span>
                    )}
                  </button>
                  <button
                    onClick={() => onDelete(ev.id)}
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
        Formato: HH:MM-HH:MM (ej: 08:00-17:00). Dejar vacío para no disponible.
      </div>
    </div>
  )
}