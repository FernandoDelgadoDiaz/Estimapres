import { useState } from 'react'
import { Colaborador, Franja, ResultadoAsignacion, ExcepcionSemanal, Auxiliar, Eventual, JornadaResumida } from '../types'
import { asignarHorariosConIA } from '../utils/iaAsignacion'
import type { OpcionesGeneracion } from '../algoritmo/adapter'

export function useAsignacion() {
  const [resultado, setResultado] = useState<ResultadoAsignacion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generarHorarios = async (necesidad: Franja[], cajeros: Colaborador[], auxiliares: Auxiliar[], eventuales: Eventual[], fechas?: string[], excepciones: ExcepcionSemanal[] = [], opciones?: OpcionesGeneracion) => {
    setLoading(true)
    setError(null)
    try {
      // Si no se proporcionan fechas, generar fechas de la semana actual (lunes a domingo)
      let fechasAUsar = fechas
      if (!fechasAUsar || fechasAUsar.length === 0) {
        fechasAUsar = generarFechasSemanaActual()
      }
      const resultado = await asignarHorariosConIA(necesidad, cajeros, auxiliares, eventuales, fechasAUsar, excepciones, opciones)
      setResultado(resultado)
      return resultado
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en asignación'
      // Manejo especial de errores de API key
      if (message.includes('API key')) {
        setError('Configurá tu API key de Anthropic en el archivo .env')
      } else if (message.includes('JSON inválido')) {
        setError('Claude devolvió una respuesta inválida. Intentá de nuevo.')
      } else if (message.includes('conexión') || message.includes('network')) {
        setError('Error de conexión, intentá de nuevo.')
      } else {
        setError(message)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }

  function generarFechasSemanaActual(): string[] {
    const hoy = new Date()
    const lunes = new Date(hoy)
    // Ajustar al lunes más reciente (0 = domingo, 1 = lunes)
    const diaSemana = hoy.getDay() // 0 domingo, 1 lunes, ..., 6 sábado
    const diff = diaSemana === 0 ? -6 : 1 - diaSemana // si es domingo, retroceder 6 días; sino, ajustar a lunes
    lunes.setDate(hoy.getDate() + diff)
    lunes.setHours(0, 0, 0, 0)
    const fechas: string[] = []
    for (let i = 0; i < 7; i++) {
      const fecha = new Date(lunes)
      fecha.setDate(lunes.getDate() + i)
      fechas.push(fecha.toISOString().split('T')[0]) // YYYY-MM-DD
    }
    return fechas
  }

  const reset = () => {
    setResultado(null)
    setError(null)
  }

  /**
   * Edición manual del horario generado (Capacidad 3). Reemplaza la jornada
   * de un colaborador en un día y recalcula las horas totales.
   */
  const editarJornada = (colaboradorId: string, dia: number, nueva: JornadaResumida) => {
    setResultado(prev => {
      if (!prev) return prev
      const horarios = prev.horarios.map(h => {
        if (h.colaboradorId !== colaboradorId) return h
        const jornadas = h.jornadas.map(j => {
          if (j.dia !== dia) return j
          const horas = nueva.esFranco
            ? 0
            : nueva.turnos.reduce((sum, t) => {
                const [hi, mi] = t.inicio.split(':').map(Number)
                const [hf, mf] = t.fin.split(':').map(Number)
                return sum + (hf * 60 + (mf || 0) - hi * 60 - (mi || 0)) / 60
              }, 0)
          return {
            ...j,
            esFranco: nueva.esFranco,
            turnos: nueva.esFranco ? [] : nueva.turnos,
            horas,
            rol: nueva.esFranco ? ('franco' as const) : ('cajero' as const),
          }
        })
        return {
          ...h,
          jornadas,
          totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
        }
      })
      return { ...prev, horarios }
    })
  }

  return {
    resultado,
    loading,
    error,
    generarHorarios,
    editarJornada,
    reset,
  }
}