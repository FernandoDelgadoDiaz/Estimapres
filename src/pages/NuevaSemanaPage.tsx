import { useState } from 'react'
import { usePDFParser } from '../hooks/usePDFParser'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAsignacion } from '../hooks/useAsignacion'
import PDFUploader from '../components/semana/PDFUploader'
import PreviewNecesidad from '../components/semana/PreviewNecesidad'
import TablaCobertura from '../components/semana/TablaCobertura'
import TablaHorarios from '../components/semana/TablaHorarios'
import PanelAlertas from '../components/semana/PanelAlertas'
import { generarPDF } from '../utils/exportPDF'
import { format, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

type Paso = 'upload' | 'revisar' | 'resultado'

export default function NuevaSemanaPage() {
  const [paso, setPaso] = useState<Paso>('upload')
  const { necesidad, loading: loadingPDF, error: errorPDF, parsearPDF, reset: resetPDF } = usePDFParser()
  const { colaboradoresActivos } = useColaboradores()
  const { resultado, loading: loadingAsignacion, error: errorAsignacion, generarHorarios, reset: resetAsignacion } = useAsignacion()
  const [semanaDesc, setSemanaDesc] = useState('')

  const handlePDFSelect = async (file: File) => {
    await parsearPDF(file)
    // Generar descripción de la semana basada en fecha actual
    const hoy = new Date()
    setSemanaDesc(`Semana ${format(hoy, 'w', { locale: es })} - ${format(hoy, 'MMMM yyyy', { locale: es })}`)
    setPaso('revisar')
  }

  const handleGenerarHorarios = async () => {
    // Calcular fechas de la semana actual (lunes a domingo)
    const hoy = new Date()
    const lunes = startOfWeek(hoy, { weekStartsOn: 1 }) // 1 = lunes
    const fechas = Array.from({ length: 7 }, (_, i) => {
      const fecha = addDays(lunes, i)
      return format(fecha, 'yyyy-MM-dd')
    })
    await generarHorarios(necesidad, colaboradoresActivos, fechas)
    setPaso('resultado')
  }

  const handleExportarPDF = () => {
    if (!resultado) return
    const pdf = generarPDF(resultado, colaboradoresActivos, semanaDesc)
    pdf.save(`horarios-${semanaDesc.toLowerCase().replace(/ /g, '-')}.pdf`)
  }

  const handleNuevaSemana = () => {
    resetPDF()
    resetAsignacion()
    setPaso('upload')
  }

  // Calcular horas totales necesarias estimadas
  const horasNecesariasEstimadas = necesidad.reduce(
    (sum, franja) => sum + franja.necesidad.reduce((s, n) => s + n, 0),
    0
  ) * 0.5 // Cada franja son 0.5h

  const horasDisponibles = colaboradoresActivos.reduce((sum, col) => {
    if (col.tipo === 'PART') return sum + 32 // Máximo para PART
    return sum + col.horasSemanales
  }, 0)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Nueva Semana</h1>
        <p className="text-gray-600 mt-2">
          Sube el PDF con la necesidad de cajas y genera los horarios automáticamente.
        </p>
      </div>

      {/* Pasos */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className={`flex items-center ${paso === 'upload' ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paso === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
              1
            </div>
            <span className="ml-2 font-medium">Subir PDF</span>
          </div>
          <div className="w-12 h-0.5 bg-gray-300"></div>
          <div className={`flex items-center ${paso === 'revisar' ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paso === 'revisar' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
              2
            </div>
            <span className="ml-2 font-medium">Revisar</span>
          </div>
          <div className="w-12 h-0.5 bg-gray-300"></div>
          <div className={`flex items-center ${paso === 'resultado' ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paso === 'resultado' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
              3
            </div>
            <span className="ml-2 font-medium">Resultado</span>
          </div>
        </div>

        {paso !== 'upload' && (
          <button
            onClick={handleNuevaSemana}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Nueva semana
          </button>
        )}
      </div>

      {/* Paso 1: Upload */}
      {paso === 'upload' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8">
          <PDFUploader
            onFileSelect={handlePDFSelect}
            loading={loadingPDF}
            error={errorPDF}
          />
        </div>
      )}

      {/* Paso 2: Revisar */}
      {paso === 'revisar' && (
        <div className="space-y-8">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Resumen de necesidad
            </h3>
            <PreviewNecesidad necesidad={necesidad} />
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Colaboradores activos esta semana
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Horas Sem.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {colaboradoresActivos.map((col) => (
                    <tr key={col.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">{col.nombre}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                          col.tipo === 'FULL' ? 'bg-blue-100 text-blue-800' :
                          col.tipo === 'PART' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {col.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{col.horasSemanales}h</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Activo
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Horas necesarias estimadas</h4>
                  <p className="text-2xl font-bold text-gray-900">{horasNecesariasEstimadas.toFixed(1)}h</p>
                  <p className="text-sm text-gray-600">Basado en la tabla de necesidad</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Horas disponibles máximas</h4>
                  <p className="text-2xl font-bold text-gray-900">{horasDisponibles}h</p>
                  <p className="text-sm text-gray-600">Sumatoria de todos los colaboradores activos</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${Math.min(100, (horasDisponibles / horasNecesariasEstimadas) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {horasDisponibles >= horasNecesariasEstimadas
                    ? '✅ Horas suficientes para cubrir la necesidad'
                    : '⚠️ Puede haber faltantes de cobertura'}
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleGenerarHorarios}
                disabled={loadingAsignacion}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center disabled:opacity-50"
              >
                {loadingAsignacion ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Aliada IA está generando el horario óptimo...
                  </>
                ) : (
                  <>
                    <span className="text-xl mr-2">🚀</span>
                    Generar horarios automáticamente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paso 3: Resultado */}
      {paso === 'resultado' && resultado && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Horarios generados</h2>
              <p className="text-gray-600">{semanaDesc}</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleNuevaSemana}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Nueva semana
              </button>
              <button
                onClick={handleExportarPDF}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
              >
                <span className="mr-2">📄</span>
                Exportar a PDF
              </button>
            </div>
          </div>

          {errorAsignacion && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <span className="text-red-500 mr-2">❌</span>
                <p className="text-red-700">{errorAsignacion}</p>
              </div>
            </div>
          )}

          <PanelAlertas
            alertas={resultado.alertas}
            porcentajeCobertura={resultado.porcentajeCobertura}
          />

          <TablaCobertura
            coberturaFranjas={resultado.coberturaFranjas}
            faltantesFranjas={resultado.faltantesFranjas}
          />

          <TablaHorarios
            horarios={resultado.horarios}
            colaboradores={colaboradoresActivos}
          />
        </div>
      )}
    </div>
  )
}