import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared attempts: send a sung (Vocal) or played (Guitar) attempt to
 * someone as a link. The song is never uploaded — a catalog song is
 * referenced by id, anything else by the SHA-256 of the file, and the viewer
 * opens their own copy of it. A sung attempt carries its pitch trace; a
 * guitar attempt carries the verdict on every note (migration 0007).
 *
 * Since 0010 the same table also keeps attempts that were never shared: a
 * signed-in player's finished attempts are saved privately (saveAttempt),
 * can be sent to friends (sendAttemptToFriends) and commented on by the
 * owner and those friends. `link_shared` says whether anyone with the link
 * may open it.
 */

export type SongFormat = 'midi' | 'musicxml' | 'mxl' | 'guitar-pro' | 'alphatex'

export type Instrument = 'voice' | 'guitar'

/** A guitar attempt's verdict on one note of its song timeline, or null where the run didn't reach. */
export type NoteVerdict = 'hit' | 'close' | 'miss' | 'skipped' | null

/** What kind of guitar run an attempt was (0017): Wait for me or Trouble spots. */
export type RunMode = 'wait' | 'trouble'

/** One pitch frame: [seconds on the playback clock, fractional MIDI note]. */
export type TraceSample = [number, number]

export interface SharedAttempt {
  id: string
  user_id: string
  sharer_name: string | null
  song_id: string | null
  song_title: string
  song_format: SongFormat | null
  song_fingerprint: string | null
  part_id: string | null
  part_name: string | null
  with_others: boolean
  samples: TraceSample[]
  accuracy: number
  recording_path: string | null
  instrument: Instrument
  verdicts: NoteVerdict[] | null
  /** Anyone signed in with the link may open it (false: owner + friends it was sent to). */
  link_shared: boolean
  created_at: string
  /** The practice session it was made in (0014), if any. */
  session_id: string | null
  /** The owner's own note and 1–5 rating (0014); null to anyone but the owner. */
  self_note: string | null
  rating: number | null
  /** Size of the kept recording, counted against the owner's budget (0014). */
  recording_bytes: number | null
  /** Guitar runs (0017): the mode, the Easy version, and whether it went from the first note to the end. */
  mode: RunMode | null
  easy: boolean | null
  full_run: boolean | null
}

export interface NewSharedAttempt {
  sharerName?: string | null
  /** A catalog song, or null for a file only the two users have. */
  songId?: string | null
  songTitle: string
  songFormat?: SongFormat | null
  /** SHA-256 hex of the song file; required when there is no songId. */
  songFingerprint?: string | null
  partId?: string | null
  partName?: string | null
  withOthers?: boolean
  samples: TraceSample[]
  accuracy: number
  /** 'voice' (the default) or 'guitar'. */
  instrument?: Instrument
  /** Guitar: the verdict on every note of the practised track, by timeline index. */
  verdicts?: NoteVerdict[] | null
  /** The open practice session to attach it to (0014). */
  sessionId?: string | null
  /** Guitar runs (0017): Wait for me or Trouble spots, Easy version, first note to the end. */
  mode?: RunMode | null
  easy?: boolean | null
  fullRun?: boolean | null
}

export const MAX_TRACE_SAMPLES = 30000

/**
 * Thrown before uploading a recording that wouldn't fit the owner's budget
 * (migration 0014; the database refuses it too). The message is for the user.
 */
export class RecordingBudgetError extends Error {
  constructor(usedBytes: number, capBytes: number) {
    const mb = (n: number) => Math.round(n / 1048576)
    super(`Recording storage is full (${mb(usedBytes)} MB of ${mb(capBytes)} MB used). Delete some recordings to keep this one.`)
    this.name = 'RecordingBudgetError'
  }
}

