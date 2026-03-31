import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Auxiliar, AUXILIARES_INICIALES } from '../types'

const STORAGE_KEY = 'aliada_auxiliares'

export function useAuxiliares() {
  const [auxiliares, setAuxiliares] = useState<Auxiliar[]>([])
  const [loading, setLoading] = useState(true)

  // Cargar auxiliares del localStorage al inicio
  useEffect(() => {
    const loadAuxiliares = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          setAuxiliares(parsed)
        } else {
          // Primera vez: guardar datos iniciales
          localStorage.setItem(STORAGE_KEY, JSON.stringify(AUXILIARES_INICIALES))
          setAuxiliares(AUXILIARES_INICIALES)
        }
      } catch (error) {
        console.error('Error cargando auxiliares:', error)
        setAuxiliares(AUXILIARES_INICIALES)
      } finally {
        setLoading(false)
      }
    }
    loadAuxiliares()
  }, [])

  // Guardar automáticamente cuando cambian los auxiliares
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auxiliares))
    }
  }, [auxiliares, loading])

  const agregarAuxiliar = (nuevo: Omit<Auxiliar, 'id' | 'activo'>) => {
    const auxiliar: Auxiliar = {
      ...nuevo,
      id: uuidv4(),
      activo: true,
    }
    setAuxiliares(prev => [...prev, auxiliar])
    return auxiliar
  }

  const actualizarAuxiliar = (id: string, cambios: Partial<Auxiliar>) => {
    setAuxiliares(prev =>
      prev.map(aux =>
        aux.id === id ? { ...aux, ...cambios } : aux
      )
    )
  }

  const eliminarAuxiliar = (id: string) => {
    setAuxiliares(prev => prev.filter(aux => aux.id !== id))
  }

  const toggleActivo = (id: string) => {
    setAuxiliares(prev =>
      prev.map(aux =>
        aux.id === id ? { ...aux, activo: !aux.activo } : aux
      )
    )
  }

  const resetAuxiliares = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AUXILIARES_INICIALES))
    setAuxiliares(AUXILIARES_INICIALES)
  }

  const auxiliaresActivos = auxiliares.filter(aux => aux.activo)

  return {
    auxiliares,
    auxiliaresActivos,
    loading,
    agregarAuxiliar,
    actualizarAuxiliar,
    eliminarAuxiliar,
    toggleActivo,
    resetAuxiliares,
  }
}