import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Arrangements from a YouTube link (migration 0011). The Vocal tab's
 * arranger runs on the device from an audio file; given only a link, a
 * signed-in user on the arranger list queues a job instead, and the
 * arranger worker (worker/arranger/) fetches the audio, arranges it and
 * leaves the MusicXML in the private `arrangements` bucket. The audio is
 * never stored. Jobs are owner-only; the worker writes their progress.
 */

export type Voicing = 'solo_ttbb' | 'ttbb' | 'satb' | 'tb'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export interface ArrangementSummary {
  key: string
  shift: number
  melodyPartName: string
  bpm: number
  measures: number
  /** Where the words under the notes came from: published lyrics, Whisper alone, or none. */
  lyrics?: 'official' | 'heard' | null
}

export interface ArrangementJob {
  id: string
  user_id: string
  youtube_id: string
  voicing: Voicing
  melody_part: number
  keep_key: boolean
  status: JobStatus
  stage: string | null
  progress: number
  title: string | null
  summary: ArrangementSummary | null
  result_path: string | null
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface NewArrangement {
  youtubeId: string
  voicing?: Voicing
  /** The part that sings the tune (TTBB: 0 Tenor 1, 1 Tenor 2). */
  melodyPart?: number
  keepKey?: boolean
}

const COLUMNS =
  'id, user_id, youtube_id, voicing, melody_part, keep_key, status, stage, progress, title, summary, result_path, error, created_at, started_at, finished_at'

/** Why a job couldn't be queued, in words for the user. */
function queueError(error: { message?: string; code?: string }): Error {
  const message = error.message ?? ''
  if (message.includes('arranger_daily_limit')) return new Error('That’s today’s limit of arrangements from links. Try again tomorrow, or upload the audio instead.')
  if (message.includes('arranger_busy')) return new Error('Two arrangements are already on their way. Wait for one to finish.')
  if (error.code === '42501' || message.includes('row-level security')) {
    return new Error('Arranging from a link is only open to the Harmonic team for now. Upload the audio instead.')
  }
  return new Error(message || 'The arrangement couldn’t be queued.')
}

/** Whether the signed-in user may queue arrangements from links. */
export async function canArrangeFromLinks(supabase: SupabaseClient): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return false
  const { data, error } = await supabase.from('arranger_access').select('user_id').eq('user_id', userData.user.id).maybeSingle()
  if (error) return false
  return Boolean(data)
}

/** Queue an arrangement of a YouTube video; the worker picks it up. */
export async function requestArrangement(supabase: SupabaseClient, job: NewArrangement): Promise<ArrangementJob> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(job.youtubeId)) throw new Error('That isn’t a YouTube video id')
  const { data, error } = await supabase
    .from('arrangement_job')
    .insert({
      youtube_id: job.youtubeId,
      voicing: job.voicing ?? 'ttbb',
      melody_part: job.melodyPart ?? 0,
      keep_key: job.keepKey ?? false,
    })
    .select(COLUMNS)
    .single()
  if (error) throw queueError(error)
  return data as ArrangementJob
}

/** One of the user's jobs, or null. */
export async function getArrangementJob(supabase: SupabaseClient, id: string): Promise<ArrangementJob | null> {
  const { data, error } = await supabase.from('arrangement_job').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as ArrangementJob | null) ?? null
}

/** The user's latest jobs, newest first. */
export async function listMyArrangementJobs(supabase: SupabaseClient, limit = 5): Promise<ArrangementJob[]> {
  const { data, error } = await supabase.from('arrangement_job').select(COLUMNS).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as ArrangementJob[]
}

/** A finished job's MusicXML. */
export async function downloadArrangement(supabase: SupabaseClient, job: ArrangementJob): Promise<string> {
  if (job.status !== 'done' || !job.result_path) throw new Error('That arrangement isn’t ready')
  const { data, error } = await supabase.storage.from('arrangements').download(job.result_path)
  if (error || !data) throw error ?? new Error('The arrangement couldn’t be downloaded')
  return data.text()
}

/** Forget a finished or failed job, and its result. */
export async function deleteArrangementJob(supabase: SupabaseClient, job: ArrangementJob): Promise<void> {
  if (job.result_path) await supabase.storage.from('arrangements').remove([job.result_path])
  const { error } = await supabase.from('arrangement_job').delete().eq('id', job.id)
  if (error) throw error
}
