import { useEffect, useState } from 'react'
import { supabase, invalidarCacheSesion } from '../lib/supabase'
import { invalidarCacheBackend, invalidarCacheRoster } from '../utils/almacen'

export interface UsuarioAuth {
  id: string
  email: string | null
  esAnonimo: boolean
}

export interface EstadoAuth {
  /** false = Supabase sin configurar → la app corre en modo local sin login */
  configurado: boolean
  cargando: boolean
  usuario: UsuarioAuth | null
}

/**
 * Estado de autenticación de la app. Se suscribe a los cambios de sesión de
 * Supabase e invalida los caches de la capa de datos en cada cambio, para que
 * las próximas lecturas/escrituras usen la cuenta correcta.
 */
export function useAuth(): EstadoAuth {
  const [estado, setEstado] = useState<EstadoAuth>({
    configurado: !!supabase,
    cargando: !!supabase,
    usuario: null,
  })

  useEffect(() => {
    if (!supabase) return

    let vivo = true
    const aUsuario = (u: { id: string; email?: string; is_anonymous?: boolean } | null | undefined): UsuarioAuth | null =>
      u ? { id: u.id, email: u.email ?? null, esAnonimo: !!u.is_anonymous } : null

    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setEstado({ configurado: true, cargando: false, usuario: aUsuario(data.session?.user) })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      invalidarCacheSesion()
      invalidarCacheBackend()
      invalidarCacheRoster()
      if (!vivo) return
      setEstado({ configurado: true, cargando: false, usuario: aUsuario(session?.user) })
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return estado
}
