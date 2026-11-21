import { cerrarSesion } from '../../lib/supabase'
import { getSucursalActual, setSucursalActual } from '../../utils/sucursal'

const HOY = () => { const t = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1) }

export default function Header() {
  const sucursal = getSucursalActual()

  const handleCerrarSesion = () => {
    const ok = confirm(
      '¿Cerrar sesión en este dispositivo?\n\n' +
      'Tus datos quedan guardados en tu cuenta: al iniciar sesión de nuevo ' +
      '(acá o en otro dispositivo) los vas a recuperar.'
    )
    if (ok) void cerrarSesion()
  }

  const handleCambiarSucursal = () => {
    const nueva = prompt(
      'Código de sucursal. Escribí el código de la sucursal con la que querés trabajar ' +
      '(los horarios y la configuración se guardan por sucursal). Ej: 091, 033, 072',
      sucursal
    )
    if (nueva === null) return
    const limpia = nueva.trim()
    if (!limpia || limpia === sucursal) return
    if (confirm(`¿Cambiar a la sucursal ${limpia}? La app se recarga con sus datos.`)) {
      setSucursalActual(limpia)
      window.location.reload()
    }
  }

  const boton: React.CSSProperties = {
    padding: '8px 14px', border: '1px solid var(--border)', borderRadius: '100px', background: 'var(--card)',
    color: 'var(--text)', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '13px', cursor: 'pointer',
  }

  return (
    <header style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '14px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>{HOY()}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={handleCambiarSucursal} title="Cambiar de sucursal" style={boton}>
            Sucursal {sucursal}
          </button>
          <button onClick={handleCerrarSesion} title="Cerrar sesión en este dispositivo" style={{ ...boton, color: 'var(--text-muted)' }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  )
}
