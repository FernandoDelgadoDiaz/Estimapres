// src/lib/supabase.ts
// Cliente Supabase único de la app + gestión de sesión.
// Las políticas RLS exigen un usuario autenticado (local_id = auth.uid()), por
// eso al iniciar se crea una sesión anónima si no existe una. La sesión
// anónima persiste en el navegador, así que el "local" conserva sus datos
// entre visitas. Cuando se agregue login real, esta capa no cambia.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

let sesionPromise: Promise<string | null> | null = null

/**
 * Garantiza una sesión (anónima si hace falta) y devuelve el user id, o null
 * si Supabase no está configurado o no responde. Con null, la capa de
 * persistencia cae a localStorage (modo degradado, solo este dispositivo).
 */
/**
 * Cierra la sesión de Supabase y recarga la app. OJO: con sesión anónima,
 * cerrar sesión desvincula los datos guardados en la nube (el próximo inicio
 * crea un usuario anónimo NUEVO). Los datos locales de este dispositivo se
 * conservan. El caller debe confirmar con el usuario antes de llamar.
 */
export async function cerrarSesion(): Promise<void> {
  if (supabase) {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.warn('Error al cerrar sesión en Supabase:', error)
    }
  }
  sesionPromise = null
  window.location.reload()
}

export function asegurarSesion(): Promise<string | null> {
  if (!supabase) return Promise.resolve(null)
  sesionPromise ??= (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session) return data.session.user.id
      const { data: anon, error } = await supabase.auth.signInAnonymously()
      if (error) {
        console.error('No se pudo iniciar sesión anónima en Supabase:', error.message)
        return null
      }
      return anon.user?.id ?? null
    } catch (error) {
      console.error('Supabase no disponible:', error)
      return null
    }
  })()
  return sesionPromise
}
