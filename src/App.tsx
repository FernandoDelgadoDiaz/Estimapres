import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import InicioPage from './pages/InicioPage'
import ColaboradoresPage from './pages/ColaboradoresPage'
import NuevaSemanaPage from './pages/NuevaSemanaPage'
import HorariosPage from './pages/HorariosPage'
import ReglasPage from './pages/ReglasPage'
import HistorialPage from './pages/HistorialPage'
import EfectividadPage from './pages/EfectividadPage'
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
            <Route path="/nueva-semana" element={<NuevaSemanaPage autorSesion={auth.usuario?.id} />} />
            <Route path="/horarios" element={<HorariosPage />} />
            <Route path="/ultimo-horario" element={<Navigate to="/horarios" replace />} />
            <Route path="/reglas" element={<ReglasPage />} />
            {/* Fuera del menú del supervisor (decisión del propietario, 21/11/2026): el aprendizaje y la
                efectividad siguen funcionando por detrás; estas pantallas quedan solo para administración. */}
            <Route path="/historial" element={<HistorialPage />} />
            <Route path="/efectividad" element={<EfectividadPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}

export default App
