import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ReglaConfigurable } from '../types'
import { CLAVES_ALMACEN, leerAlmacen, guardarAlmacen } from '../utils/almacen'

/** Reglas configurables por el supervisor (Capacidad 1). Persisten en localStorage. */
export function useReglas() {
  const [reglas, setReglas] = useState<ReglaConfigurable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setReglas(leerAlmacen<ReglaConfigurable[]>(CLAVES_ALMACEN.reglas, []))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!loading) guardarAlmacen(CLAVES_ALMACEN.reglas, reglas)
  }, [reglas, loading])

  const agregarRegla = (nueva: Omit<ReglaConfigurable, 'id' | 'activa' | 'creadaEl'>) => {
    const regla: ReglaConfigurable = {
      ...nueva,
      id: uuidv4(),
      activa: true,
      creadaEl: new Date().toISOString(),
    }
    setReglas(prev => [...prev, regla])
    return regla
  }

  const actualizarRegla = (id: string, cambios: Partial<ReglaConfigurable>) => {
    setReglas(prev => prev.map(r => (r.id === id ? { ...r, ...cambios } : r)))
  }

  const eliminarRegla = (id: string) => {
    setReglas(prev => prev.filter(r => r.id !== id))
  }

  const toggleActiva = (id: string) => {
    setReglas(prev => prev.map(r => (r.id === id ? { ...r, activa: !r.activa } : r)))
  }

  const reglasActivas = reglas.filter(r => r.activa)

  return { reglas, reglasActivas, loading, agregarRegla, actualizarRegla, eliminarRegla, toggleActiva }
}
