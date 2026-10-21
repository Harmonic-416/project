import type { SupabaseClient } from '@supabase/supabase-js'
import type { Instrument, SharedAttempt } from './attempts'

/**
 * Practice sessions (change: practice-sessions, migration 0014): one row per
 * sitting at a song, with the attempts finished during it attached by
 * `shared_attempt.session_id`. The app starts a session when a signed-in
 * user opens a song to practise, ends it when they leave, and rolls over to
 * a new one after 30 minutes without an attempt (the idle rule itself lives
 * in the app, app/src/tabs/vocal/practice/practiceSession.js).
 *
 * Also here: the owner's own feedback on an attempt (self_note, rating),
 * deleting a recording while keeping the attempt, and the recording budget
 * (recording_storage_used / recording_budget_bytes in SQL).
 */

export interface PracticeSession {
  id: string
  user_id: string
  song_id: string | null
  song_fingerprint: string | null
  song_title: string
  instrument: Instrument
  started_at: string
  ended_at: string | null
  title: string | null
  notes: string | null
}

export interface NewPracticeSession {
  /** A catalog song, or null for a file only this user has. */
  songId?: string | null
  /** SHA-256 hex of the song file; required when there is no songId. */
  songFingerprint?: string | null
  songTitle: string
  instrument?: Instrument
  /** Client-made id, so attempts finished while the insert is in flight can name it. */
  id?: string
  startedAt?: string
}

/** One attempt of a session without its pitch trace / verdicts. */
export interface SessionAttempt {
  id: string
  session_id: string | null
  song_id: string | null
  song_fingerprint: string | null
  song_title: string
  part_name: string | null
  instrument: Instrument
  accuracy: number
  recording_path: string | null
  recording_bytes: number | null
  self_note: string | null
  rating: number | null
  created_at: string
  /** Short-lived URL for the recording (listSessionAttempts only), or null. */
  recording_url?: string | null
}

export interface PracticeSessionWithAttempts extends PracticeSession {
  attempts: SessionAttempt[]
}

export interface RecordingStorage {
  used_bytes: number
  cap_bytes: number
  recordings: number
}

/** Mirrors recording_budget_bytes() in migration 0014. */
export const RECORDING_BUDGET_BYTES = 100 * 1024 * 1024

export const MAX_SELF_NOTE_LENGTH = 2000

const ATTEMPT_COLUMNS =
  'id, session_id, song_id, song_fingerprint, song_title, part_name, instrument, accuracy, recording_path, recording_bytes, self_note, rating, created_at'

// Attempts are read through their session (an inner join on a table whose
// RLS shows only your own rows), so an attempt a friend sent you never shows
// up under one of *their* sessions here.
const OWN_SESSION_ATTEMPTS = `${ATTEMPT_COLUMNS}, practice_session!inner(user_id)`

const ownRow = (row: SessionAttempt & { practice_session?: unknown }): SessionAttempt => {
  const { practice_session: _session, ...attempt } = row
  return { ...attempt, accuracy: Number(attempt.accuracy) }
}

const SIGNED_URL_SECONDS = 60 * 10

// ── sessions ────────────────────────────────────────────────────────────

/**
 * Start a session at a song. Any of your sessions left open and idle for
 * over 30 minutes (a closed tab) is ended first, at its last activity.
 */
