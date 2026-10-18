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
}

export const MAX_TRACE_SAMPLES = 30000

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
      instrument: attempt.instrument ?? 'voice',
      verdicts: attempt.verdicts ?? null,
      link_shared: linkShared,
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