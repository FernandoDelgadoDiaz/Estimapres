import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CorreccionManual, AprendizajeDerivado } from '../types'
import {
  cargarCorrecciones,
  guardarCorreccion,
  eliminarCorreccionesRemotas,
  reemplazarCorrecciones,
  sincronizarAprendizajes,
} from '../utils/almacen'
import { derivarAprendizajes } from '../utils/preferencias'

/**
 * Correcciones manuales del supervisor (Capacidad 3: aprendizaje).
 * Persisten en Supabase; localStorage como fallback. Estado optimista.
 * Cada cambio resincroniza la tabla materializada aprendizajes_derivados.
 */
export function useCorrecciones() {
  const [correcciones, setCorrecciones] = useState<CorreccionManual[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    cargarCorrecciones()
      .then(cs => { if (vivo) setCorrecciones(cs) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [])

  const resincronizar = (lista: CorreccionManual[]) => {
    const aprendizajes: AprendizajeDerivado[] = derivarAprendizajes(lista)
    void sincronizarAprendizajes(aprendizajes)
  }

  const agregarCorreccion = (datos: Omit<CorreccionManual, 'id' | 'fecha'>) => {
    const correccion: CorreccionManual = {
      ...datos,
      id: uuidv4(),
      fecha: new Date().toISOString(),
    }
    const siguiente = [...correcciones, correccion]
    setCorrecciones(siguiente)
    void guardarCorreccion(correccion)
    resincronizar(siguiente)
    return correccion
  }

  const eliminarCorreccion = (id: string) => {
    const siguiente = correcciones.filter(c => c.id !== id)
    setCorrecciones(siguiente)
    void eliminarCorreccionesRemotas([id])
    resincronizar(siguiente)
  }

  /** Olvida un aprendizaje: elimina todas las correcciones que lo sustentan. */
  const eliminarCorrecciones = (ids: string[]) => {
    const set = new Set(ids)
    const siguiente = correcciones.filter(c => !set.has(c.id))
    setCorrecciones(siguiente)
    void eliminarCorreccionesRemotas(ids)
    resincronizar(siguiente)
  }

  const reemplazarTodo = (nuevas: CorreccionManual[]) => {
    setCorrecciones(nuevas)
    void reemplazarCorrecciones(nuevas)
    resincronizar(nuevas)
  }

  return { correcciones, loading, agregarCorreccion, eliminarCorreccion, eliminarCorrecciones, reemplazarTodo }
}