export async function startPracticeSession(
  supabase: SupabaseClient,
  session: NewPracticeSession,
): Promise<PracticeSession> {
  if (!session.songId && !session.songFingerprint) {
    throw new Error('A practice session needs a catalog song or a file fingerprint')
  }
  const { error: closeError } = await supabase.rpc('close_idle_practice_sessions')
  if (closeError) throw new Error(closeError.message)

  const { data, error } = await supabase
    .from('practice_session')
    .insert({
      ...(session.id ? { id: session.id } : {}),
      ...(session.startedAt ? { started_at: session.startedAt } : {}),
      song_id: session.songId ?? null,
      song_fingerprint: session.songId ? null : (session.songFingerprint ?? null),
      song_title: session.songTitle,
      instrument: session.instrument ?? 'voice',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as PracticeSession
}

/** End one of your sessions, now or at `endedAt` (e.g. its last attempt when it went idle). */
export async function endPracticeSession(
  supabase: SupabaseClient,
  sessionId: string,
  endedAt: string = new Date().toISOString(),
): Promise<void> {
  const { error } = await supabase
    .from('practice_session')
    .update({ ended_at: endedAt })
    .eq('id', sessionId)
    .is('ended_at', null)
  if (error) throw new Error(error.message)
}

/** Rename a session or write notes on it. */
export async function updatePracticeSession(
  supabase: SupabaseClient,
  sessionId: string,
  patch: { title?: string | null; notes?: string | null },
): Promise<void> {
  const { error } = await supabase.from('practice_session').update(patch).eq('id', sessionId)
  if (error) throw new Error(error.message)
}

/** Delete a session; its attempts stay (session_id becomes null). */
export async function deletePracticeSession(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase.from('practice_session').delete().eq('id', sessionId)
  if (error) throw new Error(error.message)
}

export interface ListSessionsOptions {
  /** Only sessions at this catalog song… */
  songId?: string | null
  /** …or at this file. Neither: every song. */
  songFingerprint?: string | null
  limit?: number
}

/**
 * Your sessions, most recent first, each with its attempts (oldest first,
 * without pitch traces or signed URLs; see listSessionAttempts for those).
 */
export async function listPracticeSessions(
  supabase: SupabaseClient,
  { songId = null, songFingerprint = null, limit = 50 }: ListSessionsOptions = {},
): Promise<PracticeSessionWithAttempts[]> {
  let query = supabase.from('practice_session').select('*').order('started_at', { ascending: false }).limit(limit)
  if (songId) query = query.eq('song_id', songId)
  else if (songFingerprint) query = query.eq('song_fingerprint', songFingerprint)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const sessions = (data ?? []) as PracticeSession[]
  if (sessions.length === 0) return []

  const { data: attemptRows, error: attemptsError } = await supabase
    .from('shared_attempt')
    .select(OWN_SESSION_ATTEMPTS)
    .in(
      'session_id',
      sessions.map((s) => s.id),
    )
    .order('created_at')
  if (attemptsError) throw new Error(attemptsError.message)
  return groupAttemptsBySession(sessions, ((attemptRows ?? []) as unknown as SessionAttempt[]).map(ownRow))
}

/** Put attempts under their session (oldest first); sessions keep their order. Pure. */
export function groupAttemptsBySession(
  sessions: PracticeSession[],
  attempts: SessionAttempt[],
): PracticeSessionWithAttempts[] {
  const bySession = new Map<string, SessionAttempt[]>()
  for (const attempt of attempts) {
    if (!attempt.session_id) continue
    const list = bySession.get(attempt.session_id)
    const row = { ...attempt, accuracy: Number(attempt.accuracy) }
    if (list) list.push(row)
    else bySession.set(attempt.session_id, [row])
  }
  return sessions.map((session) => ({
    ...session,
    attempts: (bySession.get(session.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }))
}

/** One session's attempts, oldest first, with a signed URL for each kept recording. */
export async function listSessionAttempts(supabase: SupabaseClient, sessionId: string): Promise<SessionAttempt[]> {
  const { data, error } = await supabase
    .from('shared_attempt')
    .select(OWN_SESSION_ATTEMPTS)
    .eq('session_id', sessionId)
    .order('created_at')
  if (error) throw new Error(error.message)
  const attempts = ((data ?? []) as unknown as SessionAttempt[]).map((a) => ({ ...ownRow(a), recording_url: null }))
  const paths = attempts.map((a) => a.recording_path).filter((p): p is string => Boolean(p))
  if (paths.length === 0) return attempts

  const { data: urls, error: urlError } = await supabase.storage.from('recordings').createSignedUrls(paths, SIGNED_URL_SECONDS)
  if (urlError) throw new Error(urlError.message)
  const byPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]))
  return attempts.map((a) => ({ ...a, recording_url: a.recording_path ? (byPath.get(a.recording_path) ?? null) : null }))
}

/** Short-lived URL for one of your attempts' recording, or null when it has none. */
export async function getRecordingUrl(
  supabase: SupabaseClient,
  attempt: Pick<SessionAttempt, 'recording_path'>,
): Promise<string | null> {
  if (!attempt.recording_path) return null
  const { data, error } = await supabase.storage.from('recordings').createSignedUrl(attempt.recording_path, SIGNED_URL_SECONDS)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ── feedback ────────────────────────────────────────────────────────────

export interface AttemptFeedbackPatch {
  /** Your note; '' or null clears it. */
  selfNote?: string | null
  /** 1–5, or null to clear. */
  rating?: number | null
}

/** Save your own note and/or rating on one of your attempts. */
export async function saveAttemptFeedback(
  supabase: SupabaseClient,
  attemptId: string,
  { selfNote, rating }: AttemptFeedbackPatch,
): Promise<void> {
  const patch: { self_note?: string | null; rating?: number | null } = {}
  if (selfNote !== undefined) {
    const text = selfNote?.trim() ?? ''
    if (text.length > MAX_SELF_NOTE_LENGTH) throw new Error(`Keep the note under ${MAX_SELF_NOTE_LENGTH} characters`)
    patch.self_note = text || null
  }
  if (rating !== undefined) {
    if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
      throw new Error('A rating is a whole number from 1 to 5')
    }
    patch.rating = rating
  }
  if (Object.keys(patch).length === 0) return
  const { error } = await supabase.from('shared_attempt').update(patch).eq('id', attemptId)
  if (error) throw new Error(error.message)
}

// ── recordings ──────────────────────────────────────────────────────────

/**
 * Drop an attempt's audio, keeping the attempt (score, trace, feedback).
 * The row is cleared first, so the budget is freed and the list is right
 * even if removing the object fails; an orphaned object counts for nothing.
 */
export async function deleteAttemptRecording(
  supabase: SupabaseClient,
  attempt: Pick<SharedAttempt | SessionAttempt, 'id' | 'recording_path'>,
): Promise<void> {
  if (!attempt.recording_path) return
  const { error } = await supabase
    .from('shared_attempt')
    .update({ recording_path: null, recording_bytes: null })
    .eq('id', attempt.id)
  if (error) throw new Error(error.message)
  const { error: removeError } = await supabase.storage.from('recordings').remove([attempt.recording_path])
  if (removeError) throw new Error(removeError.message)
}

/** How much of your recording budget is used. */
export async function recordingStorageUsed(supabase: SupabaseClient): Promise<RecordingStorage> {
  const { data, error } = await supabase.rpc('recording_storage_used')
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as RecordingStorage | undefined
  return {
    used_bytes: Number(row?.used_bytes ?? 0),
    cap_bytes: Number(row?.cap_bytes ?? RECORDING_BUDGET_BYTES),
    recordings: Number(row?.recordings ?? 0),
  }
}
