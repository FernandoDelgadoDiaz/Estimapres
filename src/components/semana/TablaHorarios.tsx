import { HorarioColaborador, Colaborador, Auxiliar, Eventual, DIAS_SEMANA } from '../../types'
import { formatoTurno } from '../../utils/timeUtils'

interface TablaHorariosProps {
  horarios: HorarioColaborador[]
  colaboradores: Colaborador[]
  auxiliares?: Auxiliar[]
  eventuales?: Eventual[]
}

export default function TablaHorarios({ horarios, colaboradores, auxiliares = [], eventuales = [] }: TablaHorariosProps) {

  const tiposColor = {
    FULL: 'bg-blue-100 text-blue-800',
    PART: 'bg-green-100 text-green-800',
    AUX: 'bg-purple-100 text-purple-800',
    EVENTUAL: 'bg-yellow-100 text-yellow-800',
    cajero: 'bg-gray-100 text-gray-800',
  }

  const rolColor: Record<string, string> = {
    cajero: '#ffffff',
    aux_supervisor: '#D1FAE5',
    aux_eventual: '#DBEAFE',
    eventual_sector: '#FED7AA',
    franco: '#F3F4F6', // gray-100
    franco_medio: '#FEF9C3',
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
              // Buscar colaborador en este orden: colaboradores -> auxiliares -> eventuales
              const col = colaboradores.find(c => c.id === horario.colaboradorId)
              const aux = auxiliares?.find(a => a.id === horario.colaboradorId)
              const event = eventuales?.find(e => e.id === horario.colaboradorId)

              let nombre = horario.colaboradorId
              let tipo = 'cajero'

              if (col) {
                nombre = col.nombre
                tipo = col.tipo
              } else if (aux) {
                nombre = aux.nombre
                tipo = 'AUX'
              } else if (event) {
                nombre = event.nombre
                tipo = 'EVENTUAL'
              } else {
                // Inferir tipo del rolGeneral si no se encuentra
                if (horario.rolGeneral.includes('aux')) {
                  tipo = 'AUX'
                } else if (horario.rolGeneral.includes('eventual')) {
                  tipo = 'EVENTUAL'
                }
              }
              const tipoColor = tiposColor[tipo as keyof typeof tiposColor] || tiposColor.FULL

              return (
                <tr key={horario.colaboradorId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white">
                    {nombre}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${tipoColor}`}
                    >
                      {tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {horario.totalHoras}h
                  </td>
                  {DIAS_SEMANA.map((_, diaIndex) => {
                    const jornada = horario.jornadas[diaIndex]
                    const rol = jornada.rol || (jornada.esFranco ? 'franco' : 'cajero')
                    const bgColor = rolColor[rol] || '#ffffff'
                    const isFrancoReal = jornada.esFranco || rol === 'franco'
                    return (
                      <td
                        key={diaIndex}
                        className={`px-4 py-3 whitespace-nowrap text-sm ${
                          isFrancoReal ? 'text-gray-500 italic' : 'text-gray-900'
                        }`}
                        style={{ backgroundColor: bgColor }}
                      >
                        {isFrancoReal ? 'FRANCO' : formatoTurno(jornada.turnos)}
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

      {/* Leyenda de colores */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Leyenda de roles</h4>
        <div className="flex flex-wrap gap-4">
          {Object.entries(rolColor).map(([rol, color]) => (
            <div key={rol} className="flex items-center">
              <div className="w-4 h-4 rounded mr-2 border border-gray-300" style={{ backgroundColor: color }}></div>
              <span className="text-xs text-gray-600">{rol}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}