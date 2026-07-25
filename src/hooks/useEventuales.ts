import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Eventual } from '../types'
import { claveConSucursal } from '../utils/sucursal'
import { cargarGrupoRoster, guardarItemRoster, eliminarItemRoster, actualizarCacheRoster, CLAVES_ROSTER } from '../utils/almacen'

/**
 * Eventuales de otros sectores. Persisten en Supabase (tabla colaboradores,
 * por sucursal); localStorage como backup offline. Estado optimista.
 */
export function useEventuales() {
  const [eventuales, setEventuales] = useState<Eventual[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    cargarGrupoRoster<Eventual>('eventual')
      .then(es => { if (vivo) setEventuales(es) })
      .catch(error => console.error('Error cargando eventuales:', error))
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  // Backup local automático (offline) + sincronización del cache compartido:
  // un eventual desactivado acá NO debe entrar a la generación de horarios.
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(claveConSucursal(CLAVES_ROSTER.eventual), JSON.stringify(eventuales))
      actualizarCacheRoster('eventual', eventuales)
    }
  }, [eventuales, loading])

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
    agregarEventual,
    actualizarEventual,
    eliminarEventual,
    toggleActivo,
  }
}
