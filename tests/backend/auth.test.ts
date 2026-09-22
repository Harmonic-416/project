import { describe, expect, it } from 'vitest'
import { getSession, login, logout, register } from '../../src/lib/auth'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// Tasks 1.1–1.3 (F1). Integration tests: they run against the real Supabase
// project in .env.local and skip when it isn't configured.
describe.skipIf(!hasSupabaseEnv)('auth (F1)', () => {
  it('1.1 initializes the client and reads session state without error', async () => {
    const supabase = newClient()
    const session = await getSession(supabase)
    expect(session).toBeNull() // fresh client, nobody signed in
  })

  it('1.2 registers a new email exactly once; duplicate is rejected', async () => {
    const { email, password } = await newTestUser('reg')
    await expect(register(newClient(), email, password)).rejects.toThrow(/already/i)
  })

  it('1.3 logs in with correct credentials, rejects a wrong password, and logs out', async () => {
    const { supabase, email, password } = await newTestUser('login')
    await logout(supabase)
    expect(await getSession(supabase)).toBeNull()

    await expect(login(newClient(), email, `wrong-${password}`)).rejects.toThrow()

    const session = await login(supabase, email, password)
    expect(session.user.email).toBe(email)
  })
})
