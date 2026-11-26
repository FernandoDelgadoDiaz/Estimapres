import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ReglaConfigurable } from '../types'
import { reemplazoDeReglas } from '../utils/reglasReemplazo'
import { cargarReglas, guardarRegla, eliminarReglaRemota, reemplazarReglas, backendActivo } from '../utils/almacen'

/**
 * Reglas configurables por el supervisor (Capacidad 1).
 * Persisten en Supabase (RLS por usuario); localStorage solo como fallback.
 * Estado optimista: la UI se actualiza al instante y la escritura va en background.
 */
export function useReglas() {
  const [reglas, setReglas] = useState<ReglaConfigurable[]>([])
  const [loading, setLoading] = useState(true)
  const [backend, setBackend] = useState<'supabase' | 'local' | 'cargando'>('cargando')

  useEffect(() => {
    let vivo = true
    cargarReglas()
      .then(rs => { if (vivo) setReglas(rs) })
      .finally(() => { if (vivo) setLoading(false) })
    backendActivo().then(b => { if (vivo) setBackend(b) })
    return () => { vivo = false }
  }, [])

  const agregarRegla = (nueva: Omit<ReglaConfigurable, 'id' | 'activa' | 'creadaEl'> & { activa?: boolean }) => {
    const regla: ReglaConfigurable = {
      ...nueva,
      id: uuidv4(),
      activa: nueva.activa ?? true,
      creadaEl: new Date().toISOString(),
    }
    // AH2-067: la regla nueva reemplaza a la anterior del mismo tema (no se acumulan).
    const hoy = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local
    const { borrar, recortar } = reemplazoDeReglas(reglas, nueva, hoy)
    const ids = new Set(borrar.map(r => r.id))
    const recorte = new Map(recortar.map(x => [x.regla.id, x.vigenciaHasta]))
    setReglas(prev => [...prev.filter(r => !ids.has(r.id)).map(r => (recorte.has(r.id) ? { ...r, vigenciaHasta: recorte.get(r.id) } : r)), regla])
    // En orden (no en paralelo): el respaldo local lee y escribe el mismo almacén.
    void (async () => {
      await guardarRegla(regla)
      for (const r of borrar) await eliminarReglaRemota(r.id)
      for (const x of recortar) await guardarRegla({ ...x.regla, vigenciaHasta: x.vigenciaHasta })
    })()
    return regla
  }

  const actualizarRegla = (id: string, cambios: Partial<ReglaConfigurable>) => {
    const base = reglas.find(r => r.id === id)
    setReglas(prev => prev.map(r => (r.id === id ? { ...r, ...cambios } : r)))
    if (base) void guardarRegla({ ...base, ...cambios })
  }

  const eliminarRegla = (id: string) => {
    setReglas(prev => prev.filter(r => r.id !== id))
    void eliminarReglaRemota(id)
  }

  const toggleActiva = (id: string) => {
    const base = reglas.find(r => r.id === id)
    setReglas(prev => prev.map(r => (r.id === id ? { ...r, activa: !r.activa } : r)))
    if (base) void guardarRegla({ ...base, activa: !base.activa })
  }

  /** Import de backup: reemplaza todo el set (local y remoto). */
  const reemplazarTodo = (nuevas: ReglaConfigurable[]) => {
    setReglas(nuevas)
    void reemplazarReglas(nuevas)
  }

  const reglasActivas = reglas.filter(r => r.activa)

  return { reglas, reglasActivas, loading, backend, agregarRegla, actualizarRegla, eliminarRegla, toggleActiva, reemplazarTodo }
}
