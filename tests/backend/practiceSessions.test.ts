import { beforeAll, describe, expect, it } from 'vitest'
import {
  attachRecording,
  getSharedAttempt,
  saveAttempt,
  sendAttemptToFriends,
  type NewSharedAttempt,
} from '../../src/lib/attempts'
import { acceptFriendRequest, listFriends, sendFriendRequest } from '../../src/lib/friends'
import {
  IDLE_MS,
  deleteAttemptRecording,
  endPracticeSession,
  groupAttemptsBySession,
  listPracticeSessions,
  listSessionAttempts,
  recordingStorageUsed,
  resumable,
  resumePracticeSession,
  saveAttemptFeedback,
  startPracticeSession,
  type PracticeSession,
  type SessionAttempt,
} from '../../src/lib/practiceSessions'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// Practice sessions, owner feedback and the recording budget (migration
// 0014). The grouping is pure and always runs; the rest needs a project
// with 0014 applied (locally: the Supabase CLI stack).
const CATALOG_SONG = '00000000-0000-4000-8000-000000000011' // Ode to Joy (voice)

const attempt: NewSharedAttempt = {
  songId: CATALOG_SONG,
  songTitle: 'Ode to Joy',
  songFormat: 'musicxml',
  partId: 'P1',
  partName: 'Voice',
  samples: [[0.1, 64]],
  accuracy: 70,
}

const webm = (bytes: number) => new Blob([new Uint8Array(bytes).fill(1)], { type: 'audio/webm' })

describe('groupAttemptsBySession (pure)', () => {
  const session = (id: string, started_at: string): PracticeSession => ({
    id,
    user_id: 'u',
    song_id: CATALOG_SONG,
    song_fingerprint: null,
    song_title: 'Ode to Joy',
    instrument: 'voice',
    started_at,
    ended_at: null,
    title: null,
    notes: null,
  })
  const row = (id: string, session_id: string | null, created_at: string): SessionAttempt => ({
    id,
    session_id,
    song_id: CATALOG_SONG,
    song_fingerprint: null,
    song_title: 'Ode to Joy',
    part_name: 'Voice',
    instrument: 'voice',
    accuracy: 50,
    recording_path: null,
    recording_bytes: null,
    self_note: null,
    rating: null,
    created_at,
  })

  it('puts attempts under their session, oldest first, keeping session order', () => {
    const grouped = groupAttemptsBySession(
      [session('s2', '2026-10-02T10:00:00Z'), session('s1', '2026-10-01T10:00:00Z')],
      [
        row('a3', 's2', '2026-10-02T10:20:00Z'),
        row('a1', 's1', '2026-10-01T10:05:00Z'),
        row('a2', 's2', '2026-10-02T10:10:00Z'),
        row('a0', null, '2026-09-30T10:00:00Z'),
      ],
    )
    expect(grouped.map((s) => s.id)).toEqual(['s2', 's1'])
    expect(grouped[0]!.attempts.map((a) => a.id)).toEqual(['a2', 'a3'])
    expect(grouped[1]!.attempts.map((a) => a.id)).toEqual(['a1'])
  })

  it('resumable: active or ended within the idle window', () => {
    const t0 = Date.parse('2026-10-20T10:00:00Z')
    const minutes = (n: number) => n * 60 * 1000
    const open = { ...session('s', '2026-10-20T10:00:00Z'), attempts: [{ created_at: '2026-10-20T10:10:00Z' }] }
    expect(resumable(open, t0 + minutes(39))).toBe(true)
    expect(resumable(open, t0 + minutes(40))).toBe(false)
    const ended = { ...session('s', '2026-10-20T10:00:00Z'), ended_at: '2026-10-20T10:20:00Z' }
    expect(resumable(ended, t0 + minutes(49))).toBe(true)
    expect(resumable(ended, t0 + minutes(50))).toBe(false)
    expect(resumable(null, t0)).toBe(false)
    expect(IDLE_MS).toBe(minutes(30))
  })

  it('gives a session with no attempts an empty list and numbers the accuracy', () => {
    const grouped = groupAttemptsBySession([session('s1', '2026-10-01T10:00:00Z')], [
      { ...row('a1', 's1', '2026-10-01T10:05:00Z'), accuracy: '66.7' as unknown as number },
    ])
    expect(grouped[0]!.attempts[0]!.accuracy).toBeCloseTo(66.7)
    expect(groupAttemptsBySession([session('s9', '2026-10-01T10:00:00Z')], [])[0]!.attempts).toEqual([])
  })
})

