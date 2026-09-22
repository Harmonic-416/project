import type { Session, SupabaseClient, User } from '@supabase/supabase-js'

/** Tasks 1.2–1.4 (F1): registration, login/logout, session persistence. */

export async function register(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<User> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  if (!data.user) throw new Error('Registration returned no user')
  // Supabase returns an obfuscated existing user (no identities) instead of
  // erroring when the email is already registered — surface it as an error.
  if (data.user.identities && data.user.identities.length === 0) {
    throw new Error('email already in use')
  }
  return data.user
}

export async function login(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function logout(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession(supabase: SupabaseClient): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}
