import 'dotenv/config'
import { config } from 'dotenv'
import { WebSocket } from 'ws'

// supabase-js expects a native WebSocket (Node >= 22); polyfill on Node 20.
if (!('WebSocket' in globalThis)) {
  ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket
}
import { createHarmonicClient } from '../src/lib/supabase'
import { register, login } from '../src/lib/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

/** True when a Supabase project is configured — integration tests skip otherwise. */
export const hasSupabaseEnv =
  Boolean(process.env.SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_ANON_KEY) &&
  process.env.SUPABASE_ANON_KEY !== 'PASTE_ANON_PUBLIC_KEY_HERE'

export function newClient(): SupabaseClient {
  return createHarmonicClient()
}

/** Register + sign in a throwaway user. Requires "Confirm email" OFF in the
 *  Supabase Auth settings of the test project. */
export async function newTestUser(prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@harmonic-tests.example.com`
  const password = `Hp-${crypto.randomUUID()}`
  const supabase = newClient()
  await register(supabase, email, password)
  await login(supabase, email, password)
  return { supabase, email, password }
}