/** Throws RecordingBudgetError when `bytes` more wouldn't fit the caller's budget. */
export async function assertRecordingFits(supabase: SupabaseClient, bytes: number): Promise<void> {
  const { data, error } = await supabase.rpc('recording_storage_used')
  if (error) throw new Error(error.message)
  const row = (data as { used_bytes: number; cap_bytes: number }[] | { used_bytes: number; cap_bytes: number } | null)
  const usage = Array.isArray(row) ? row[0] : row
  if (!usage) return
  const used = Number(usage.used_bytes)
  const cap = Number(usage.cap_bytes)
  if (used + bytes > cap) throw new RecordingBudgetError(used, cap)
}

/**
 * Store the attempt (and, if given, its compressed recording in the owner's
 * recordings folder) and return the new share. If the row can't be written
 * the uploaded recording is removed again.
 */
export async function shareAttempt(
  supabase: SupabaseClient,
  attempt: NewSharedAttempt,
  recording?: Blob | null,
): Promise<SharedAttempt> {
  return insertAttempt(supabase, attempt, recording, true)
}

/**
 * Save a finished attempt privately: only you can see it until you send it
 * to friends (sendAttemptToFriends) or copy its link (shareAttemptLink).
 */
export async function saveAttempt(
  supabase: SupabaseClient,
  attempt: NewSharedAttempt,
  recording?: Blob | null,
): Promise<SharedAttempt> {
  return insertAttempt(supabase, attempt, recording, false)
}

async function insertAttempt(
  supabase: SupabaseClient,
  attempt: NewSharedAttempt,
  recording: Blob | null | undefined,
  linkShared: boolean,
): Promise<SharedAttempt> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Sign in to share an attempt')
  if (!attempt.songId && !attempt.songFingerprint) throw new Error('A shared attempt needs a catalog song or a file fingerprint')
  if (attempt.samples.length > MAX_TRACE_SAMPLES || (attempt.verdicts?.length ?? 0) > MAX_TRACE_SAMPLES) {
    throw new Error('That attempt is too long to share')
  }

  const id = crypto.randomUUID()
  let recordingPath: string | null = null
  if (recording) {
    await assertRecordingFits(supabase, recording.size)
    recordingPath = `${userData.user.id}/${id}.webm`
    const { error } = await supabase.storage
      .from('recordings')
      .upload(recordingPath, recording, { contentType: recording.type || 'audio/webm' })
    if (error) throw error
  }

  const { data, error } = await supabase
    .from('shared_attempt')
    .insert({
      id,
      user_id: userData.user.id,
      sharer_name: attempt.sharerName ?? null,
      song_id: attempt.songId ?? null,
      song_title: attempt.songTitle,
      song_format: attempt.songFormat ?? null,
      song_fingerprint: attempt.songFingerprint ?? null,
      part_id: attempt.partId ?? null,
      part_name: attempt.partName ?? null,
      with_others: attempt.withOthers ?? false,
      samples: attempt.samples,
      accuracy: attempt.accuracy,
      recording_path: recordingPath,
      recording_bytes: recording ? recording.size : null,
      instrument: attempt.instrument ?? 'voice',
      verdicts: attempt.verdicts ?? null,
      link_shared: linkShared,
      session_id: attempt.sessionId ?? null,
      mode: attempt.mode ?? null,
      easy: attempt.easy ?? null,
      full_run: attempt.fullRun ?? null,
    })
    .select()
    .single()
  if (error) {
    if (recordingPath) await supabase.storage.from('recordings').remove([recordingPath]).catch(() => {})
    throw error
  }
  return data as SharedAttempt
}

/** A share by id for any signed-in user with the link; null if it doesn't exist (or was deleted). */
export async function getSharedAttempt(supabase: SupabaseClient, id: string): Promise<SharedAttempt | null> {
  const { data, error } = await supabase.rpc('get_shared_attempt', { attempt_id: id })
  if (error) throw error
  return ((data as SharedAttempt[] | null) ?? [])[0] ?? null
}

/** Short-lived URL for a shared attempt's recording, or null when it has none. */
export async function getSharedRecordingUrl(supabase: SupabaseClient, attempt: SharedAttempt): Promise<string | null> {
  if (!attempt.recording_path) return null
  const { data, error } = await supabase.storage.from('recordings').createSignedUrl(attempt.recording_path, 60 * 10)
  if (error) throw error
  return data.signedUrl
}

