import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared attempts: send a sung attempt to someone as a link. The song is
 * never uploaded — a catalog song is referenced by id, anything else by the
 * SHA-256 of the file, and the viewer opens their own copy of it.
 */

export type SongFormat = 'midi' | 'musicxml' | 'mxl'

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
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Sign in to share an attempt')
  if (!attempt.songId && !attempt.songFingerprint) throw new Error('A shared attempt needs a catalog song or a file fingerprint')
  if (attempt.samples.length > MAX_TRACE_SAMPLES) throw new Error('That attempt is too long to share')

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

/** The caller's own shares, newest first. */
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
