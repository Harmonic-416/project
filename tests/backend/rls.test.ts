import { describe, expect, it } from 'vitest'
import { markNodeComplete, recordRunThrough } from '../../src/lib/progress'
import { listLibrary } from '../../src/lib/songs'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// Tasks 1.5 + 4.1 (F1, N5): the privacy ship-gate. A second authenticated
// user must see NONE of the first user's rows; unauthenticated sees nothing.
describe.skipIf(!hasSupabaseEnv)('RLS isolation (F1, N5)', () => {
  it('user B cannot read user A progress or run-throughs', async () => {
    const a = await newTestUser('user-a')
    const b = await newTestUser('user-b')

    await markNodeComplete(a.supabase, 'node-meet-the-guitar')
    const songs = await listLibrary(a.supabase)
    expect(songs.length).toBeGreaterThanOrEqual(3) // F4 seed library
    const seed = songs[0]!
    await recordRunThrough(a.supabase, seed.id, 87)

    const { data: bProgress } = await b.supabase.from('lesson_progress').select('*')
    expect(bProgress).toEqual([])
    const { data: bRuns } = await b.supabase.from('run_through').select('*')
    expect(bRuns).toEqual([])
  })

  it('unauthenticated requests get no per-user data', async () => {
    const anon = newClient()
    const progress = await anon.from('lesson_progress').select('*')
    expect(progress.error).toBeNull() // table exists and is reachable...
    expect(progress.data).toEqual([]) // ...but RLS returns zero rows
    const songs = await anon.from('song').select('*')
    expect(songs.error).toBeNull()
    expect(songs.data).toEqual([]) // library requires authentication too
  })

  it('seed songs are read-only to clients (F4)', async () => {
    const a = await newTestUser('vandal')
    const songs = await listLibrary(a.supabase)
    const seed = songs.find((s) => s.user_id === null)!
    const { data: updated } = await a.supabase
      .from('song')
      .update({ title: 'hacked' })
      .eq('id', seed.id)
      .select()
    expect(updated).toEqual([]) // RLS: zero rows updatable
  })
})
