import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Colaborador } from '../types'
import { cargarGrupoRoster, guardarItemRoster, eliminarItemRoster, actualizarCacheRoster } from '../utils/almacen'

/**
 * Cajeros FULL/PART (y AUX contractuales). Persisten en Supabase (tabla
 * colaboradores, por sucursal): un dispositivo nuevo los ve al iniciar
 * sesión. El modo sin Supabase guarda en el dispositivo.
 */
export function useColaboradores() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarGrupoRoster<Colaborador>('cajero')
      .then(items => { if (vivo) setColaboradores(items) })
      .catch(error => {
        console.error('Error cargando colaboradores:', error)
        if (vivo) setErrorCarga(true)
      })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  // Comparte el roster vigente con la generación de horarios.
  useEffect(() => {
    if (!loading && !errorCarga) actualizarCacheRoster('cajero', colaboradores)
  }, [colaboradores, loading, errorCarga])

  const agregarColaborador = (nuevo: Omit<Colaborador, 'id' | 'activo'>) => {
    const colaborador: Colaborador = { ...nuevo, id: uuidv4(), activo: true }
    setColaboradores(prev => [...prev, colaborador])
    void guardarItemRoster('cajero', colaborador)
    return colaborador
  }

  const actualizarColaborador = (id: string, cambios: Partial<Colaborador>) => {
    const actual = colaboradores.find(c => c.id === id)
    if (!actual) return
    const actualizado = { ...actual, ...cambios }
    setColaboradores(prev => prev.map(col => (col.id === id ? actualizado : col)))
    void guardarItemRoster('cajero', actualizado)
  }

  const eliminarColaborador = (id: string) => {
    setColaboradores(prev => prev.filter(col => col.id !== id))
    void eliminarItemRoster(id)
  }

  const toggleActivo = (id: string) => {
    const actual = colaboradores.find(c => c.id === id)
    if (!actual) return
    actualizarColaborador(id, { activo: !actual.activo })
  }

  const colaboradoresActivos = colaboradores.filter(col => col.activo)

  return {
    colaboradores,
    colaboradoresActivos,
    loading,
    errorCarga,
    agregarColaborador,
    actualizarColaborador,
    eliminarColaborador,
    toggleActivo,
  }
}
