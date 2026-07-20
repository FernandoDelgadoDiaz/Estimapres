import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cerrarSesion } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { getSucursalActual, setSucursalActual } from '../../utils/sucursal'

export default function Header() {
  const hoy = new Date()
  const semanaActual = `Semana ${format(hoy, 'w', { locale: es })} - ${format(hoy, 'yyyy', { locale: es })}`
  const { usuario } = useAuth()

  const handleCerrarSesion = () => {
    const ok = confirm(
      '¿Cerrar sesión en este dispositivo?\n\n' +
      'Tus datos quedan guardados en tu cuenta: al iniciar sesión de nuevo ' +
      '(acá o en otro dispositivo) los vas a recuperar.'
    )
    if (ok) void cerrarSesion()
  }

  const inicial = (usuario?.email ?? 'S').charAt(0).toUpperCase()
  const sucursal = getSucursalActual()

  const handleCambiarSucursal = () => {
    const nueva = prompt(
      'Código de sucursal. Escribí el código de la sucursal con la que querés trabajar ' +
      '(los horarios, reglas y aprendizajes se guardan por sucursal). Ej: 091, 033, 072',
      sucursal
    )
    if (nueva === null) return
    const limpia = nueva.trim()
    if (!limpia || limpia === sucursal) return
    if (confirm(`¿Cambiar a "${limpia}"? La app se recarga con los datos de esa sucursal.`)) {
      setSucursalActual(limpia)
      window.location.reload()
    }
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
              {usuario?.email ?? '—'}
            </p>
          </div>
          <button
            onClick={handleCambiarSucursal}
            title="Cambiar de sucursal (los datos se separan por sucursal)"
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              borderRadius: '100px',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            🏬 {sucursal}
          </button>
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
            {inicial}
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