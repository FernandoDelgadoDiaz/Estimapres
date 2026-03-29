import { useState } from 'react'
import { useColaboradores } from '../hooks/useColaboradores'
import TablaColaboradores from '../components/colaboradores/TablaColaboradores'
import FormColaborador from '../components/colaboradores/FormColaborador'
import { Colaborador } from '../types'

export default function ColaboradoresPage() {
  const {
    colaboradores,
    colaboradoresActivos,
    agregarColaborador,
    actualizarColaborador,
    eliminarColaborador,
    toggleActivo,
  } = useColaboradores()

  const [showForm, setShowForm] = useState(false)
  const [editingColaborador, setEditingColaborador] = useState<Colaborador | null>(null)

  const handleEdit = (colaborador: Colaborador) => {
    setEditingColaborador(colaborador)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este colaborador?')) {
      eliminarColaborador(id)
    }
  }

  const handleSubmit = (data: Omit<Colaborador, 'id' | 'activo'>) => {
    if (editingColaborador) {
      actualizarColaborador(editingColaborador.id, data)
    } else {
      agregarColaborador(data)
    }
    setShowForm(false)
    setEditingColaborador(null)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingColaborador(null)
  }

  const stats = {
    total: colaboradores.length,
    activos: colaboradoresActivos.length,
    full: colaboradoresActivos.filter(c => c.tipo === 'FULL').length,
    part: colaboradoresActivos.filter(c => c.tipo === 'PART').length,
    aux: colaboradoresActivos.filter(c => c.tipo === 'AUX').length,
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Colaboradores</h1>
          <p className="text-gray-600 mt-2">
            Gestiona los cajeros que participarán en la asignación de horarios.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
        >
          <span className="text-xl mr-2">+</span>
          Agregar colaborador
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-600">Total colaboradores</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.activos}</div>
          <div className="text-sm text-gray-600">Activos</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.full}</div>
          <div className="text-sm text-gray-600">Full Time</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.part}</div>
          <div className="text-sm text-gray-600">Part Time</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex items-center space-x-4">
        <div>
          <span className="text-sm font-medium text-gray-700">Mostrar: </span>
          <span className="text-sm text-gray-900">Todos los colaboradores</span>
        </div>
        <div className="text-sm text-gray-500">
          {stats.activos} activos de {stats.total} total
        </div>
      </div>

      {/* Tabla */}
      <TablaColaboradores
        colaboradores={colaboradores}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleActivo={toggleActivo}
      />

      {/* Formulario modal */}
      {showForm && (
        <FormColaborador
          colaborador={editingColaborador}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}

      {/* Notas */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-800 mb-2">Notas importantes</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Los colaboradores inactivos no participarán en la asignación de horarios.</li>
          <li>• FULL Time: 48h semanales (3×9h + 2×8h + 1×5h).</li>
          <li>• PART Time: máximo 32h semanales, solo turno corrido.</li>
          <li>• AUX: se usan solo si FULL + PART no cubren la necesidad.</li>
          <li>• Los cambios se guardan automáticamente en el navegador.</li>
        </ul>
      </div>
    </div>
  )
}