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
            color: 'white',
            margin: 0,
            letterSpacing: '-0.5px',
          }}>
            Colaboradores
          </h1>
          <p style={{
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '16px',
            marginTop: '8px',
          }}>
            Gestiona cajeros, auxiliares y eventuales para la asignación de horarios.
          </p>
        </div>
        {activeTab === 'cajeros' && (
          <button
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleAgregarAuxiliar}
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
              Agregar auxiliar
            </button>
            <button
              onClick={resetAuxiliares}
              style={{
                background: 'var(--surface)',
                color: 'var(--text-muted)',
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
              <span style={{ fontSize: '20px', marginRight: '8px' }}>↺</span>
              Restaurar horarios de prueba
            </button>
          </div>
        )}
        {activeTab === 'eventuales' && (
          <button
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
                borderBottomColor: activeTab === tab ? 'var(--accent)' : 'transparent',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                fontSize: '14px',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {tab === 'cajeros' && 'Cajeros'}
              {tab === 'auxiliares' && 'Auxiliares'}
              {tab === 'eventuales' && 'Eventuales'}
            </button>
          ))}
        </nav>
      </div>

      {/* Estadísticas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        <div style={{
          background: 'var(--card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'white',
            letterSpacing: '-0.5px',
          }}>
            {stats.cajerosTotal}
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Cajeros total
          </div>
        </div>
        <div style={{
          background: 'var(--card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'white',
            letterSpacing: '-0.5px',
          }}>
            {stats.cajerosActivos}
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Cajeros activos
          </div>
        </div>
        <div style={{
          background: 'var(--card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'white',
            letterSpacing: '-0.5px',
          }}>
            {stats.auxiliaresTotal}
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Auxiliares total
          </div>
        </div>
        <div style={{
          background: 'var(--card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'white',
            letterSpacing: '-0.5px',
          }}>
            {stats.auxiliaresActivos}
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Auxiliares activos
          </div>
        </div>
        <div style={{
          background: 'var(--card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'white',
            letterSpacing: '-0.5px',
          }}>
            {stats.eventualesTotal}
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Eventuales total
          </div>
        </div>
        <div style={{
          background: 'var(--card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'white',
            letterSpacing: '-0.5px',
          }}>
            {stats.eventualesActivos}
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Eventuales activos
          </div>
        </div>
      </div>

      {/* Tabla según pestaña */}
      {activeTab === 'cajeros' && (
        <>
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <span style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text)',
              }}>
                Mostrar:{' '}
              </span>
              <span style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '14px',
                color: 'white',
              }}>
                Todos los cajeros (FULL + PART)
              </span>
            </div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              color: 'var(--text-muted)',
            }}>
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
      <div style={{
        marginTop: '32px',
        padding: '20px',
        background: 'var(--card)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
      }}>
        <h4 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: '16px',
          color: 'var(--accent)',
          marginBottom: '8px',
        }}>
          Notas importantes
        </h4>
        <ul style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '14px',
          color: 'var(--text-muted)',
          paddingLeft: '20px',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
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