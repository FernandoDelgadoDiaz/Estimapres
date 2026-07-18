import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SemanaHistorial } from '../types'
import { cargarHistorial, guardarSemana, eliminarSemanaRemota, reemplazarHistorial } from '../utils/almacen'

/**
 * Historial de semanas generadas (Capacidad 2: rotación) con versionado.
 * Persiste en Supabase; localStorage como fallback. Estado optimista.
 */
export function useHistorial() {
  const [historial, setHistorial] = useState<SemanaHistorial[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    cargarHistorial()
      .then(hs => { if (vivo) setHistorial(hs) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  /**
   * Guarda una nueva versión de la semana. Regenerar el mismo lunes NO pisa la
   * versión anterior: crea version = max(previa) + 1 (versionado real).
   */
  const agregarSemana = (
    datos: Omit<SemanaHistorial, 'id' | 'version' | 'generadoEl' | 'editadoManualmente' | 'modificadoEl'>
  ): SemanaHistorial => {
    const versionesPrevias = historial.filter(s => s.fechaLunes === datos.fechaLunes)
    const version = versionesPrevias.reduce((max, s) => Math.max(max, s.version), 0) + 1
    const semana: SemanaHistorial = {
      id: uuidv4(),
      version,
      generadoEl: new Date().toISOString(),
      editadoManualmente: false,
      ...datos,
    }
    setHistorial(prev => [...prev, semana].sort(ordenarSemanas))
    void guardarSemana(semana)
    return semana
  }

  const actualizarSemana = (id: string, cambios: Partial<SemanaHistorial>) => {
    // IMPORTANTE: no capturar la semana dentro del updater de setState — React
    // puede diferir su ejecución y la persistencia no se dispararía nunca
    // (la edición se veía en pantalla pero se perdía al recargar).
    const actual = historial.find(s => s.id === id)
    if (!actual) return
    const actualizada: SemanaHistorial = {
      ...actual,
      ...cambios,
      modificadoEl: new Date().toISOString(),
    }
    setHistorial(prev => prev.map(s => (s.id === id ? actualizada : s)))
    void guardarSemana(actualizada)
  }

  const eliminarSemana = (id: string) => {
    setHistorial(prev => prev.filter(s => s.id !== id))
    void eliminarSemanaRemota(id)
  }

  const reemplazarTodo = (nuevas: SemanaHistorial[]) => {
    setHistorial([...nuevas].sort(ordenarSemanas))
    void reemplazarHistorial(nuevas)
  }

  return { historial, loading, agregarSemana, actualizarSemana, eliminarSemana, reemplazarTodo }
}

function ordenarSemanas(a: SemanaHistorial, b: SemanaHistorial): number {
  if (a.fechaLunes !== b.fechaLunes) return a.fechaLunes.localeCompare(b.fechaLunes)
  return a.version - b.version
}
