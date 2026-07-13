import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SemanaHistorial, HorarioColaborador, ResumenTurnos } from '../types'
import { CLAVES_ALMACEN, leerAlmacen, guardarAlmacen, LIMITE_HISTORIAL_SEMANAS } from '../utils/almacen'

/** Historial de semanas generadas (Capacidad 2: rotación). Persiste en localStorage. */
export function useHistorial() {
  const [historial, setHistorial] = useState<SemanaHistorial[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setHistorial(leerAlmacen<SemanaHistorial[]>(CLAVES_ALMACEN.historial, []))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!loading) guardarAlmacen(CLAVES_ALMACEN.historial, historial)
  }, [historial, loading])

  const agregarSemana = (datos: {
    fechaLunes: string
    descripcion: string
    horarios: HorarioColaborador[]
    resumenPorColaborador: Record<string, ResumenTurnos>
  }): SemanaHistorial => {
    const semana: SemanaHistorial = {
      id: uuidv4(),
      generadoEl: new Date().toISOString(),
      editadoManualmente: false,
      ...datos,
    }
    setHistorial(prev => {
      // Regenerar la misma semana reemplaza el registro anterior
      const sinDuplicado = prev.filter(s => s.fechaLunes !== datos.fechaLunes)
      const nuevo = [...sinDuplicado, semana].sort((a, b) => a.fechaLunes.localeCompare(b.fechaLunes))
      return nuevo.slice(-LIMITE_HISTORIAL_SEMANAS)
    })
    return semana
  }

  const actualizarSemana = (id: string, cambios: Partial<SemanaHistorial>) => {
    setHistorial(prev => prev.map(s => (s.id === id ? { ...s, ...cambios } : s)))
  }

  const eliminarSemana = (id: string) => {
    setHistorial(prev => prev.filter(s => s.id !== id))
  }

  return { historial, loading, agregarSemana, actualizarSemana, eliminarSemana }
}