/** The caller's own attempts (shared or not), newest first. */
export async function listMySharedAttempts(supabase: SupabaseClient): Promise<SharedAttempt[]> {
  const { data, error } = await supabase
    .from('shared_attempt')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SharedAttempt[]
}

/** One of a singer's attempts at a song, as listed under an opened attempt. */
export interface SongAttempt {
  id: string
  user_id: string
  created_at: string
  part_id: string | null
  part_name: string | null
  accuracy: number
  recording_path: string | null
  recording_bytes: number | null
  session_id: string | null
  /** The owner's note and rating: only filled in for the owner. */
  self_note: string | null
  rating: number | null
  /** Comments from the owner and the friends it was sent to. */
  comment_count: number
}

const SONG_ATTEMPT_COLUMNS = 'id, user_id, created_at, part_id, part_name, accuracy, recording_path, recording_bytes, session_id'

/**
 * The attempts `attempt`'s singer made at the same song (same catalog song
 * or the same file), newest first, `attempt` included, with their comment
 * counts. Row-level security decides which ones come back: all of them for
 * the singer, and for a friend only those sent to them. The owner's note
 * and rating are asked for only when `isOwner`, so they never leave the
 * database for anyone else.
 */
export async function listSongAttempts(
  supabase: SupabaseClient,
  attempt: Pick<SharedAttempt, 'user_id' | 'song_id' | 'song_fingerprint' | 'instrument'>,
  { isOwner = false, limit = 50 }: { isOwner?: boolean; limit?: number } = {},
): Promise<SongAttempt[]> {
  const columns = `${SONG_ATTEMPT_COLUMNS}${isOwner ? ', self_note, rating' : ''}, attempt_comment(count)`
  let query = supabase
    .from('shared_attempt')
    .select(columns)
    .eq('user_id', attempt.user_id)
    .eq('instrument', attempt.instrument ?? 'voice')
  query = attempt.song_id ? query.eq('song_id', attempt.song_id) : query.eq('song_fingerprint', attempt.song_fingerprint ?? '')
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const counts = row.attempt_comment as Array<{ count: number }> | undefined
    const { attempt_comment: _counts, ...rest } = row
    return {
      self_note: null,
      rating: null,
      ...rest,
      comment_count: counts?.[0]?.count ?? 0,
    } as SongAttempt
  })
}

/** Whether the caller may see (and comment on) an attempt: its owner, or a friend it was sent to. */
export async function canViewAttempt(supabase: SupabaseClient, attemptId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_view_attempt', { attempt: attemptId })
  if (error) throw error
  return Boolean(data)
}

/** Stop sharing: removes the row, then its recording. */
export async function deleteSharedAttempt(supabase: SupabaseClient, attempt: SharedAttempt): Promise<void> {
  const { error } = await supabase.from('shared_attempt').delete().eq('id', attempt.id)
  if (error) throw error
  if (attempt.recording_path) {
    const { error: removeError } = await supabase.storage.from('recordings').remove([attempt.recording_path])
    if (removeError) throw removeError
  }
}

/** Let anyone signed in with the link open one of your saved attempts. */
export async function shareAttemptLink(supabase: SupabaseClient, attemptId: string): Promise<void> {
  const { error } = await supabase.from('shared_attempt').update({ link_shared: true }).eq('id', attemptId)
  if (error) throw error
}

/**
 * Correct a saved attempt's result: a guitar run re-checked note by note
 * after it was saved (GuitarTroubleMode's "Check my run more accurately").
 */
export async function updateAttemptResult(
  supabase: SupabaseClient,
  attemptId: string,
  { verdicts, accuracy }: { verdicts: NoteVerdict[] | null; accuracy: number },
): Promise<void> {
  if ((verdicts?.length ?? 0) > MAX_TRACE_SAMPLES) throw new Error('That attempt is too long to save')
  const { error } = await supabase.from('shared_attempt').update({ verdicts, accuracy }).eq('id', attemptId)
  if (error) throw error
}

