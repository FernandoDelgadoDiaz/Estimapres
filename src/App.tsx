import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import InicioPage from './pages/InicioPage'
import ColaboradoresPage from './pages/ColaboradoresPage'
import NuevaSemanaPage from './pages/NuevaSemanaPage'
import UltimoHorarioPage from './pages/UltimoHorarioPage'
import ReglasPage from './pages/ReglasPage'
import HistorialPage from './pages/HistorialPage'
import LoginPage from './pages/LoginPage'
import { useAuth } from './hooks/useAuth'

function App() {
  const auth = useAuth()

  // Con Supabase configurado, la app exige login real (email + contraseña).
  // Una sesión anónima previa NO cuenta como login. Sin Supabase (dev sin
  // envs), la app corre en modo local sin pantalla de acceso.
  if (auth.configurado) {
    if (auth.cargando) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'var(--bg)',
          color: 'var(--text-muted)', fontFamily: "'Space Grotesk', sans-serif",
        }}>
          Cargando…
        </div>
      )
    }
    if (!auth.usuario || auth.usuario.esAnonimo) {
      return <LoginPage />
    }
  }

  return (
    <Routes>
      <Route path="/*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<InicioPage />} />
            <Route path="/colaboradores" element={<ColaboradoresPage />} />
            <Route path="/nueva-semana" element={<NuevaSemanaPage />} />
            <Route path="/ultimo-horario" element={<UltimoHorarioPage />} />
            <Route path="/reglas" element={<ReglasPage />} />
            <Route path="/historial" element={<HistorialPage />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}

export default App
