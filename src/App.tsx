import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import InicioPage from './pages/InicioPage'
import ColaboradoresPage from './pages/ColaboradoresPage'
import NuevaSemanaPage from './pages/NuevaSemanaPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<InicioPage />} />
        <Route path="/colaboradores" element={<ColaboradoresPage />} />
        <Route path="/nueva-semana" element={<NuevaSemanaPage />} />
      </Routes>
    </Layout>
  )
}

export default App