/** One full run's score, for a song's last and best (listSongScores). */
export interface SongScore {
  id: string
  accuracy: number
  created_at: string
}

export interface SongScoresQuery {
  /** A catalog song… */
  songId?: string | null
  /** …or a file, by its SHA-256. */
  songFingerprint?: string | null
  instrument: Instrument
  mode: RunMode
  easy?: boolean
  partId?: string | null
  limit?: number
}

/**
 * Your full runs at one song, mode, part and version (Easy or not), newest
 * first: what "Last run · best" on the open song is worked out from. Runs
 * that were looped or stopped early (full_run false) aren't counted.
 */
export async function listSongScores(
  supabase: SupabaseClient,
  { songId = null, songFingerprint = null, instrument, mode, easy = false, partId = null, limit = 50 }: SongScoresQuery,
): Promise<SongScore[]> {
  if (!songId && !songFingerprint) return []
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return []
  let query = supabase
    .from('shared_attempt')
    .select('id, accuracy, created_at')
    .eq('user_id', userData.user.id)
    .eq('instrument', instrument)
    .eq('mode', mode)
    .eq('easy', easy)
    .eq('full_run', true)
  query = songId ? query.eq('song_id', songId) : query.eq('song_fingerprint', songFingerprint ?? '')
  if (partId !== null) query = query.eq('part_id', partId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return ((data ?? []) as SongScore[]).map((row) => ({ ...row, accuracy: Number(row.accuracy) }))
}

// ── sending to friends (0010) ───────────────────────────────────────────

/** Send one of your attempts to some of your friends; returns how many it went to. */
export async function sendAttemptToFriends(
  supabase: SupabaseClient,
  attemptId: string,
  friendIds: string[],
): Promise<number> {
  if (friendIds.length === 0) return 0
  const { data, error } = await supabase.rpc('send_attempt_to_friends', { attempt: attemptId, friend_ids: friendIds })
  if (error) throw new Error(error.message)
  return data as number
}

/** Take an attempt back from one friend. */
export async function unsendAttempt(supabase: SupabaseClient, attemptId: string, friendId: string): Promise<void> {
  const { error } = await supabase.rpc('unsend_attempt', { attempt: attemptId, friend: friendId })
  if (error) throw new Error(error.message)
}

export interface AttemptRecipient {
  recipient_id: string
  sent_at: string
  seen_at: string | null
}

/** Who one of your attempts was sent to, and whether they've opened it. */
export async function listAttemptRecipients(supabase: SupabaseClient, attemptId: string): Promise<AttemptRecipient[]> {
  const { data, error } = await supabase
    .from('attempt_recipient')
    .select('recipient_id, sent_at, seen_at')
    .eq('attempt_id', attemptId)
    .order('sent_at')
  if (error) throw error
  return (data ?? []) as AttemptRecipient[]
}

/** An attempt a friend sent you, without the heavy pitch/verdict data. */
export interface InboxAttempt {
  attempt_id: string
  sender_id: string
  sender_name: string | null
  sender_tag: string
  sender_avatar_url: string | null
  song_title: string
  part_name: string | null
  instrument: Instrument
  accuracy: number
  has_recording: boolean
  sent_at: string
  seen_at: string | null
  comment_count: number
}

/** Attempts friends sent you, newest first. Open one with getSharedAttempt. */
export async function listAttemptsSharedWithMe(supabase: SupabaseClient): Promise<InboxAttempt[]> {
  const { data, error } = await supabase.rpc('list_attempts_shared_with_me')
  if (error) throw new Error(error.message)
  return ((data ?? []) as InboxAttempt[]).map((row) => ({ ...row, accuracy: Number(row.accuracy) }))
}

/** Mark an attempt a friend sent you as opened. */
export async function markAttemptSeen(supabase: SupabaseClient, attemptId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_attempt_seen', { attempt: attemptId })
  if (error) throw new Error(error.message)
}

// ── comments (0010) ─────────────────────────────────────────────────────

export const MAX_COMMENT_LENGTH = 1000

export interface AttemptComment {
  id: string
  author_id: string
  display_name: string | null
  tag: string
  avatar_url: string | null
  body: string
  created_at: string
}

/** An attempt's comments, oldest first (empty if you may not see it). */
export async function listAttemptComments(supabase: SupabaseClient, attemptId: string): Promise<AttemptComment[]> {
  const { data, error } = await supabase.rpc('list_attempt_comments', { attempt: attemptId })
  if (error) throw new Error(error.message)
  return (data ?? []) as AttemptComment[]
}

/** Comment on your attempt or one a friend sent you. */
export async function addAttemptComment(supabase: SupabaseClient, attemptId: string, body: string): Promise<void> {
  const text = body.trim()
  if (!text) throw new Error('Write something first')
  if (text.length > MAX_COMMENT_LENGTH) throw new Error(`Keep it under ${MAX_COMMENT_LENGTH} characters`)
  const { error } = await supabase.from('attempt_comment').insert({ attempt_id: attemptId, body: text })
  if (error) throw new Error(error.message)
}

/** Delete your comment (or any comment on your own attempt). */
export async function deleteAttemptComment(supabase: SupabaseClient, commentId: string): Promise<void> {
  const { error } = await supabase.from('attempt_comment').delete().eq('id', commentId)
  if (error) throw new Error(error.message)
}

// ── homepage extras ─────────────────────────────────────────────────────

/**
 * Add a recording to one of your saved attempts (saveAttempt stores none),
 * e.g. when "Keep recording" is ticked or you share it with your recording.
 * Counts against your recording budget (0014). Returns the attempt with its
 * recording_path; one that already has a recording is left as it is.
 */
export async function attachRecording(
  supabase: SupabaseClient,
  attempt: SharedAttempt,
  recording: Blob,
): Promise<SharedAttempt> {
  if (attempt.recording_path) return attempt
  await assertRecordingFits(supabase, recording.size)
  const path = `${attempt.user_id}/${attempt.id}.webm`
  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(path, recording, { contentType: recording.type || 'audio/webm', upsert: true })
  if (uploadError) throw uploadError
  const { error } = await supabase
    .from('shared_attempt')
    .update({ recording_path: path, recording_bytes: recording.size })
    .eq('id', attempt.id)
  if (error) {
    await supabase.storage.from('recordings').remove([path]).catch(() => {})
    throw new Error(error.message)
  }
  return { ...attempt, recording_path: path, recording_bytes: recording.size }
}

/** One of your attempts you sent to friends, with who got it. */
export interface SentAttempt {
  attempt_id: string
  song_title: string
  instrument: Instrument
  accuracy: number
  created_at: string
  recipients: AttemptRecipient[]
}

/** Your attempts you've sent to friends, most recently sent first. */
export async function listSentAttempts(supabase: SupabaseClient, limit = 50): Promise<SentAttempt[]> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return []
  const { data, error } = await supabase
    .from('attempt_recipient')
    .select('attempt_id, recipient_id, sent_at, seen_at, shared_attempt(song_title, instrument, accuracy, created_at)')
    .eq('sender_id', userData.user.id)
    .order('sent_at', { ascending: false })
    .limit(limit * 5)
  if (error) throw error

  type Row = AttemptRecipient & {
    attempt_id: string
    shared_attempt: { song_title: string; instrument: Instrument; accuracy: number; created_at: string } | null
  }
  const byAttempt = new Map<string, SentAttempt>()
  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.shared_attempt) continue
    let entry = byAttempt.get(row.attempt_id)
    if (!entry) {
      entry = {
        attempt_id: row.attempt_id,
        song_title: row.shared_attempt.song_title,
        instrument: row.shared_attempt.instrument,
        accuracy: Number(row.shared_attempt.accuracy),
        created_at: row.shared_attempt.created_at,
        recipients: [],
      }
      byAttempt.set(row.attempt_id, entry)
    }
    entry.recipients.push({ recipient_id: row.recipient_id, sent_at: row.sent_at, seen_at: row.seen_at })
  }
  return [...byAttempt.values()].slice(0, limit)
}