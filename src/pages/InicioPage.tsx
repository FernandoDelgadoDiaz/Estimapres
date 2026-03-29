import { Link } from 'react-router-dom'

export default function InicioPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Bienvenido al Asignador de Horarios de Cajeros
        </h1>
        <p className="text-lg text-gray-600">
          Automatiza la asignación semanal de turnos respetando todas las reglas de negocio.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="text-4xl mb-4">👥</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Gestionar Colaboradores</h3>
          <p className="text-gray-600 mb-4">
            Agrega, edita o desactiva cajeros full-time, part-time y auxiliares.
          </p>
          <Link
            to="/colaboradores"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Administrar colaboradores
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="text-4xl mb-4">📅</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Generar Nueva Semana</h3>
          <p className="text-gray-600 mb-4">
            Sube el PDF con la necesidad de cajas y genera automáticamente los horarios.
          </p>
          <Link
            to="/nueva-semana"
            className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            Comenzar nueva semana
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Ver Historial</h3>
          <p className="text-gray-600 mb-4">
            Consulta horarios anteriores y métricas de cobertura (próximamente).
          </p>
          <button
            disabled
            className="inline-block bg-gray-400 text-white px-4 py-2 rounded-lg cursor-not-allowed"
          >
            Próximamente
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-8 border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">¿Cómo funciona?</h2>
        <ol className="space-y-4">
          <li className="flex items-start">
            <span className="bg-blue-100 text-blue-600 font-bold rounded-full w-8 h-8 flex items-center justify-center mr-4 flex-shrink-0">1</span>
            <div>
              <h4 className="font-semibold text-gray-800">Sube el PDF semanal</h4>
              <p className="text-gray-600">
                El sistema extrae automáticamente la tabla "Estimado de cajas necesarias" del PDF.
              </p>
            </div>
          </li>
          <li className="flex items-start">
            <span className="bg-blue-100 text-blue-600 font-bold rounded-full w-8 h-8 flex items-center justify-center mr-4 flex-shrink-0">2</span>
            <div>
              <h4 className="font-semibold text-gray-800">Revisa los colaboradores activos</h4>
              <p className="text-gray-600">
                Verifica qué cajeros están disponibles para la semana y ajusta si es necesario.
              </p>
            </div>
          </li>
          <li className="flex items-start">
            <span className="bg-blue-100 text-blue-600 font-bold rounded-full w-8 h-8 flex items-center justify-center mr-4 flex-shrink-0">3</span>
            <div>
              <h4 className="font-semibold text-gray-800">Genera los horarios</h4>
              <p className="text-gray-600">
                El algoritmo asigna turnos respetando todas las reglas de negocio y prioridades.
              </p>
            </div>
          </li>
          <li className="flex items-start">
            <span className="bg-blue-100 text-blue-600 font-bold rounded-full w-8 h-8 flex items-center justify-center mr-4 flex-shrink-0">4</span>
            <div>
              <h4 className="font-semibold text-gray-800">Exporta el resultado</h4>
              <p className="text-gray-600">
                Descarga un PDF profesional con los horarios y tabla de cobertura.
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}