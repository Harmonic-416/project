import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Task 1.1 — initialize the Supabase JS client from environment config.
 * Framework-neutral: Node/tests pass process.env values; the Vite frontend
 * will pass import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 */
export function createHarmonicClient(
  url: string | undefined = process.env.SUPABASE_URL,
  anonKey: string | undefined = process.env.SUPABASE_ANON_KEY,
): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'Missing SUPABASE_URL / SUPABASE_ANON_KEY — copy .env.example to .env.local and fill it in.',
    )
  }
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
}
