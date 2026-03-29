import { Colaborador } from '../../types'

interface TablaColaboradoresProps {
  colaboradores: Colaborador[]
  onEdit: (colaborador: Colaborador) => void
  onDelete: (id: string) => void
  onToggleActivo: (id: string) => void
}

export default function TablaColaboradores({
  colaboradores,
  onEdit,
  onDelete,
  onToggleActivo,
}: TablaColaboradoresProps) {
  const tiposColor = {
    FULL: 'bg-blue-100 text-blue-800',
    PART: 'bg-green-100 text-green-800',
    AUX: 'bg-purple-100 text-purple-800',
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
              Tipo
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Horas Semanales
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {colaboradores.map((col) => (
            <tr key={col.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{col.nombre}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${tiposColor[col.tipo]}`}
                >
                  {col.tipo}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {col.horasSemanales}h
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                    col.activo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {col.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-3">
                  <button
                    onClick={() => onToggleActivo(col.id)}
                    className="text-gray-500 hover:text-gray-700"
                    title={col.activo ? 'Desactivar' : 'Activar'}
                  >
                    {col.activo ? (
                      <span className="text-xl">🔴</span>
                    ) : (
                      <span className="text-xl">🟢</span>
                    )}
                  </button>
                  <button
                    onClick={() => onEdit(col)}
                    className="text-blue-500 hover:text-blue-700"
                    title="Editar"
                  >
                    <span className="text-xl">✏️</span>
                  </button>
                  <button
                    onClick={() => onDelete(col.id)}
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
    </div>
  )
}