import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

// Íconos de línea simples (sin dependencias): mismo trazo y tamaño en todo el menú.
const icono = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const ICONOS = {
  inicio: icono(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>),
  nueva: icono(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></>),
  horarios: icono(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M7 14h4M7 17h7" /></>),
  personal: icono(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c2.3 0 4 1.5 4.5 4" /></>),
  configuracion: icono(<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>),
}

// Menú del supervisor (decisión del propietario, 21/11/2026): solo lo que usa para trabajar.
// Historial de aprendizaje y efectividad siguen funcionando por detrás, sin pantalla propia.
export const NAV_ITEMS = [
  { path: '/', label: 'Inicio', icon: ICONOS.inicio, end: true },
  { path: '/nueva-semana', label: 'Nueva semana', icon: ICONOS.nueva },
  { path: '/horarios', label: 'Horarios', icon: ICONOS.horarios },
  { path: '/colaboradores', label: 'Personal', icon: ICONOS.personal },
  { path: '/reglas', label: 'Configuración', icon: ICONOS.configuracion },
] as const

export default function Sidebar() {
  return (
    <div style={{
      width: '232px', background: 'var(--surface)', color: 'var(--text)',
      display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border)',
    }}>
      <div style={{ padding: '24px 24px 20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
          Aliada Horarios
        </h1>
      </div>
      <nav aria-label="Principal" style={{ flex: 1, padding: '8px 12px' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {NAV_ITEMS.map(item => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={'end' in item}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', borderRadius: '10px',
                  textDecoration: 'none', transition: 'background-color 0.15s',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--accent-dark)' : 'var(--text)',
                  fontWeight: isActive ? 700 : 500,
                })}
              >
                {item.icon}
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '15px' }}>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} Aliada Tech
      </div>
    </div>
  )
}
