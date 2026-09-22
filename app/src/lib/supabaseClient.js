import { createHarmonicClient } from '@backend/supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when app/.env.local is missing — the app then runs local-only. */
export const isCloudConfigured = Boolean(url && anonKey && !/PASTE_/.test(anonKey))

export const supabase = isCloudConfigured ? createHarmonicClient(url, anonKey) : null
