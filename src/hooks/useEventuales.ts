import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Eventual } from '../types'
import { cargarGrupoRoster, guardarItemRoster, eliminarItemRoster, actualizarCacheRoster } from '../utils/almacen'

/**
 * Eventuales de otros sectores. Persisten en Supabase (tabla colaboradores,
 * por sucursal); el modo sin Supabase guarda en el dispositivo.
 */
export function useEventuales() {
  const [eventuales, setEventuales] = useState<Eventual[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarGrupoRoster<Eventual>('eventual')
      .then(items => { if (vivo) setEventuales(items) })
      .catch(error => {
        console.error('Error cargando eventuales:', error)
        if (vivo) setErrorCarga(true)
      })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  // Comparte el roster vigente con la generación de horarios.
  useEffect(() => {
    if (!loading && !errorCarga) actualizarCacheRoster('eventual', eventuales)
  }, [eventuales, loading, errorCarga])

  const agregarEventual = (nuevo: Omit<Eventual, 'id' | 'activo'>) => {
    const eventual: Eventual = { ...nuevo, id: uuidv4(), activo: true }
    setEventuales(prev => [...prev, eventual])
    void guardarItemRoster('eventual', eventual)
    return eventual
  }

  const actualizarEventual = (id: string, cambios: Partial<Eventual>) => {
    const actual = eventuales.find(e => e.id === id)
    if (!actual) return
    const actualizado = { ...actual, ...cambios }
    setEventuales(prev => prev.map(ev => (ev.id === id ? actualizado : ev)))
    void guardarItemRoster('eventual', actualizado)
  }

  const eliminarEventual = (id: string) => {
    setEventuales(prev => prev.filter(ev => ev.id !== id))
    void eliminarItemRoster(id)
  }

  const toggleActivo = (id: string) => {
    const actual = eventuales.find(e => e.id === id)
    if (!actual) return
    actualizarEventual(id, { activo: !actual.activo })
  }

  const eventualesActivos = eventuales.filter(ev => ev.activo)

  return {
    eventuales,
    eventualesActivos,
    loading,
    errorCarga,
    agregarEventual,
    actualizarEventual,
    eliminarEventual,
    toggleActivo,
  }
}
