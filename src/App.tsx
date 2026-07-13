import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import InicioPage from './pages/InicioPage'
import ColaboradoresPage from './pages/ColaboradoresPage'
import NuevaSemanaPage from './pages/NuevaSemanaPage'
import ReglasPage from './pages/ReglasPage'
import HistorialPage from './pages/HistorialPage'

function App() {
  return (
    <Routes>
      <Route path="/*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<InicioPage />} />
            <Route path="/colaboradores" element={<ColaboradoresPage />} />
            <Route path="/nueva-semana" element={<NuevaSemanaPage />} />
            <Route path="/reglas" element={<ReglasPage />} />
            <Route path="/historial" element={<HistorialPage />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}

export default App