import { Link } from 'react-router-dom'

export default function InicioPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'var(--text)',
          marginBottom: '16px',
          letterSpacing: '-1px',
        }}>
          Bienvenido al Asignador de Horarios de Cajeros
        </h1>
        <p style={{
          fontSize: '18px',
          color: 'var(--text-muted)',
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          Automatiza la asignación semanal de turnos respetando todas las reglas de negocio.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px',
        marginBottom: '48px',
      }}>
        <div style={{
          background: 'var(--card)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
          <h3 style={{
            fontSize: '24px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'var(--text)',
            marginBottom: '8px',
            letterSpacing: '-0.5px',
          }}>
            Gestionar Colaboradores
          </h3>
          <p style={{
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '16px',
            marginBottom: '24px',
          }}>
            Agrega, edita o desactiva cajeros full-time, part-time y auxiliares.
          </p>
          <Link
            to="/colaboradores"
            style={{
              display: 'inline-block',
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              padding: '12px 24px',
              borderRadius: '100px',
              textDecoration: 'none',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '14px',
              letterSpacing: '-0.2px',
            }}
          >
            Administrar colaboradores
          </Link>
        </div>

        <div style={{
          background: 'var(--card)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
          <h3 style={{
            fontSize: '24px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'var(--text)',
            marginBottom: '8px',
            letterSpacing: '-0.5px',
          }}>
            Generar Nueva Semana
          </h3>
          <p style={{
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '16px',
            marginBottom: '24px',
          }}>
            Sube el PDF con la necesidad de cajas y genera automáticamente los horarios.
          </p>
          <Link
            to="/nueva-semana"
            style={{
              display: 'inline-block',
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              padding: '12px 24px',
              borderRadius: '100px',
              textDecoration: 'none',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '14px',
              letterSpacing: '-0.2px',
            }}
          >
            Comenzar nueva semana
          </Link>
        </div>

        <div style={{
          background: 'var(--card)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <h3 style={{
            fontSize: '24px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'var(--text)',
            marginBottom: '8px',
            letterSpacing: '-0.5px',
          }}>
            Ver Historial
          </h3>
          <p style={{
            color: 'var(--text-muted)',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '16px',
            marginBottom: '24px',
          }}>
            Consulta horarios anteriores y métricas de cobertura (próximamente).
          </p>
          <button
            disabled
            style={{
              display: 'inline-block',
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              padding: '12px 24px',
              borderRadius: '100px',
              border: 'none',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '14px',
              letterSpacing: '-0.2px',
              cursor: 'not-allowed',
            }}
          >
            Próximamente
          </button>
        </div>
      </div>

      <div style={{
        background: 'var(--card)',
        borderRadius: '16px',
        padding: '40px',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
      }}>
        <h2 style={{
          fontSize: '32px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'var(--text)',
          marginBottom: '32px',
          letterSpacing: '-0.5px',
        }}>
          ¿Cómo funciona?
        </h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <li style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span style={{
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              fontWeight: 800,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '16px',
              flexShrink: 0,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>1</span>
            <div>
              <h4 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '18px',
                color: 'var(--text)',
                marginBottom: '4px',
              }}>
                Sube el PDF semanal
              </h4>
              <p style={{
                color: 'var(--text-muted)',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
              }}>
                El sistema extrae automáticamente la tabla "Estimado de cajas necesarias" del PDF.
              </p>
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span style={{
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              fontWeight: 800,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '16px',
              flexShrink: 0,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>2</span>
            <div>
              <h4 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '18px',
                color: 'var(--text)',
                marginBottom: '4px',
              }}>
                Revisa los colaboradores activos
              </h4>
              <p style={{
                color: 'var(--text-muted)',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
              }}>
                Verifica qué cajeros están disponibles para la semana y ajusta si es necesario.
              </p>
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span style={{
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              fontWeight: 800,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '16px',
              flexShrink: 0,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>3</span>
            <div>
              <h4 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '18px',
                color: 'var(--text)',
                marginBottom: '4px',
              }}>
                Genera los horarios
              </h4>
              <p style={{
                color: 'var(--text-muted)',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
              }}>
                El algoritmo asigna turnos respetando todas las reglas de negocio y prioridades.
              </p>
            </div>
          </li>
          <li style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span style={{
              background: 'var(--accent)',
              color: 'var(--accent-dark)',
              fontWeight: 800,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '16px',
              flexShrink: 0,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>4</span>
            <div>
              <h4 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '18px',
                color: 'var(--text)',
                marginBottom: '4px',
              }}>
                Exporta el resultado
              </h4>
              <p style={{
                color: 'var(--text-muted)',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
              }}>
                Descarga un PDF profesional con los horarios y tabla de cobertura.
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}