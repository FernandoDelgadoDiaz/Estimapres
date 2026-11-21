import { useState } from 'react'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import TablaColaboradores from '../components/colaboradores/TablaColaboradores'
import TablaDisponibilidad from '../components/colaboradores/TablaDisponibilidad'
import FormColaborador from '../components/colaboradores/FormColaborador'
import { Auxiliar, Colaborador } from '../types'

export default function ColaboradoresPage() {
  const {
    colaboradores,
    colaboradoresActivos,
    loading: cargandoColaboradores,
    errorCarga: errorColaboradores,
    agregarColaborador,
    actualizarColaborador,
    eliminarColaborador,
    toggleActivo,
  } = useColaboradores()

  const {
    auxiliares,
    auxiliaresActivos,
    loading: cargandoAuxiliares,
    errorCarga: errorAuxiliares,
    agregarAuxiliar,
    actualizarAuxiliar,
    eliminarAuxiliar,
    toggleActivo: toggleActivoAux,
  } = useAuxiliares()

  const {
    eventuales,
    eventualesActivos,
    loading: cargandoEventuales,
    errorCarga: errorEventuales,
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

  const [editorAux, setEditorAux] = useState<{ id?: string; nombre: string; horas: string } | null>(null)
  const [errorAux, setErrorAux] = useState('')
  const abrirAux = (aux?: Auxiliar) => {
    setErrorAux('')
    setEditorAux({ id: aux?.id, nombre: aux?.nombre ?? '', horas: aux?.horasSemanales?.toString() ?? '' })
  }
  const guardarAux = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editorAux) return
    const nombre = editorAux.nombre.trim().replace(/\s+/g, ' ')
    if (!nombre) {
      setErrorAux('Ingresá el nombre completo.')
      return
    }
    if (auxiliares.some(a => a.id !== editorAux.id && a.nombre.trim().replace(/\s+/g, ' ').localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0)) {
      setErrorAux('Ya hay un supervisor con ese nombre. Revisá la ficha existente.')
      return
    }
    const horasSemanales = editorAux.horas === '' ? undefined : Number(editorAux.horas)
    if (editorAux.id) actualizarAuxiliar(editorAux.id, { nombre, horasSemanales })
    else agregarAuxiliar({ nombre, horasSemanales, horarioSemanal: Array(7).fill('') })
    setEditorAux(null)
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
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
      }}>
        <div>
          <h1 style={{
            fontSize: '36px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'var(--text)',
            margin: 0,
            letterSpacing: '-0.5px',
          }}>
            Personal
          </h1>
          <p style={{
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '16px',
            marginTop: '8px',
          }}>
            Cajeros, supervisores y eventuales de la sucursal, con su horario habitual.
          </p>
        </div>
        {activeTab === 'cajeros' && (
          <button
            disabled={cargandoColaboradores || errorColaboradores}
            onClick={() => setShowForm(true)}
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              padding: '12px 24px',
              borderRadius: '100px',
              border: 'none',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '14px',
              letterSpacing: '-0.2px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '20px', marginRight: '8px' }}>+</span>
            Agregar cajero
          </button>
        )}
        {activeTab === 'auxiliares' && (
          <button
            disabled={cargandoAuxiliares || errorAuxiliares}
            onClick={() => abrirAux()}
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              padding: '12px 24px',
              borderRadius: '100px',
              border: 'none',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '14px',
              letterSpacing: '-0.2px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '20px', marginRight: '8px' }}>+</span>
            Agregar supervisor
          </button>
        )}
        {activeTab === 'eventuales' && (
          <button
            disabled={cargandoEventuales || errorEventuales}
            onClick={handleAgregarEventual}
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              padding: '12px 24px',
              borderRadius: '100px',
              border: 'none',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '14px',
              letterSpacing: '-0.2px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '20px', marginRight: '8px' }}>+</span>
            Agregar eventual
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '32px' }}>
        <nav style={{ display: 'flex', gap: '32px' }}>
          {['cajeros', 'auxiliares', 'eventuales'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              style={{
                padding: '8px 0',
                borderBottom: '2px solid',
                borderBottomColor: activeTab === tab ? 'var(--accent-strong)' : 'transparent',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                fontSize: '14px',
                color: activeTab === tab ? 'var(--accent-strong)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {tab === 'cajeros' && 'Cajeros'}
              {tab === 'auxiliares' && 'Supervisores'}
              {tab === 'eventuales' && 'Eventuales'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tabla según pestaña */}
      {activeTab === 'cajeros' && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-muted)' }}>
            {stats.cajerosActivos} de {stats.cajerosTotal} activos
          </p>
          <TablaColaboradores
            colaboradores={cajeros}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleActivo={toggleActivo}
          />
        </>
      )}

      {activeTab === 'auxiliares' && (
        <>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Horario habitual de cada supervisor. Los cambios de un día puntual se cargan en Nueva semana.
          </p>
          <TablaDisponibilidad
            personas={auxiliares}
            onEditarNombre={abrirAux}
            onEdit={actualizarAuxiliar}
            onDelete={eliminarAuxiliar}
            onToggleActivo={toggleActivoAux}
          />
        </>
      )}

      {activeTab === 'eventuales' && (
        <>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Horario habitual de cada eventual. Los cambios de un día puntual se cargan en Nueva semana.
          </p>
          <TablaDisponibilidad
            personas={eventuales}
            onEdit={actualizarEventual}
            onDelete={eliminarEventual}
            onToggleActivo={toggleActivoEv}
          />
        </>
      )}

      {editorAux && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="titulo-editor-aux" onSubmit={guardarAux}
            onKeyDown={e => { if (e.key === 'Escape') setEditorAux(null) }}
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 text-gray-900 shadow-xl">
            <h2 id="titulo-editor-aux" className="text-lg font-bold">{editorAux.id ? 'Editar supervisor' : 'Agregar supervisor'}</h2>
            <label className="block text-sm font-medium">Nombre completo
              <input autoFocus required value={editorAux.nombre} className="mt-1 w-full rounded border px-3 py-2"
                onChange={e => { setEditorAux({ ...editorAux, nombre: e.target.value }); setErrorAux('') }} />
            </label>
            <label className="block text-sm font-medium">Objetivo semanal en horas (opcional)
              <input type="number" min="1" max="168" step="1" value={editorAux.horas}
                className="mt-1 w-full rounded border px-3 py-2"
                onChange={e => setEditorAux({ ...editorAux, horas: e.target.value })} />
            </label>
            {errorAux && <p role="alert" className="text-sm text-red-800">{errorAux}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" className="rounded border px-4 py-2" onClick={() => setEditorAux(null)}>Cancelar</button>
              <button type="submit" className="rounded bg-teal-800 px-4 py-2 text-white">Guardar supervisor</button>
            </div>
          </form>
        </div>
      )}

      {/* Formulario modal (solo para cajeros) */}
      {showForm && (
        <FormColaborador
          colaborador={editingColaborador}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}

    </div>
  )
}