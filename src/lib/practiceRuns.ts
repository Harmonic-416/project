import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Scored practice runs (migration 0015): each "Wait for me" or "Trouble
 * spots" run sung from the top of the song, kept on the account so the
 * Vocal tab's chart of tries survives closing the tab and follows the user
 * to other devices. One chart is one song (by file fingerprint), part,
 * accompaniment and mode. Owner-only.
 */

export type PracticeRunMode = 'wait' | 'trouble'
export type Accompaniment = 'solo' | 'all'

/** Which chart a run belongs to. */
export interface PracticeRunSetting {
  /** SHA-256 hex of the song file (every song has one, catalog or not). */
  songFingerprint: string
  partId?: string | null
  accompaniment: Accompaniment
  mode: PracticeRunMode
}

/** What a run's score was made of (see migration 0015). */
export interface RunNoteCounts {
  total: number
  right: number
  half: number
  missed: number
}

export interface NewPracticeRun extends PracticeRunSetting {
  score: number
  notes?: RunNoteCounts | null
  songId?: string | null
  songTitle?: string
  partName?: string | null
  /** The practice session it was sung in (0014), if any. */
  sessionId?: string | null
}

export interface PracticeRun {
  id: string
  score: number
  created_at: string
  session_id: string | null
  mode: PracticeRunMode
  part_name: string | null
  notes_total: number | null
  notes_right: number | null
  notes_half: number | null
  notes_missed: number | null
}

const RUN_COLUMNS = 'id, score, created_at, session_id, mode, part_name, notes_total, notes_right, notes_half, notes_missed'
const asRun = (row: PracticeRun): PracticeRun => ({ ...row, score: Number(row.score) })

function checkCounts(notes: RunNoteCounts | null | undefined): void {
  if (!notes) return
  for (const n of [notes.total, notes.right, notes.half, notes.missed]) {
    if (!(Number.isInteger(n) && n >= 0)) throw new Error('Note counts are whole numbers from 0')
  }
}

/** How many runs a chart loads: the latest ones. */
export const MAX_CHART_RUNS = 50

const FINGERPRINT = /^[0-9a-f]{64}$/

function checkSetting({ songFingerprint, accompaniment, mode }: PracticeRunSetting): void {
  if (!FINGERPRINT.test(songFingerprint)) throw new Error('A practice run needs the song file’s SHA-256 fingerprint')
  if (accompaniment !== 'solo' && accompaniment !== 'all') throw new Error(`Unknown accompaniment: ${accompaniment}`)
  if (mode !== 'wait' && mode !== 'trouble') throw new Error(`Unknown practice mode: ${mode}`)
}

/** Save one scored run for the signed-in user. */
export async function savePracticeRun(supabase: SupabaseClient, run: NewPracticeRun): Promise<PracticeRun> {
  checkSetting(run)
  if (!(Number.isFinite(run.score) && run.score >= 0 && run.score <= 100)) throw new Error('A score is from 0 to 100')
  checkCounts(run.notes)
  const { data, error } = await supabase
    .from('practice_run')
    .insert({
      song_id: run.songId ?? null,
      song_fingerprint: run.songFingerprint,
      song_title: (run.songTitle ?? '').slice(0, 300),
      part_id: run.partId ?? null,
      part_name: run.partName ?? null,
      accompaniment: run.accompaniment,
      mode: run.mode,
      score: run.score,
      notes_total: run.notes?.total ?? null,
      notes_right: run.notes?.right ?? null,
      notes_half: run.notes?.half ?? null,
      notes_missed: run.notes?.missed ?? null,
      session_id: run.sessionId ?? null,
    })
    .select(RUN_COLUMNS)
    .single()
  if (error) throw error
  return asRun(data as PracticeRun)
}

/** The user's latest runs for one chart, oldest first (the order they are drawn in). */
export async function listPracticeRuns(
  supabase: SupabaseClient,
  setting: PracticeRunSetting,
  limit = MAX_CHART_RUNS,
): Promise<PracticeRun[]> {
  checkSetting(setting)
  let query = supabase
    .from('practice_run')
    .select(RUN_COLUMNS)
    .eq('song_fingerprint', setting.songFingerprint)
    .eq('accompaniment', setting.accompaniment)
    .eq('mode', setting.mode)
  query = setting.partId ? query.eq('part_id', setting.partId) : query.is('part_id', null)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return ((data ?? []) as PracticeRun[]).map(asRun).reverse()
}

/** The scored runs sung in one of your practice sessions, oldest first. */
export async function listSessionRuns(supabase: SupabaseClient, sessionId: string): Promise<PracticeRun[]> {
  const { data, error } = await supabase
    .from('practice_run')
    .select(RUN_COLUMNS)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as PracticeRun[]).map(asRun)
}
