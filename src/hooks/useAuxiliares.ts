import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Auxiliar, AUXILIARES_INICIALES } from '../types'
import { claveConSucursal } from '../utils/sucursal'
import { cargarGrupoRoster, guardarItemRoster, eliminarItemRoster, reemplazarGrupoRoster, CLAVES_ROSTER } from '../utils/almacen'

/**
 * Auxiliares supervisores (AUX). Persisten en Supabase (tabla colaboradores,
 * por sucursal); localStorage como backup offline. Estado optimista.
 */
export function useAuxiliares() {
  const [auxiliares, setAuxiliares] = useState<Auxiliar[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    cargarGrupoRoster<Auxiliar>('auxiliar')
      .then(as => { if (vivo) setAuxiliares(as) })
      .catch(error => console.error('Error cargando auxiliares:', error))
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  // Backup local automático (offline) de la lista completa por sucursal
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(claveConSucursal(CLAVES_ROSTER.auxiliar), JSON.stringify(auxiliares))
    }
  }, [auxiliares, loading])

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

  const resetAuxiliares = () => {
    setAuxiliares(AUXILIARES_INICIALES)
    localStorage.setItem(claveConSucursal(CLAVES_ROSTER.auxiliar), JSON.stringify(AUXILIARES_INICIALES))
    void reemplazarGrupoRoster('auxiliar', AUXILIARES_INICIALES)
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
