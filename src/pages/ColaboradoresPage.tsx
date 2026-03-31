import { useState } from 'react'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import TablaColaboradores from '../components/colaboradores/TablaColaboradores'
import TablaAuxiliares from '../components/colaboradores/TablaAuxiliares'
import TablaEventuales from '../components/colaboradores/TablaEventuales'
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

  const {
    auxiliares,
    auxiliaresActivos,
    agregarAuxiliar,
    actualizarAuxiliar,
    eliminarAuxiliar,
    toggleActivo: toggleActivoAux,
    resetAuxiliares,
  } = useAuxiliares()

  const {
    eventuales,
    eventualesActivos,
    agregarEventual,
    actualizarEventual,
    eliminarEventual,
    toggleActivo: toggleActivoEv,
  } = useEventuales()

  const [activeTab, setActiveTab] = useState<'cajeros' | 'auxiliares' | 'eventuales'>('cajeros')
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

  const handleAgregarAuxiliar = () => {
    agregarAuxiliar({
      nombre: 'Nuevo auxiliar',
      horarioSemanal: ['', '', '', '', '', '', ''],
    })
  }

  const handleAgregarEventual = () => {
    agregarEventual({
      nombre: 'Nuevo eventual',
      sector: '',
      horarioSemanal: ['', '', '', '', '', '', ''],
    })
  }

  const cajeros = colaboradores.filter(c => c.tipo === 'FULL' || c.tipo === 'PART')
  const cajerosActivos = colaboradoresActivos.filter(c => c.tipo === 'FULL' || c.tipo === 'PART')

  const stats = {
    cajerosTotal: cajeros.length,
    cajerosActivos: cajerosActivos.length,
    auxiliaresTotal: auxiliares.length,
    auxiliaresActivos: auxiliaresActivos.length,
    eventualesTotal: eventuales.length,
    eventualesActivos: eventualesActivos.length,
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Colaboradores</h1>
          <p className="text-gray-600 mt-2">
            Gestiona cajeros, auxiliares y eventuales para la asignación de horarios.
          </p>
        </div>
        {activeTab === 'cajeros' && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
          >
            <span className="text-xl mr-2">+</span>
            Agregar cajero
          </button>
        )}
        {activeTab === 'auxiliares' && (
          <div className="flex space-x-2">
            <button
              onClick={handleAgregarAuxiliar}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
            >
              <span className="text-xl mr-2">+</span>
              Agregar auxiliar
            </button>
            <button
              onClick={resetAuxiliares}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center"
            >
              <span className="text-xl mr-2">↺</span>
              Restaurar horarios de prueba
            </button>
          </div>
        )}
        {activeTab === 'eventuales' && (
          <button
            onClick={handleAgregarEventual}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
          >
            <span className="text-xl mr-2">+</span>
            Agregar eventual
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          {['cajeros', 'auxiliares', 'eventuales'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`
                py-2 px-1 border-b-2 font-medium text-sm
                ${activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab === 'cajeros' && 'Cajeros'}
              {tab === 'auxiliares' && 'Auxiliares'}
              {tab === 'eventuales' && 'Eventuales'}
            </button>
          ))}
        </nav>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.cajerosTotal}</div>
          <div className="text-sm text-gray-600">Cajeros total</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.cajerosActivos}</div>
          <div className="text-sm text-gray-600">Cajeros activos</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.auxiliaresTotal}</div>
          <div className="text-sm text-gray-600">Auxiliares total</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.auxiliaresActivos}</div>
          <div className="text-sm text-gray-600">Auxiliares activos</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.eventualesTotal}</div>
          <div className="text-sm text-gray-600">Eventuales total</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.eventualesActivos}</div>
          <div className="text-sm text-gray-600">Eventuales activos</div>
        </div>
      </div>

      {/* Tabla según pestaña */}
      {activeTab === 'cajeros' && (
        <>
          <div className="mb-4 flex items-center space-x-4">
            <div>
              <span className="text-sm font-medium text-gray-700">Mostrar: </span>
              <span className="text-sm text-gray-900">Todos los cajeros (FULL + PART)</span>
            </div>
            <div className="text-sm text-gray-500">
              {stats.cajerosActivos} activos de {stats.cajerosTotal} total
            </div>
          </div>
          <TablaColaboradores
            colaboradores={cajeros}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleActivo={toggleActivo}
          />
        </>
      )}

      {activeTab === 'auxiliares' && (
        <TablaAuxiliares
          auxiliares={auxiliares}
          onEdit={actualizarAuxiliar}
          onDelete={eliminarAuxiliar}
          onToggleActivo={toggleActivoAux}
        />
      )}

      {activeTab === 'eventuales' && (
        <TablaEventuales
          eventuales={eventuales}
          onEdit={actualizarEventual}
          onDelete={eliminarEventual}
          onToggleActivo={toggleActivoEv}
        />
      )}

      {/* Formulario modal (solo para cajeros) */}
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