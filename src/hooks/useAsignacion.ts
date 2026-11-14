import { minutosDesdeMedianoche } from '../utils/timeUtils'
import { useState } from 'react'
import { Colaborador, Franja, ResultadoAsignacion, ExcepcionSemanal, Auxiliar, Eventual, JornadaResumida, HorarioColaborador } from '../types'
import { minutosAsignados } from '../utils/horasSemanales'
import { asignarHorariosConIA } from '../utils/iaAsignacion'
import type { OpcionesGeneracion } from '../algoritmo/adapter'
import { recalcularCajaAux } from '../utils/recalculoAux'
import type { ConfigOperativa } from '../utils/preferencias'

/**
 * Aplica una edición manual de jornada sobre una lista de horarios y devuelve
 * la lista nueva con las horas recalculadas. Función pura: la usan tanto la
 * pantalla de generación (useAsignacion) como "Último horario" (edición sobre
 * la semana guardada en el historial).
 */
export function aplicarEdicionJornada(
  horarios: HorarioColaborador[],
  colaboradorId: string,
  dia: number,
  nueva: JornadaResumida
): HorarioColaborador[] {
  return horarios.map(h => {
    if (h.colaboradorId !== colaboradorId) return h
    const jornadas = h.jornadas.map(j => {
      if (j.dia !== dia) return j
      const horas = minutosAsignados([nueva]) / 60
      return {
        ...j,
        esFranco: nueva.esFranco,
        turnos: nueva.esFranco ? [] : nueva.turnos,
        horas,
        rol: nueva.esFranco ? 'franco' as const : j.esFranco ? h.rolGeneral : j.rol,
      }
    })
    return {
      ...h,
      jornadas,
      totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
    }
  })
}

/** Refleja las ediciones de caja de eventuales en el anexo y la cobertura. */
export function actualizarCajaEventual(
  caja: ResultadoAsignacion['cajaEventual'], id: string, dia: number, jornada: JornadaResumida, nombre: string,
): NonNullable<ResultadoAsignacion['cajaEventual']> {
  const existentes = caja ?? []
  const anterior = existentes.find(a => a.colaboradorId === id)
  const slotsCajaPorDia = Array.from({ length: 7 }, (_, d) => {
    if (d !== dia) return anterior?.slotsCajaPorDia[d] ?? Array<boolean>(30).fill(false)
    return Array.from({ length: 30 }, (_, slot) => {
      const inicio = 8 * 60 + slot * 30
      return !jornada.esFranco && jornada.turnos.some(turno =>
        minutosDesdeMedianoche(turno.inicio) <= inicio && minutosDesdeMedianoche(turno.fin) > inicio)
    })
  })
  return [...existentes.filter(a => a.colaboradorId !== id), { colaboradorId: id, nombre, slotsCajaPorDia }]
}

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
      // SEC-01: la generación no usa IA ni claves; no pedir API keys al usuario.
      if (message.includes('conexión') || message.includes('network')) {
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
  const editarJornada = (
    colaboradorId: string, dia: number, nueva: JornadaResumida, nombre?: string,
    // #38: si se edita la PRESENCIA de un AUX, sus bloques en CAJA se recalculan
    // con la misma configuración operativa (nunca quedan CAJA fuera de presencia).
    recalculo?: { necesidadFranjas: number[][]; nombrePorId: Record<string, string>; operativa: Partial<ConfigOperativa> },
  ) => {
    setResultado(prev => {
      if (!prev) return prev
      const esEventual = prev.horarios.some(h => h.colaboradorId === colaboradorId && h.rolGeneral === 'eventual_sector')
      const esAux = prev.horarios.some(h => h.colaboradorId === colaboradorId && h.rolGeneral === 'aux_supervisor')
      const horarios = aplicarEdicionJornada(prev.horarios, colaboradorId, dia, nueva)
      const cajaAux = esAux && recalculo
        ? recalcularCajaAux(horarios, recalculo.necesidadFranjas, recalculo.nombrePorId, recalculo.operativa) ?? prev.cajaAux
        : prev.cajaAux
      return {
        ...prev,
        horarios,
        cajaAux,
        cajaEventual: esEventual ? actualizarCajaEventual(prev.cajaEventual, colaboradorId, dia, nueva, nombre ?? colaboradorId) : prev.cajaEventual,
      }
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