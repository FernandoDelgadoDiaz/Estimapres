// src/lib/supabase.ts
// Cliente Supabase único de la app + autenticación con email y contraseña.
// Las políticas RLS exigen un usuario autenticado NO anónimo
// (local_id = auth.uid()): cada supervisor ve solo sus propios datos, desde
// cualquier dispositivo. Si Supabase no está configurado (sin envs), la app
// funciona en modo local (localStorage, sin login).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

let sesionPromise: Promise<string | null> | null = null

/**
 * Devuelve el user id de la sesión actual, o null si no hay sesión (o
 * Supabase no está configurado). Ya NO crea sesiones anónimas: la app exige
 * login real. Un resultado null no se memoiza, así el próximo intento
 * (post-login) vuelve a consultar.
 */
export function asegurarSesion(): Promise<string | null> {
  if (!supabase) return Promise.resolve(null)
  if (!sesionPromise) {
    const p = (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const user = data.session?.user
        if (!user || user.is_anonymous) return null
        return user.id
      } catch (error) {
        console.warn('Supabase no disponible:', error)
        return null
      }
    })()
    sesionPromise = p
    void p.then(uid => {
      if (!uid) sesionPromise = null
    })
    return p
  }
  return sesionPromise
}

/** Invalida el cache de sesión (llamar tras login/logout). */
export function invalidarCacheSesion(): void {
  sesionPromise = null
}

export interface ResultadoAuth {
  ok: boolean
  error?: string
  /** signUp con confirmación de email habilitada: cuenta creada pero sin sesión */
  necesitaConfirmacionEmail?: boolean
}

const MENSAJES_ERROR: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'Email not confirmed': 'Tenés que confirmar tu email antes de iniciar sesión (revisá tu casilla).',
  'User already registered': 'Ya existe una cuenta con ese email. Iniciá sesión.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
}

function traducirError(mensaje: string): string {
  return MENSAJES_ERROR[mensaje] ?? mensaje
}

export async function iniciarSesion(email: string, password: string): Promise<ResultadoAuth> {
  if (!supabase) return { ok: false, error: 'Supabase no está configurado.' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: traducirError(error.message) }
  invalidarCacheSesion()
  return { ok: !!data.session }
}

export async function registrarse(email: string, password: string): Promise<ResultadoAuth> {
  if (!supabase) return { ok: false, error: 'Supabase no está configurado.' }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { ok: false, error: traducirError(error.message) }
  invalidarCacheSesion()
  if (!data.session) {
    // Proyecto con confirmación de email habilitada
    return { ok: true, necesitaConfirmacionEmail: true }
  }
  return { ok: true }
}

/**
 * Cierra la sesión y recarga la app (vuelve a la pantalla de login).
 * Con cuenta real los datos quedan guardados en la cuenta: iniciar sesión
 * de nuevo (en cualquier dispositivo) los recupera.
 */
export async function cerrarSesion(): Promise<void> {
  if (supabase) {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.warn('Error al cerrar sesión en Supabase:', error)
    }
  }
  invalidarCacheSesion()
  window.location.reload()
}
