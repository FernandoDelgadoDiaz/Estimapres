import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cerrarSesion } from '../../lib/supabase'

export default function Header() {
  const hoy = new Date()
  const semanaActual = `Semana ${format(hoy, 'w', { locale: es })} - ${format(hoy, 'yyyy', { locale: es })}`

  const handleCerrarSesion = () => {
    const ok = confirm(
      'Vas a cerrar la sesión de este dispositivo.\n\n' +
      'IMPORTANTE: la sesión actual es anónima. Al cerrarla, los datos ' +
      'guardados en la nube quedan desvinculados de este navegador (los datos ' +
      'locales se conservan). Si no tenés un backup exportado, considerá ' +
      'exportarlo antes desde Historial → Backup de configuración.\n\n' +
      '¿Cerrar sesión igualmente?'
    )
    if (ok) void cerrarSesion()
  }

  return (
    <header style={{
      background: 'var(--card)',
      borderBottom: '1px solid var(--border)',
      padding: '16px 24px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'var(--text)',
            margin: 0,
            letterSpacing: '-0.5px',
          }}>
            Aliada Horarios
          </h2>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            marginTop: '4px',
          }}>
            {semanaActual}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif",
              color: 'var(--text)',
              margin: 0,
            }}>
              Aliada Tech
            </p>
            <p style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}>
              Sucursal Central
            </p>
          </div>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--accent)',
            color: 'var(--accent-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '16px',
          }}>
            SC
          </div>
          <button
            onClick={handleCerrarSesion}
            title="Cerrar sesión en este dispositivo"
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              borderRadius: '100px',
              background: 'var(--card)',
              color: 'var(--text-muted)',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  )
}