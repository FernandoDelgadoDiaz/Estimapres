import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import InicioPage from './pages/InicioPage'
import ColaboradoresPage from './pages/ColaboradoresPage'
import NuevaSemanaPage from './pages/NuevaSemanaPage'
import Login from './pages/Login'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<InicioPage />} />
            <Route path="/colaboradores" element={<ColaboradoresPage />} />
            <Route path="/nueva-semana" element={<NuevaSemanaPage />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}

export default App