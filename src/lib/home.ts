import type { SupabaseClient } from '@supabase/supabase-js'
import type { Instrument, NoteVerdict, SharedAttempt } from './attempts'

/**
 * The homepage's own data (change: user-homepage): the songs you're working
 * on and how your latest attempt went, both from your saved attempts
 * (shared_attempt, migration 0010). The grouping and feedback are plain
 * functions so they're tested without a database (tests/backend/home.test.ts).
 */

/** One saved attempt without its heavy pitch trace / verdicts. */
export interface AttemptSummary {
  id: string
  song_id: string | null
  song_fingerprint: string | null
  song_title: string
  part_name: string | null
  instrument: Instrument
  accuracy: number
  created_at: string
}

export interface SongInProgress {
  /** Stable key for the song (catalog id, or the file's fingerprint). */
  key: string
  song_id: string | null
  song_fingerprint: string | null
  song_title: string
  instrument: Instrument
  attempts: number
  best: number
  latest: number
  /** Latest minus the attempt before it, in points; null with only one attempt. */
  change: number | null
  last_practiced: string
  latest_attempt_id: string
}

export interface AttemptFeedback {
  accuracy: number
  /** Points up (+) or down (−) from your previous attempt at the same song, or null. */
  change: number | null
  /** One-line summary for the card. */
  headline: string
  /** Guitar only: how many notes were hit / close / missed / skipped. */
  counts: Record<'hit' | 'close' | 'miss' | 'skipped', number> | null
  /** Guitar only: the longest stretches of missed notes (timeline indexes, inclusive), worst first. */
  troubleSpots: { from: number; to: number }[]
}

const SUMMARY_COLUMNS = 'id, song_id, song_fingerprint, song_title, part_name, instrument, accuracy, created_at'

export function songKey(attempt: { song_id: string | null; song_fingerprint: string | null; song_title: string; instrument: Instrument }): string {
  return `${attempt.instrument}:${attempt.song_id ?? attempt.song_fingerprint ?? attempt.song_title}`
}

// ── queries ─────────────────────────────────────────────────────────────

/** Your most recent saved attempts, newest first (light: no traces). */
export async function listRecentAttempts(supabase: SupabaseClient, limit = 200): Promise<AttemptSummary[]> {
  const { data, error } = await supabase
    .from('shared_attempt')
    .select(SUMMARY_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as AttemptSummary[]).map((a) => ({ ...a, accuracy: Number(a.accuracy) }))
}

/** Your newest attempt in full (with verdicts), or null if you have none. */
export async function getLatestAttempt(supabase: SupabaseClient): Promise<SharedAttempt | null> {
  const { data, error } = await supabase
    .from('shared_attempt')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? ({ ...data, accuracy: Number(data.accuracy) } as SharedAttempt) : null
}

// ── grouping + feedback (pure) ──────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10

/** Group attempts (newest first) by song: most recently practised first. */
export function songsInProgress(attempts: AttemptSummary[]): SongInProgress[] {
  const bySong = new Map<string, AttemptSummary[]>()
  for (const attempt of attempts) {
    const key = songKey(attempt)
    const list = bySong.get(key)
    if (list) list.push(attempt)
    else bySong.set(key, [attempt])
  }

  return [...bySong.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
      const latest = sorted[0]!
      const previous = sorted[1]
      return {
        key,
        song_id: latest.song_id,
        song_fingerprint: latest.song_fingerprint,
        song_title: latest.song_title,
        instrument: latest.instrument,
        attempts: sorted.length,
        best: Math.max(...sorted.map((a) => a.accuracy)),
        latest: latest.accuracy,
        change: previous ? round1(latest.accuracy - previous.accuracy) : null,
        last_practiced: latest.created_at,
        latest_attempt_id: latest.id,
      }
    })
    .sort((a, b) => b.last_practiced.localeCompare(a.last_practiced))
}

/** Runs of consecutive misses, longest first (ties: earliest first). */
export function missedStretches(verdicts: NoteVerdict[], limit = 3): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = []
  let start = -1
  verdicts.forEach((verdict, i) => {
    if (verdict === 'miss') {
      if (start < 0) start = i
    } else if (start >= 0) {
      runs.push({ from: start, to: i - 1 })
      start = -1
    }
  })
  if (start >= 0) runs.push({ from: start, to: verdicts.length - 1 })
  return runs.sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from).slice(0, limit)
}

/**
 * How an attempt went. `previous` is your attempt before it at the same
 * song, if any, for the "up/down from last time" part.
 */
export function attemptFeedback(
  attempt: Pick<SharedAttempt, 'accuracy' | 'instrument' | 'verdicts'>,
  previous?: { accuracy: number } | null,
): AttemptFeedback {
  const accuracy = round1(Number(attempt.accuracy))
  const change = previous ? round1(accuracy - Number(previous.accuracy)) : null

  let counts: AttemptFeedback['counts'] = null
  let troubleSpots: AttemptFeedback['troubleSpots'] = []
  if (attempt.instrument === 'guitar' && attempt.verdicts) {
    counts = { hit: 0, close: 0, miss: 0, skipped: 0 }
    for (const v of attempt.verdicts) if (v) counts[v] += 1
    troubleSpots = missedStretches(attempt.verdicts)
  }

  let headline: string
  if (change === null) headline = `${accuracy}% on your first try`
  else if (change > 0) headline = `${accuracy}%, up ${change} from last time`
  else if (change < 0) headline = `${accuracy}%, down ${-change} from last time`
  else headline = `${accuracy}%, same as last time`

  return { accuracy, change, headline, counts, troubleSpots }
}