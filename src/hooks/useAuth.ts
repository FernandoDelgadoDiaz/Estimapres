import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  tenant_id: string
  role: string
}

export interface Tenant {
  id: string
  name: string
  status: string
}

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        loadProfileAndTenant(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        setUser(session.user)
        await loadProfileAndTenant(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setTenant(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfileAndTenant = async (userId: string) => {
    try {
      console.log('[useAuth] Loading profile for user:', userId)

      // Query profiles
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      console.log('[useAuth] Profile query result:', { profileData, profileError })

      if (profileError) {
        // Check for infinite recursion policy error
        if (profileError.message && profileError.message.includes('infinite recursion')) {
          console.warn('[useAuth] Infinite recursion policy error, skipping profile load')
          setProfile(null)
          setTenant(null)
          setLoading(false)
          return
        }
        throw profileError
      }
      if (!profileData) throw new Error('Profile not found')

      setProfile(profileData)

      // Query tenants
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profileData.tenant_id)
        .single()

      console.log('[useAuth] Tenant query result:', { tenantData, tenantError })

      if (tenantError) {
        // Check for infinite recursion policy error
        if (tenantError.message && tenantError.message.includes('infinite recursion')) {
          console.warn('[useAuth] Infinite recursion policy error, skipping tenant load')
          setTenant(null)
          setLoading(false)
          return
        }
        throw tenantError
      }
      if (!tenantData) throw new Error('Tenant not found')

      setTenant(tenantData)
      setLoading(false)
    } catch (err: any) {
      console.error('[useAuth] Error loading profile/tenant:', err)
      // If infinite recursion error, ignore and continue
      if (err.message && err.message.includes('infinite recursion')) {
        console.warn('[useAuth] Infinite recursion error, continuing without profile/tenant')
        setProfile(null)
        setTenant(null)
        setLoading(false)
        return
      }
      setError(err.message)
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    setLoading(true)
    setError(null)

    try {
      console.log('[useAuth] Starting signInWithPassword for:', email)

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('[useAuth] signInWithPassword result:', { authData, authError })

      if (authError) throw authError

      if (authData.user) {
        console.log('[useAuth] User authenticated, profile will load via auth state change')
        // loadProfileAndTenant will be called by onAuthStateChange
      }

      setLoading(false)
      return { success: true }
    } catch (err: any) {
      console.error('[useAuth] signIn error:', err)
      setError(err.message)
      setLoading(false)
      return { success: false, error: err.message }
    }
  }

  const signOut = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('[useAuth] signOut error:', error)
      setError(error.message)
    }
    setLoading(false)
  }

  return {
    user,
    profile,
    tenant,
    loading,
    error,
    signIn,
    signOut,
  }
}