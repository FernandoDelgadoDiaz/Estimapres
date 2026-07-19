import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Colaborador, COLABORADORES_INICIALES } from '../types'
import { claveConSucursal, esSucursalPorDefecto } from '../utils/sucursal'

const STORAGE_KEY = 'cajeros_colaboradores'

export function useColaboradores() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)

  // Cargar colaboradores del localStorage al inicio
  useEffect(() => {
    const loadColaboradores = () => {
      try {
        const stored = localStorage.getItem(claveConSucursal(STORAGE_KEY))
        if (stored) {
          setColaboradores(JSON.parse(stored))
        } else {
          // Primera vez: guardar datos iniciales
          const iniciales = esSucursalPorDefecto() ? COLABORADORES_INICIALES : []
          localStorage.setItem(claveConSucursal(STORAGE_KEY), JSON.stringify(iniciales))
          setColaboradores(iniciales)
        }
      } catch (error) {
        console.error('Error cargando colaboradores:', error)
        setColaboradores(esSucursalPorDefecto() ? COLABORADORES_INICIALES : [])
      } finally {
        setLoading(false)
      }
    }
    loadColaboradores()
  }, [])

  // Guardar automáticamente cuando cambian los colaboradores
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(claveConSucursal(STORAGE_KEY), JSON.stringify(colaboradores))
    }
  }, [colaboradores, loading])

  const agregarColaborador = (nuevo: Omit<Colaborador, 'id' | 'activo'>) => {
    const colaborador: Colaborador = {
      ...nuevo,
      id: uuidv4(),
      activo: true,
    }
    setColaboradores(prev => [...prev, colaborador])
    return colaborador
  }

  const actualizarColaborador = (id: string, cambios: Partial<Colaborador>) => {
    setColaboradores(prev =>
      prev.map(col =>
        col.id === id ? { ...col, ...cambios } : col
      )
    )
  }

  const eliminarColaborador = (id: string) => {
    setColaboradores(prev => prev.filter(col => col.id !== id))
  }

  const toggleActivo = (id: string) => {
    setColaboradores(prev =>
      prev.map(col =>
        col.id === id ? { ...col, activo: !col.activo } : col
      )
    )
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