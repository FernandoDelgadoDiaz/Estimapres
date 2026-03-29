import { NavLink } from 'react-router-dom'

const navItems = [
  { path: '/', label: 'Inicio', icon: '🏠' },
  { path: '/colaboradores', label: 'Colaboradores', icon: '👥' },
  { path: '/nueva-semana', label: 'Nueva Semana', icon: '📅' },
  // { path: '/historial', label: 'Historial', icon: '📋' },
]

export default function Sidebar() {
  return (
    <div className="w-64 bg-gray-900 text-gray-300 flex flex-col h-full">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white">Aliada Horarios</h1>
        <p className="text-sm text-gray-400 mt-1">Aliada Tech 2026</p>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-800 text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Aliada Tech</p>
      </div>
    </div>
  )
}