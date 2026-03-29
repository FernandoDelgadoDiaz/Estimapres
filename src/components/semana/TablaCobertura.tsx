import { DIAS_SEMANA, HORAS_FRANJAS } from '../../types'

interface TablaCoberturaProps {
  coberturaFranjas: number[][]
  faltantesFranjas: number[][]
}

export default function TablaCobertura({
  coberturaFranjas,
  faltantesFranjas,
}: TablaCoberturaProps) {
  const getCellColor = (asignados: number, necesarios: number) => {
    if (necesarios === 0) return 'bg-gray-100 text-gray-500'
    if (asignados >= necesarios) return 'bg-green-100 text-green-800'
    if (asignados < necesarios) return 'bg-red-100 text-red-800'
    return 'bg-yellow-100 text-yellow-800'
  }

  const getCellText = (asignados: number, necesarios: number) => {
    if (necesarios === 0) return '0/0'
    return `${asignados}/${necesarios}`
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800">
          Cobertura por franja horaria
        </h3>
        <p className="text-gray-600 text-sm mt-1">
          Formato: cajeros asignados / cajeros necesarios
        </p>
      </div>

      <div className="overflow-x-auto max-h-96">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                Horario
              </th>
              {DIAS_SEMANA.map((dia) => (
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
            {HORAS_FRANJAS.map((hora, idx) => {
              const asignados = coberturaFranjas[idx] || Array(7).fill(0)
              const faltantes = faltantesFranjas[idx] || Array(7).fill(0)
              return (
                <tr key={hora} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white">
                    {hora}
                  </td>
                  {DIAS_SEMANA.map((_, diaIdx) => {
                    const necesarios = asignados[diaIdx] + faltantes[diaIdx]
                    return (
                      <td
                        key={diaIdx}
                        className={`px-4 py-3 whitespace-nowrap text-sm text-center font-medium ${getCellColor(
                          asignados[diaIdx],
                          necesarios
                        )}`}
                      >
                        {getCellText(asignados[diaIdx], necesarios)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded mr-2"></div>
            <span className="text-gray-700">Cobertura suficiente</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-100 border border-red-300 rounded mr-2"></div>
            <span className="text-gray-700">Faltan cajeros</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded mr-2"></div>
            <span className="text-gray-700">Cajeros sobrantes</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded mr-2"></div>
            <span className="text-gray-700">Sin necesidad</span>
          </div>
        </div>
      </div>
    </div>
  )
}