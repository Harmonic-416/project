import { useCallback, useEffect, useState } from 'react'
import { logout, signInWithProvider } from '@backend/auth'
import { isCloudConfigured, supabase } from '../lib/supabaseClient.js'

/**
 * Supabase session state for the whole app. supabase-js persists the session
 * in localStorage and refreshes tokens itself; this hook just mirrors it into
 * React and exposes the auth calls from the shared backend layer. Sign-in is
 * Google / GitHub only; email + password (register/login in src/lib/auth.ts)
 * is kept for the backend tests, not offered here.
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

  const signOut = useCallback(() => logout(supabase), [])

  // OAuth leaves the page entirely; the session comes back through the
  // onAuthStateChange subscription above once the provider redirects here.
  const signInWith = useCallback(
    (provider) => signInWithProvider(supabase, provider, window.location.origin),
    [],
  )

  return {
    configured: isCloudConfigured,
    ready,
    session,
    user: session?.user ?? null,
    signOut,
    signInWith,
  }
}
