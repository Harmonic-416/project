import { useCallback, useEffect, useState } from 'react'
import { login, logout, register } from '@backend/auth'
import { isCloudConfigured, supabase } from '../lib/supabaseClient.js'

/**
 * Supabase session state for the whole app. supabase-js persists the session
 * in localStorage and refreshes tokens itself; this hook just mirrors it into
 * React and exposes the auth calls from the shared backend layer.
 */
export function useSession() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(!isCloudConfigured)

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback((email, password) => login(supabase, email, password), [])
  const signUp = useCallback(async (email, password) => {
    await register(supabase, email, password)
    return login(supabase, email, password)
  }, [])
  const signOut = useCallback(() => logout(supabase), [])

  return {
    configured: isCloudConfigured,
    ready,
    session,
    user: session?.user ?? null,
    signIn,
    signUp,
    signOut,
  }
}
