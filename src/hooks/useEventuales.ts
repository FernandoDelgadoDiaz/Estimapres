import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Eventual, EVENTUALES_INICIALES } from '../types'

const STORAGE_KEY = 'aliada_eventuales'

export function useEventuales() {
  const [eventuales, setEventuales] = useState<Eventual[]>([])
  const [loading, setLoading] = useState(true)

  // Cargar eventuales del localStorage al inicio
  useEffect(() => {
    const loadEventuales = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          setEventuales(JSON.parse(stored))
        } else {
          // Primera vez: guardar datos iniciales (vacío)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(EVENTUALES_INICIALES))
          setEventuales(EVENTUALES_INICIALES)
        }
      } catch (error) {
        console.error('Error cargando eventuales:', error)
        setEventuales(EVENTUALES_INICIALES)
      } finally {
        setLoading(false)
      }
    }
    loadEventuales()
  }, [])

  // Guardar automáticamente cuando cambian los eventuales
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(eventuales))
    }
  }, [eventuales, loading])

  const agregarEventual = (nuevo: Omit<Eventual, 'id' | 'activo'>) => {
    const eventual: Eventual = {
      ...nuevo,
      id: uuidv4(),
      activo: true,
    }
    setEventuales(prev => [...prev, eventual])
    return eventual
  }

  const actualizarEventual = (id: string, cambios: Partial<Eventual>) => {
    setEventuales(prev =>
      prev.map(ev =>
        ev.id === id ? { ...ev, ...cambios } : ev
      )
    )
  }

  const eliminarEventual = (id: string) => {
    setEventuales(prev => prev.filter(ev => ev.id !== id))
  }

  const toggleActivo = (id: string) => {
    setEventuales(prev =>
      prev.map(ev =>
        ev.id === id ? { ...ev, activo: !ev.activo } : ev
      )
    )
  }

  const eventualesActivos = eventuales.filter(ev => ev.activo)

  return {
    eventuales,
    eventualesActivos,
    loading,
    agregarEventual,
    actualizarEventual,
    eliminarEventual,
    toggleActivo,
  }
}