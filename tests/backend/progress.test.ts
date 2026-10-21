import { describe, expect, it } from 'vitest'
import {
  evaluateUnlocks,
  getGuitarProgress,
  getLastScore,
  getTempoPref,
  markNodeComplete,
  getCompletedNodeIds,
  mergeGuitarProgress,
  recordRunThrough,
  saveGuitarProgress,
  setTempoPref,
  type LessonNode,
} from '../../src/lib/progress'
import { login, logout } from '../../src/lib/auth'
import { listLibrary } from '../../src/lib/songs'
import { hasSupabaseEnv, newTestUser } from '../helpers'

// Task 2.3 unlock evaluation is pure — no Supabase needed.
describe('unlock evaluation (F2)', () => {
  const map: LessonNode[] = [
    { id: 'meet-the-guitar', prerequisites: [] }, // knowledge-only node
    { id: 'first-notes', prerequisites: ['meet-the-guitar'] },
    { id: 'first-chords', prerequisites: ['meet-the-guitar', 'first-notes'] },
  ]

  it('unlocks a node exactly when its last prerequisite clears', () => {
    let state = evaluateUnlocks(map, new Set())
    expect(state).toEqual({
      'meet-the-guitar': 'unlocked',
      'first-notes': 'locked',
      'first-chords': 'locked',
    })

    state = evaluateUnlocks(map, new Set(['meet-the-guitar']))
    expect(state['first-notes']).toBe('unlocked')
    expect(state['first-chords']).toBe('locked') // one prerequisite still open

    state = evaluateUnlocks(map, new Set(['meet-the-guitar', 'first-notes']))
    expect(state['first-chords']).toBe('unlocked')
  })

  it('knowledge-only nodes satisfy downstream prerequisites like any other', () => {
    const state = evaluateUnlocks(map, new Set(['meet-the-guitar']))
    expect(state['meet-the-guitar']).toBe('completed')
    expect(state['first-notes']).toBe('unlocked')
  })
})

describe('guitar Learn progress, merged (pure)', () => {
  it('keeps every chord cleared, a pass over a skip, the higher best and every step passed', () => {
    const device = { cleared: { Em: 'skipped' as const, Am: 'passed' as const }, changesBest: { 'C-Em': 12 }, strumPassed: { down: true } }
    const account = { cleared: { Em: 'passed' as const, C: 'skipped' as const }, changesBest: { 'C-Em': 9, 'Am-C': 5 }, strumPassed: { 'down-up': true } }
    const expected = {
      cleared: { Em: 'passed', Am: 'passed', C: 'skipped' },
      changesBest: { 'C-Em': 12, 'Am-C': 5 },
      strumPassed: { down: true, 'down-up': true },
    }
    expect(mergeGuitarProgress(device, account)).toEqual(expected)
    expect(mergeGuitarProgress(account, device)).toEqual(expected)
  })
})

describe.skipIf(!hasSupabaseEnv)('guitar Learn progress on the account', () => {
  it('is saved to the account, survives re-login, and is no one else’s to read', async () => {
    const { supabase, email, password } = await newTestUser('guitar')
    expect(await getGuitarProgress(supabase)).toEqual({ cleared: {}, changesBest: {}, strumPassed: {} })
    const progress = { cleared: { Em: 'passed' as const }, changesBest: { 'C-Em': 20 }, strumPassed: { down: true } }
    await saveGuitarProgress(supabase, progress)
    await logout(supabase)
    await login(supabase, email, password)
    expect(await getGuitarProgress(supabase)).toEqual(progress)
    const { supabase: other } = await newTestUser('guitar-other')
    expect(await getGuitarProgress(other)).toEqual({ cleared: {}, changesBest: {}, strumPassed: {} })
  })
})

describe.skipIf(!hasSupabaseEnv)('progress persistence (F2, F22, F37)', () => {
  it('2.2 completion survives logout and re-login', async () => {
    const { supabase, email, password } = await newTestUser('progress')
    await markNodeComplete(supabase, 'meet-the-guitar')
    await logout(supabase)
    await login(supabase, email, password)
    const completed = await getCompletedNodeIds(supabase)
    expect(completed.has('meet-the-guitar')).toBe(true)
  })

  it('2.4/2.5 appends run-throughs and returns the newest score as last score', async () => {
    const { supabase } = await newTestUser('runs')
    const songs = await listLibrary(supabase)
    const song = songs[0]!
    await recordRunThrough(supabase, song.id, 60)
    await recordRunThrough(supabase, song.id, 92)
    expect(await getLastScore(supabase, song.id)).toBe(92)
  })

  it('2.6 tempo pref persists per song and rejects out-of-range values', async () => {
    const { supabase } = await newTestUser('tempo')
    const songs = await listLibrary(supabase)
    const [songA, songB] = [songs[0]!, songs[1]!]
    await setTempoPref(supabase, songA.id, 75)
    await setTempoPref(supabase, songB.id, 100)
    expect(await getTempoPref(supabase, songA.id)).toBe(75)
    expect(await getTempoPref(supabase, songB.id)).toBe(100)
    await expect(setTempoPref(supabase, songA.id, 45)).rejects.toThrow(/50/)
    expect(await getTempoPref(supabase, songA.id)).toBe(75) // unchanged
  })
})
