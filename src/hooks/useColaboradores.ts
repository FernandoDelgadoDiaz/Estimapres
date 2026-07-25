import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Colaborador } from '../types'
import { claveConSucursal } from '../utils/sucursal'
import { cargarGrupoRoster, guardarItemRoster, eliminarItemRoster, actualizarCacheRoster, CLAVES_ROSTER } from '../utils/almacen'

/**
 * Cajeros FULL/PART (y AUX contractuales). Persisten en Supabase (tabla
 * colaboradores, por sucursal): un dispositivo nuevo los ve al iniciar
 * sesión. localStorage queda como backup offline. Estado optimista.
 */
export function useColaboradores() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    cargarGrupoRoster<Colaborador>('cajero')
      .then(cs => { if (vivo) setColaboradores(cs) })
      .catch(error => console.error('Error cargando colaboradores:', error))
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  // Backup local automático (offline) + sincronización del cache compartido:
  // así la próxima generación de horarios (Nueva Semana) lee esta lista fresca
  // y no un snapshot anterior a los cambios (activo/horarios).
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(claveConSucursal(CLAVES_ROSTER.cajero), JSON.stringify(colaboradores))
      actualizarCacheRoster('cajero', colaboradores)
    }
  }, [colaboradores, loading])

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
    agregarColaborador,
    actualizarColaborador,
    eliminarColaborador,
    toggleActivo,
  }
}
