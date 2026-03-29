import { HorarioColaborador, Colaborador, DIAS_SEMANA } from '../../types'
import { formatoTurno } from '../../utils/timeUtils'

interface TablaHorariosProps {
  horarios: HorarioColaborador[]
  colaboradores: Colaborador[]
}

export default function TablaHorarios({ horarios, colaboradores }: TablaHorariosProps) {
  const colaboradoresMap = new Map(colaboradores.map(c => [c.id, c]))

  const tiposColor = {
    FULL: 'bg-blue-100 text-blue-800',
    PART: 'bg-green-100 text-green-800',
    AUX: 'bg-purple-100 text-purple-800',
  }

  if (horarios.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8 text-center">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          No hay horarios generados
        </h3>
        <p className="text-gray-600">
          Genera los horarios primero para ver la asignación por colaborador.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800">
          Horarios asignados por colaborador
        </h3>
        <p className="text-gray-600 text-sm mt-1">
          {horarios.length} colaboradores con horarios generados
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                Colaborador
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hs
              </th>
              {DIAS_SEMANA.map((dia) => (
                <th
                  key={dia}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {dia}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Errores
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {horarios.map((horario) => {
              const col = colaboradoresMap.get(horario.colaboradorId)
              if (!col) return null

              return (
                <tr key={horario.colaboradorId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white">
                    {col.nombre}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${tiposColor[col.tipo]}`}
                    >
                      {col.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {horario.totalHoras}h
                  </td>
                  {DIAS_SEMANA.map((_, diaIndex) => {
                    const jornada = horario.jornadas[diaIndex]
                    return (
                      <td
                        key={diaIndex}
                        className={`px-4 py-3 whitespace-nowrap text-sm ${
                          jornada.esFranco
                            ? 'bg-gray-100 text-gray-500 italic'
                            : 'text-gray-900'
                        }`}
                      >
                        {jornada.esFranco ? 'FRANCO' : formatoTurno(jornada.turnos)}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {horario.errores.length > 0 ? (
                      <div className="text-xs text-red-600">
                        {horario.errores.map((err, idx) => (
                          <div key={idx}>• {err}</div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-green-600">✅ OK</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}