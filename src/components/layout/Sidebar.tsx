import { NavLink } from 'react-router-dom'

const navItems = [
  { path: '/', label: 'Inicio', icon: '🏠' },
  { path: '/colaboradores', label: 'Colaboradores', icon: '👥' },
  { path: '/nueva-semana', label: 'Nueva Semana', icon: '📅' },
  // { path: '/historial', label: 'Historial', icon: '📋' },
]

export default function Sidebar() {
  return (
    <div style={{
      width: '240px',
      background: 'var(--surface)',
      color: 'var(--text)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      borderRight: '1px solid var(--border)',
    }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'white',
          margin: 0,
          letterSpacing: '-0.5px',
        }}>
          Aliada Horarios
        </h1>
        <p style={{
          fontSize: '14px',
          color: 'var(--text-muted)',
          marginTop: '4px',
        }}>
          Aliada Tech 2026
        </p>
      </div>
      <nav style={{ flex: 1, padding: '16px' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  transition: 'background-color 0.2s',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--accent-dark)' : 'var(--text)',
                })}
              >
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 500,
                  fontSize: '15px',
                }}>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div style={{
        padding: '16px',
        borderTop: '1px solid var(--border)',
        fontSize: '14px',
        color: 'var(--text-muted)',
      }}>
        <p>© {new Date().getFullYear()} Aliada Tech</p>
      </div>
    </div>
  )
}