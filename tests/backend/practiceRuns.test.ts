import { beforeAll, describe, expect, it } from 'vitest'
import { listPracticeRuns, listSessionRuns, savePracticeRun } from '../../src/lib/practiceRuns'
import { saveAttempt } from '../../src/lib/attempts'
import { listSessionAttempts, startPracticeSession } from '../../src/lib/practiceSessions'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// Scored Wait for me / Trouble spots runs kept on the account (migration
// 0015). Needs a project with 0015 applied (locally: the Supabase CLI stack).
async function schemaApplied(): Promise<boolean> {
  if (!hasSupabaseEnv) return false
  const { error } = await newClient().from('practice_run').select('id').limit(1)
  return !error
}
const schemaReady = await schemaApplied()

const FINGERPRINT = 'f'.repeat(64)
const CATALOG_SONG = '00000000-0000-4000-8000-000000000011' // Ode to Joy (voice)

describe('practice run input checks (no database)', () => {
  const supabase = newClient()
  it('refuses runs it can’t chart', async () => {
    await expect(savePracticeRun(supabase, { songFingerprint: 'x', accompaniment: 'solo', mode: 'wait', score: 50 })).rejects.toThrow(/fingerprint/)
    await expect(savePracticeRun(supabase, { songFingerprint: FINGERPRINT, accompaniment: 'solo', mode: 'wait', score: 101 })).rejects.toThrow(/0 to 100/)
    await expect(
      savePracticeRun(supabase, { songFingerprint: FINGERPRINT, accompaniment: 'solo', mode: 'wait', score: 50, notes: { total: 2, right: 1.5, half: 0, missed: 0 } }),
    ).rejects.toThrow(/whole numbers/)
  })
})

describe.skipIf(!schemaReady)('practice runs on the account (0015)', () => {
  let me: Awaited<ReturnType<typeof newTestUser>>
  let other: Awaited<ReturnType<typeof newTestUser>>

  beforeAll(async () => {
    ;[me, other] = await Promise.all([newTestUser('runs-me'), newTestUser('runs-other')])
  }, 30_000)

  it('keeps each chart apart, oldest first, with the note counts', async () => {
    const base = { songFingerprint: FINGERPRINT, accompaniment: 'solo' as const }
    await savePracticeRun(me.supabase, { ...base, mode: 'wait', score: 60, notes: { total: 8, right: 6, half: 2, missed: 0 } })
    await savePracticeRun(me.supabase, { ...base, mode: 'wait', score: 85 })
    await savePracticeRun(me.supabase, { ...base, mode: 'trouble', score: 40, partId: 'P2', partName: 'Tenor' })
    await savePracticeRun(me.supabase, { ...base, accompaniment: 'all', mode: 'wait', score: 99 })

    const wait = await listPracticeRuns(me.supabase, { ...base, mode: 'wait' })
    expect(wait.map((r) => r.score)).toEqual([60, 85])
    expect(wait[0]).toMatchObject({ mode: 'wait', notes_total: 8, notes_right: 6, notes_half: 2, notes_missed: 0 })
    expect(wait[1]).toMatchObject({ notes_total: null })

    expect((await listPracticeRuns(me.supabase, { ...base, mode: 'trouble' })).map((r) => r.score)).toEqual([]) // part P2, not the first part
    expect((await listPracticeRuns(me.supabase, { ...base, partId: 'P2', mode: 'trouble' })).map((r) => r.part_name)).toEqual(['Tenor'])
    expect((await listPracticeRuns(me.supabase, { ...base, accompaniment: 'all', mode: 'wait' })).map((r) => r.score)).toEqual([99])
  })

  it('shows nobody else your runs', async () => {
    const runs = await listPracticeRuns(other.supabase, { songFingerprint: FINGERPRINT, accompaniment: 'solo', mode: 'wait' })
    expect(runs).toEqual([])
  })

  it('attaches runs only to your own sessions, and lists a session’s runs', async () => {
    const mine = await startPracticeSession(me.supabase, { songFingerprint: FINGERPRINT, songTitle: 'Runs' })
    const theirs = await startPracticeSession(other.supabase, { songFingerprint: FINGERPRINT, songTitle: 'Runs' })
    const run = { songFingerprint: FINGERPRINT, accompaniment: 'solo' as const, mode: 'trouble' as const }
    await savePracticeRun(me.supabase, { ...run, score: 63, sessionId: mine.id, notes: { total: 4, right: 2, half: 1, missed: 1 } })
    await expect(savePracticeRun(me.supabase, { ...run, score: 10, sessionId: theirs.id })).rejects.toBeTruthy()

    const inSession = await listSessionRuns(me.supabase, mine.id)
    expect(inSession).toHaveLength(1)
    expect(inSession[0]).toMatchObject({ score: 63, mode: 'trouble', notes_right: 2, notes_half: 1, notes_missed: 1 })
    expect(await listSessionRuns(other.supabase, mine.id)).toEqual([])
  })

  it('keeps an attempt’s per-note verdicts for its session', async () => {
    const session = await startPracticeSession(me.supabase, { songId: CATALOG_SONG, songTitle: 'Ode to Joy' })
    await saveAttempt(me.supabase, {
      songId: CATALOG_SONG,
      songTitle: 'Ode to Joy',
      samples: [[0.1, 64]],
      accuracy: 70,
      verdicts: ['hit', 'miss', null],
      sessionId: session.id,
    })
    const [row] = await listSessionAttempts(me.supabase, session.id)
    expect(row?.verdicts).toEqual(['hit', 'miss', null])
  })
})
