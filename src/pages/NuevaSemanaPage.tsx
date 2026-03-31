import { useState } from 'react'
import { ExcepcionSemanal, DIAS_SEMANA } from '../types'
import { usePDFParser } from '../hooks/usePDFParser'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
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
  const { auxiliaresActivos } = useAuxiliares()
  const { eventualesActivos } = useEventuales()
  const { resultado, loading: loadingAsignacion, error: errorAsignacion, generarHorarios, reset: resetAsignacion } = useAsignacion()
  const [semanaDesc, setSemanaDesc] = useState('')
  const [excepciones, setExcepciones] = useState<ExcepcionSemanal[]>([])
  const [mostrarExcepciones, setMostrarExcepciones] = useState(false)
  const [colaboradorSeleccionado, setColaboradorSeleccionado] = useState('')
  const [tipoSeleccionado, setTipoSeleccionado] = useState<ExcepcionSemanal['tipo']>('franco_dia')
  const [valorInput, setValorInput] = useState('')

  const handlePDFSelect = async (file: File) => {
    await parsearPDF(file)
    // Generar descripción de la semana basada en fecha actual
    const hoy = new Date()
    setSemanaDesc(`Semana ${format(hoy, 'w', { locale: es })} - ${format(hoy, 'MMMM yyyy', { locale: es })}`)
    setPaso('revisar')
  }

  const agregarExcepcion = () => {
    if (excepciones.length >= 10) {
      alert('Máximo 10 excepciones por semana')
      return
    }
    if (!colaboradorSeleccionado) {
      alert('Selecciona un colaborador')
      return
    }
    const colaborador = colaboradoresActivos.find(c => c.id === colaboradorSeleccionado)
    if (!colaborador) return
    let descripcion = ''
    switch (tipoSeleccionado) {
      case 'franco_dia':
        descripcion = `Franco el ${valorInput}`
        break
      case 'no_antes_de':
        descripcion = `No disponible antes de ${valorInput}`
        break
      case 'no_despues_de':
        descripcion = `No disponible después de ${valorInput}`
        break
      case 'siempre_cierre':
        descripcion = 'Siempre hacer cierre (turno hasta 22:30)'
        break
      case 'solo_matutino':
        descripcion = 'Solo turno matutino (terminar antes de las 15:00)'
        break
      case 'solo_nocturno':
        descripcion = 'Solo turno nocturno (empezar después de las 17:00)'
        break
    }
    const nuevaExcepcion: ExcepcionSemanal = {
      id: Date.now().toString(),
      colaboradorNombre: colaborador.nombre,
      tipo: tipoSeleccionado,
      valor: valorInput || undefined,
      descripcion,
    }
    setExcepciones([...excepciones, nuevaExcepcion])
    setColaboradorSeleccionado('')
    setTipoSeleccionado('franco_dia')
    setValorInput('')
  }

  const eliminarExcepcion = (id: string) => {
    setExcepciones(excepciones.filter(e => e.id !== id))
  }

  const handleGenerarHorarios = async () => {
    // Calcular fechas de la semana actual (lunes a domingo)
    const hoy = new Date()
    const lunes = startOfWeek(hoy, { weekStartsOn: 1 }) // 1 = lunes
    const fechas = Array.from({ length: 7 }, (_, i) => {
      const fecha = addDays(lunes, i)
      return format(fecha, 'yyyy-MM-dd')
    })
    const cajerosActivos = colaboradoresActivos.filter(c => c.tipo === 'FULL' || c.tipo === 'PART')
    await generarHorarios(necesidad, cajerosActivos, auxiliaresActivos, eventualesActivos, fechas, excepciones)
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
    setExcepciones([])
    setMostrarExcepciones(false)
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

            {/* Sección de excepciones semanales */}
            <div className="mt-8 p-6 border border-gray-200 rounded-xl bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Excepciones semanales (opcional)</h3>
                <button
                  onClick={() => setMostrarExcepciones(!mostrarExcepciones)}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  {mostrarExcepciones ? 'Ocultar' : 'Agregar excepción'}
                </button>
              </div>

              {mostrarExcepciones && (
                <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
                      <select
                        value={colaboradorSeleccionado}
                        onChange={(e) => setColaboradorSeleccionado(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Seleccionar...</option>
                        {colaboradoresActivos.map(col => (
                          <option key={col.id} value={col.id}>{col.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de excepción</label>
                      <select
                        value={tipoSeleccionado}
                        onChange={(e) => {
                          setTipoSeleccionado(e.target.value as ExcepcionSemanal['tipo'])
                          setValorInput('')
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="franco_dia">Franco en día específico</option>
                        <option value="no_antes_de">No disponible antes de cierta hora</option>
                        <option value="no_despues_de">No disponible después de cierta hora</option>
                        <option value="siempre_cierre">Siempre hacer cierre (turno hasta 22:30)</option>
                        <option value="solo_matutino">Solo turno matutino (terminar antes de las 15:00)</option>
                        <option value="solo_nocturno">Solo turno nocturno (empezar después de las 17:00)</option>
                      </select>
                    </div>
                    <div>
                      {(tipoSeleccionado === 'franco_dia' || tipoSeleccionado === 'no_antes_de' || tipoSeleccionado === 'no_despues_de') && (
                        <>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {tipoSeleccionado === 'franco_dia' ? 'Día de la semana' : 'Hora (HH:MM)'}
                          </label>
                          {tipoSeleccionado === 'franco_dia' ? (
                            <select
                              value={valorInput}
                              onChange={(e) => setValorInput(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Seleccionar...</option>
                              {DIAS_SEMANA.map(dia => (
                                <option key={dia} value={dia}>{dia}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="time"
                              value={valorInput}
                              onChange={(e) => setValorInput(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              step="300"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={agregarExcepcion}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
                    >
                      <span className="mr-2">+</span>
                      Agregar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de excepciones agregadas */}
              {excepciones.length > 0 && (
                <div className="mt-4">
                  <div className="flex flex-wrap gap-2">
                    {excepciones.map(exc => (
                      <div
                        key={exc.id}
                        className="inline-flex items-center bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm"
                      >
                        <span>{exc.descripcion}</span>
                        <button
                          onClick={() => eliminarExcepcion(exc.id)}
                          className="ml-2 text-blue-600 hover:text-blue-900 font-bold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    {excepciones.length} / 10 excepciones agregadas
                  </p>
                </div>
              )}
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
            necesidadFranjas={necesidad.map(f => f.necesidad)}
          />

          <TablaHorarios
            horarios={resultado.horarios}
            colaboradores={colaboradoresActivos}
            auxiliares={auxiliaresActivos}
            eventuales={eventualesActivos}
          />
        </div>
      )}
    </div>
  )
}