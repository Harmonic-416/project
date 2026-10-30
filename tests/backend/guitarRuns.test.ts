import { beforeAll, describe, expect, it } from 'vitest'
import { getSharedAttempt, listSongScores, saveAttempt, updateAttemptResult, type NewSharedAttempt } from '../../src/lib/attempts'
import { listPracticeSessions, startPracticeSession } from '../../src/lib/practiceSessions'
import { hasSupabaseEnv, newTestUser } from '../helpers'

// Guitar run history (migration 0017, F22): Wait for me and Trouble spots
// runs are saved as attempts with their mode, Easy version and whether they
// were full runs; a song's last and best score comes from its full runs; a
// re-checked run is corrected in place; each tab lists its own sessions.
const fingerprint = 'cd'.repeat(32)

const run: NewSharedAttempt = {
  songTitle: 'Ode to Joy',
  songFormat: 'guitar-pro',
  songFingerprint: fingerprint,
  partId: '0',
  partName: 'Guitar',
  samples: [],
  accuracy: 50,
  instrument: 'guitar',
  verdicts: ['hit', 'miss', 'hit', 'close'],
  mode: 'trouble',
  easy: false,
  fullRun: true,
}

describe.skipIf(!hasSupabaseEnv)('guitar run history (0017)', () => {
  let owner: Awaited<ReturnType<typeof newTestUser>>
  let other: Awaited<ReturnType<typeof newTestUser>>

  beforeAll(async () => {
    owner = await newTestUser('runs-owner')
    other = await newTestUser('runs-other')
  }, 30_000)

  it('saves the mode, the Easy version and full_run', async () => {
    const saved = await saveAttempt(owner.supabase, { ...run, mode: 'wait', easy: true, fullRun: false })
    expect(saved.mode).toBe('wait')
    expect(saved.easy).toBe(true)
    expect(saved.full_run).toBe(false)
  }, 30_000)

  it('lists only full runs at the same song, mode, version and part, newest first', async () => {
    const first = await saveAttempt(owner.supabase, { ...run, accuracy: 60 })
    const second = await saveAttempt(owner.supabase, { ...run, accuracy: 80 })
    await saveAttempt(owner.supabase, { ...run, accuracy: 99, fullRun: false }) // a looped bar
    await saveAttempt(owner.supabase, { ...run, accuracy: 98, easy: true })
    await saveAttempt(owner.supabase, { ...run, accuracy: 97, mode: 'wait' })
    await saveAttempt(owner.supabase, { ...run, accuracy: 96, partId: '1' })
    await saveAttempt(other.supabase, { ...run, accuracy: 95 })

    const scores = await listSongScores(owner.supabase, {
      songFingerprint: fingerprint,
      instrument: 'guitar',
      mode: 'trouble',
      easy: false,
      partId: '0',
    })
    expect(scores.map((s) => s.id)).toEqual([second.id, first.id])
    expect(scores.map((s) => s.accuracy)).toEqual([80, 60])
  }, 30_000)

  it('corrects a saved run after the re-check; nobody else can', async () => {
    const saved = await saveAttempt(owner.supabase, run)
    await updateAttemptResult(other.supabase, saved.id, { verdicts: ['miss'], accuracy: 0 }) // RLS: matches no row
    await updateAttemptResult(owner.supabase, saved.id, { verdicts: ['hit', 'hit', 'hit', 'close'], accuracy: 75 })
    const opened = await getSharedAttempt(owner.supabase, saved.id)
    expect(Number(opened?.accuracy)).toBe(75)
    expect(opened?.verdicts).toEqual(['hit', 'hit', 'hit', 'close'])
  }, 30_000)

  it('lists one instrument’s sessions when asked', async () => {
    const guitar = await startPracticeSession(owner.supabase, { songFingerprint: fingerprint, songTitle: 'Ode to Joy', instrument: 'guitar' })
    const voice = await startPracticeSession(owner.supabase, { songFingerprint: fingerprint, songTitle: 'Ode to Joy' })
    const guitarOnly = await listPracticeSessions(owner.supabase, { songFingerprint: fingerprint, instrument: 'guitar' })
    expect(guitarOnly.map((s) => s.id)).toContain(guitar.id)
    expect(guitarOnly.map((s) => s.id)).not.toContain(voice.id)
    const both = await listPracticeSessions(owner.supabase, { songFingerprint: fingerprint })
    expect(both.map((s) => s.id)).toEqual(expect.arrayContaining([guitar.id, voice.id]))
  }, 30_000)
})
