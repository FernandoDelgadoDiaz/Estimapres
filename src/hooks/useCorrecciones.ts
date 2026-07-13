import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CorreccionManual } from '../types'
import { CLAVES_ALMACEN, leerAlmacen, guardarAlmacen, LIMITE_CORRECCIONES } from '../utils/almacen'

/** Correcciones manuales del supervisor (Capacidad 3: aprendizaje). Persisten en localStorage. */
export function useCorrecciones() {
  const [correcciones, setCorrecciones] = useState<CorreccionManual[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setCorrecciones(leerAlmacen<CorreccionManual[]>(CLAVES_ALMACEN.correcciones, []))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!loading) guardarAlmacen(CLAVES_ALMACEN.correcciones, correcciones)
  }, [correcciones, loading])

  const agregarCorreccion = (datos: Omit<CorreccionManual, 'id' | 'fecha'>) => {
    const correccion: CorreccionManual = {
      ...datos,
      id: uuidv4(),
      fecha: new Date().toISOString(),
    }
    setCorrecciones(prev => [...prev, correccion].slice(-LIMITE_CORRECCIONES))
    return correccion
  }

  const eliminarCorreccion = (id: string) => {
    setCorrecciones(prev => prev.filter(c => c.id !== id))
  }

  /** Olvida un aprendizaje: elimina todas las correcciones que lo sustentan. */
  const eliminarCorrecciones = (ids: string[]) => {
    const set = new Set(ids)
    setCorrecciones(prev => prev.filter(c => !set.has(c.id)))
  }

  return { correcciones, loading, agregarCorreccion, eliminarCorreccion, eliminarCorrecciones }
}
