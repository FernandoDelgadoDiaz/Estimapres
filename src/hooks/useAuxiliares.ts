import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Auxiliar } from '../types'
import { cargarGrupoRoster, guardarItemRoster, eliminarItemRoster, actualizarCacheRoster } from '../utils/almacen'

/**
 * Auxiliares supervisores (AUX). Persisten en Supabase (tabla colaboradores,
 * por sucursal); el modo sin Supabase guarda en el dispositivo.
 */
export function useAuxiliares() {
  const [auxiliares, setAuxiliares] = useState<Auxiliar[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarGrupoRoster<Auxiliar>('auxiliar')
      .then(items => { if (vivo) setAuxiliares(items) })
      .catch(error => {
        console.error('Error cargando auxiliares:', error)
        if (vivo) setErrorCarga(true)
      })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  // Comparte el roster vigente con la generación de horarios.
  useEffect(() => {
    if (!loading && !errorCarga) actualizarCacheRoster('auxiliar', auxiliares)
  }, [auxiliares, loading, errorCarga])

  const agregarAuxiliar = (nuevo: Omit<Auxiliar, 'id' | 'activo'>) => {
    const auxiliar: Auxiliar = { ...nuevo, id: uuidv4(), activo: true }
    setAuxiliares(prev => [...prev, auxiliar])
    void guardarItemRoster('auxiliar', auxiliar)
    return auxiliar
  }

  const actualizarAuxiliar = (id: string, cambios: Partial<Auxiliar>) => {
    const actual = auxiliares.find(a => a.id === id)
    if (!actual) return
    const actualizado = { ...actual, ...cambios }
    setAuxiliares(prev => prev.map(aux => (aux.id === id ? actualizado : aux)))
    void guardarItemRoster('auxiliar', actualizado)
  }

  const eliminarAuxiliar = (id: string) => {
    setAuxiliares(prev => prev.filter(aux => aux.id !== id))
    void eliminarItemRoster(id)
  }

  const toggleActivo = (id: string) => {
    const actual = auxiliares.find(a => a.id === id)
    if (!actual) return
    actualizarAuxiliar(id, { activo: !actual.activo })
  }

  const auxiliaresActivos = auxiliares.filter(aux => aux.activo)

  return {
    auxiliares,
    auxiliaresActivos,
    loading,
    errorCarga,
    agregarAuxiliar,
    actualizarAuxiliar,
    eliminarAuxiliar,
    toggleActivo,
  }
}
