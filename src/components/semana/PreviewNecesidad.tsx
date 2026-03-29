import { Franja, DIAS_SEMANA } from '../../types'

interface PreviewNecesidadProps {
  necesidad: Franja[]
}

export default function PreviewNecesidad({ necesidad }: PreviewNecesidadProps) {
  if (necesidad.length === 0) {
    return null
  }

  // Calcular totales por día
  const totalesPorDia = DIAS_SEMANA.map((_, diaIndex) =>
    necesidad.reduce((sum, franja) => sum + franja.necesidad[diaIndex], 0)
  )

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800">
          Necesidad de cajas extraída
        </h3>
        <p className="text-gray-600 text-sm mt-1">
          {necesidad.length} franjas horarias × 7 días
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Horario
              </th>
              {DIAS_SEMANA.map((dia, _idx) => (
                <th
                  key={dia}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {dia}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {necesidad.map((franja) => (
              <tr key={franja.hora} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {franja.hora}
                </td>
                {franja.necesidad.map((valor, diaIdx) => (
                  <td
                    key={diaIdx}
                    className={`px-4 py-3 whitespace-nowrap text-sm text-center ${
                      valor === 0
                        ? 'text-gray-400'
                        : 'text-gray-900 font-semibold'
                    }`}
                  >
                    {valor}
                  </td>
                ))}
              </tr>
            ))}
            {/* Totales */}
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                Total cajas-hora
              </td>
              {totalesPorDia.map((total, idx) => (
                <td
                  key={idx}
                  className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900"
                >
                  {total}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-blue-50 border-t border-blue-100">
        <div className="flex items-center text-sm text-blue-800">
          <span className="mr-2">ℹ️</span>
          <p>
            Se necesitan{' '}
            <span className="font-semibold">
              {totalesPorDia.reduce((a, b) => a + b, 0)} cajas-hora
            </span>{' '}
            esta semana. Cada cajero aporta ~48h (FULL/AUX) o ~30h (PART).
          </p>
        </div>
      </div>
    </div>
  )
}