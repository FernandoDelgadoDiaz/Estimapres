interface PanelAlertasProps {
  alertas: string[]
  porcentajeCobertura: number
}

export default function PanelAlertas({ alertas, porcentajeCobertura }: PanelAlertasProps) {
  const alertasError = alertas.filter(a => a.startsWith('🔴') || a.includes('ERROR'))
  const alertasWarning = alertas.filter(a => a.startsWith('🟡') || a.includes('WARNING'))
  const alertasInfo = alertas.filter(a => a.startsWith('🟢') || a.includes('INFO'))

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold text-gray-800">Alertas y métricas</h3>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {porcentajeCobertura.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Cobertura total</div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">{alertasError.length}</div>
            <div className="text-sm text-red-700">Errores</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-600">{alertasWarning.length}</div>
            <div className="text-sm text-yellow-700">Advertencias</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{alertasInfo.length}</div>
            <div className="text-sm text-green-700">Informaciones</div>
          </div>
        </div>

        {/* Lista de alertas */}
        <div className="space-y-4">
          {alertasError.length > 0 && (
            <div>
              <h4 className="font-semibold text-red-700 mb-2 flex items-center">
                <span className="mr-2">🔴</span> Errores críticos
              </h4>
              <ul className="space-y-1">
                {alertasError.map((alerta, idx) => (
                  <li key={idx} className="text-sm text-red-600">
                    • {alerta.replace('🔴', '').trim()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {alertasWarning.length > 0 && (
            <div>
              <h4 className="font-semibold text-yellow-700 mb-2 flex items-center">
                <span className="mr-2">🟡</span> Advertencias
              </h4>
              <ul className="space-y-1">
                {alertasWarning.map((alerta, idx) => (
                  <li key={idx} className="text-sm text-yellow-600">
                    • {alerta.replace('🟡', '').trim()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {alertasInfo.length > 0 && (
            <div>
              <h4 className="font-semibold text-green-700 mb-2 flex items-center">
                <span className="mr-2">🟢</span> Información
              </h4>
              <ul className="space-y-1">
                {alertasInfo.map((alerta, idx) => (
                  <li key={idx} className="text-sm text-green-600">
                    • {alerta.replace('🟢', '').trim()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {alertas.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🎉</div>
              <h4 className="text-lg font-semibold text-gray-800">
                ¡Todo perfecto!
              </h4>
              <p className="text-gray-600">
                No se detectaron errores ni advertencias en la asignación.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}