describe.skipIf(!hasSupabaseEnv)('practice sessions (0014)', () => {
  let owner: Awaited<ReturnType<typeof newTestUser>>
  let other: Awaited<ReturnType<typeof newTestUser>>
  let session: PracticeSession

  beforeAll(async () => {
    owner = await newTestUser('session-owner')
    other = await newTestUser('session-other')
  }, 30_000)

  it('starts a session with a client-made id and attaches attempts to it', async () => {
    const id = crypto.randomUUID()
    session = await startPracticeSession(owner.supabase, { id, songId: CATALOG_SONG, songTitle: 'Ode to Joy' })
    expect(session.id).toBe(id)
    expect(session.ended_at).toBeNull()
    expect(session.instrument).toBe('voice')

    const first = await saveAttempt(owner.supabase, { ...attempt, sessionId: id, accuracy: 60 })
    const second = await saveAttempt(owner.supabase, { ...attempt, sessionId: id, accuracy: 75 }, webm(2048))
    expect(first.session_id).toBe(id)
    expect(second.recording_bytes).toBe(2048)

    const [listed] = await listPracticeSessions(owner.supabase, { songId: CATALOG_SONG })
    expect(listed?.id).toBe(id)
    expect(listed?.attempts.map((a) => a.accuracy)).toEqual([60, 75])
  }, 30_000)

  it('lists a session’s attempts with a signed URL for each kept recording', async () => {
    const attempts = await listSessionAttempts(owner.supabase, session.id)
    expect(attempts).toHaveLength(2)
    expect(attempts[0]!.recording_url).toBeNull()
    const res = await fetch(attempts[1]!.recording_url!)
    expect(res.status).toBe(200)
    expect((await res.arrayBuffer()).byteLength).toBe(2048)
  }, 30_000)

  it('saves the owner’s note and rating, and hides them from a friend the attempt was sent to', async () => {
    const [listed] = await listPracticeSessions(owner.supabase, { songId: CATALOG_SONG })
    const target = listed!.attempts[0]!
    await saveAttemptFeedback(owner.supabase, target.id, { selfNote: '  breathe before the high note  ', rating: 4 })
    const mine = await getSharedAttempt(owner.supabase, target.id)
    expect(mine?.self_note).toBe('breathe before the high note')
    expect(mine?.rating).toBe(4)

    await expect(saveAttemptFeedback(owner.supabase, target.id, { rating: 6 })).rejects.toThrow(/1 to 5/)

    // Make the two friends, send the attempt, and look at it as the friend.
    const { data: me } = await owner.supabase.auth.getUser()
    const { data: them } = await other.supabase.auth.getUser()
    expect(await sendFriendRequest(owner.supabase, them.user!.id)).toBe('requested')
    const incoming = (await listFriends(other.supabase)).find((f) => f.kind === 'incoming')!
    await acceptFriendRequest(other.supabase, incoming.friendship_id)
    expect(await sendAttemptToFriends(owner.supabase, target.id, [them.user!.id])).toBe(1)
    const theirs = await getSharedAttempt(other.supabase, target.id)
    expect(theirs?.id).toBe(target.id)
    expect(theirs?.accuracy).not.toBeUndefined()
    expect(theirs?.self_note).toBeNull()
    expect(theirs?.rating).toBeNull()
    expect(me.user!.id).toBe(theirs?.user_id)
  }, 30_000)

  it('deletes a recording and keeps the attempt; storage used follows', async () => {
    const before = await recordingStorageUsed(owner.supabase)
    expect(before.used_bytes).toBe(2048)
    expect(before.recordings).toBe(1)
    expect(before.cap_bytes).toBe(100 * 1024 * 1024)

    const [withAudio] = (await listSessionAttempts(owner.supabase, session.id)).filter((a) => a.recording_path)
    const path = withAudio!.recording_path!
    await deleteAttemptRecording(owner.supabase, withAudio!)

    const after = await recordingStorageUsed(owner.supabase)
    expect(after.used_bytes).toBe(0)
    const attempts = await listSessionAttempts(owner.supabase, session.id)
    expect(attempts).toHaveLength(2)
    expect(attempts.every((a) => a.recording_path === null)).toBe(true)
    const { data } = await owner.supabase.storage.from('recordings').download(path)
    expect(data).toBeNull()
  }, 30_000)

  it('refuses a recording past the budget, at the database and before uploading', async () => {
    // Pretend 100 MB are already used: the row carries the size the client reports.
    const big = await saveAttempt(owner.supabase, { ...attempt, sessionId: session.id })
    const { error } = await owner.supabase
      .from('shared_attempt')
      .update({ recording_path: `${big.user_id}/${big.id}.webm`, recording_bytes: 100 * 1024 * 1024 })
      .eq('id', big.id)
    expect(error).toBeNull()

    const { error: over } = await owner.supabase
      .from('shared_attempt')
      .update({ recording_bytes: 100 * 1024 * 1024 + 1 })
      .eq('id', big.id)
    expect(over?.message).toMatch(/Recording storage is full/)

    await expect(saveAttempt(owner.supabase, { ...attempt, sessionId: session.id }, webm(16))).rejects.toThrow(
      /Recording storage is full/,
    )
    // The attempt without audio still saves.
    const scored = await saveAttempt(owner.supabase, { ...attempt, sessionId: session.id })
    expect(scored.recording_path).toBeNull()
    await expect(attachRecording(owner.supabase, scored, webm(16))).rejects.toThrow(/Recording storage is full/)

    // Free it again.
    await owner.supabase.from('shared_attempt').update({ recording_path: null, recording_bytes: null }).eq('id', big.id)
    expect((await recordingStorageUsed(owner.supabase)).used_bytes).toBe(0)
  }, 30_000)

  it('ends a session with attempts; reopening the song within 30 minutes resumes it, later starts a new one', async () => {
    expect(await endPracticeSession(owner.supabase, session.id)).toBe('ended')
    const [ended] = await listPracticeSessions(owner.supabase, { songId: CATALOG_SONG })
    expect(ended?.ended_at).not.toBeNull()

    const back = await resumePracticeSession(owner.supabase, { songId: CATALOG_SONG, songTitle: 'Ode to Joy' })
    expect(back.resumed).toBe(true)
    expect(back.session.id).toBe(session.id)
    expect(back.session.ended_at).toBeNull()
    expect(back.attempts.length).toBeGreaterThanOrEqual(2)
    const [reopened] = await listPracticeSessions(owner.supabase, { songId: CATALOG_SONG })
    expect(reopened?.id).toBe(session.id)
    expect(reopened?.ended_at).toBeNull()

    // Ended 40 minutes ago: too long, a new session starts.
    await endPracticeSession(owner.supabase, session.id)
    const later = await resumePracticeSession(owner.supabase, { songId: CATALOG_SONG, songTitle: 'Ode to Joy' }, { now: Date.now() + IDLE_MS + 60_000 })
    expect(later.resumed).toBe(false)
    expect(later.session.id).not.toBe(session.id)
    expect(later.attempts).toEqual([])
    // A new, empty session: ending it deletes it.
    expect(await endPracticeSession(owner.supabase, later.session.id)).toBe('deleted')
    expect((await listPracticeSessions(owner.supabase, { songId: CATALOG_SONG })).map((s) => s.id)).toEqual([session.id])
  }, 30_000)

  it('deletes a session that ends with no attempts; another user cannot end yours', async () => {
    const empty = await startPracticeSession(owner.supabase, { songId: CATALOG_SONG, songTitle: 'Ode to Joy' })
    expect(await endPracticeSession(other.supabase, empty.id)).toBe('none')
    expect(await endPracticeSession(owner.supabase, empty.id)).toBe('deleted')
    expect((await listPracticeSessions(owner.supabase)).some((s) => s.id === empty.id)).toBe(false)
    expect(await endPracticeSession(owner.supabase, empty.id)).toBe('none')
  }, 30_000)

  it('closes an idle session at its last activity and deletes an idle empty one when the next starts', async () => {
    // An old empty session left open (a closed tab before any attempt).
    const abandoned = await startPracticeSession(owner.supabase, {
      songId: CATALOG_SONG,
      songTitle: 'Ode to Joy',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    // An old session left open (a closed tab), with an attempt an hour after it started.
    const staleStart = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const stale = await startPracticeSession(owner.supabase, {
      songId: null,
      songFingerprint: 'ab'.repeat(32),
      songTitle: 'My choir piece',
      startedAt: staleStart.toISOString(),
    })
    const lastActivity = new Date(staleStart.getTime() + 60 * 60 * 1000).toISOString()
    const { error } = await owner.supabase
      .from('shared_attempt')
      .insert({
        song_fingerprint: 'ab'.repeat(32),
        song_title: 'My choir piece',
        samples: [],
        accuracy: 10,
        link_shared: false,
        session_id: stale.id,
        created_at: lastActivity,
      })
    expect(error).toBeNull()

    const fresh = await startPracticeSession(owner.supabase, { songId: CATALOG_SONG, songTitle: 'Ode to Joy' })
    const sessions = await listPracticeSessions(owner.supabase)
    const closed = sessions.find((s) => s.id === stale.id)!
    expect(new Date(closed.ended_at!).getTime()).toBe(new Date(lastActivity).getTime())
    expect(sessions.find((s) => s.id === fresh.id)!.ended_at).toBeNull()
    expect(sessions.some((s) => s.id === abandoned.id)).toBe(false)
    expect(await endPracticeSession(owner.supabase, fresh.id)).toBe('deleted')

    const byFile = await listPracticeSessions(owner.supabase, { songFingerprint: 'ab'.repeat(32) })
    expect(byFile.map((s) => s.id)).toEqual([stale.id])
    expect(byFile[0]!.attempts).toHaveLength(1)
  }, 30_000)

  it('keeps sessions and feedback to their owner', async () => {
    expect(await listPracticeSessions(other.supabase)).toHaveLength(0)
    expect(await listSessionAttempts(other.supabase, session.id)).toHaveLength(0)

    const { data } = await other.supabase.from('practice_session').update({ title: 'mine now' }).eq('id', session.id).select()
    expect(data).toHaveLength(0)

    const anon = newClient()
    await expect(startPracticeSession(anon, { songId: CATALOG_SONG, songTitle: 'Ode to Joy' })).rejects.toThrow()
    await expect(recordingStorageUsed(anon)).rejects.toThrow()
  }, 30_000)

  it('needs a catalog song or a fingerprint', async () => {
    await expect(startPracticeSession(owner.supabase, { songTitle: 'nothing' })).rejects.toThrow(/fingerprint/)
  })
})
