import type { SupabaseClient } from '@supabase/supabase-js'

/** Tasks 2.1–2.6 (F2, F22, F37): progress, unlocking map, history, tempo. */

export interface LessonNode {
  id: string
  prerequisites: string[]
}

export interface RunThrough {
  id: string
  user_id: string
  song_id: string
  score: number
  created_at: string
}

export async function markNodeComplete(supabase: SupabaseClient, nodeId: string): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Not authenticated')
  const { error } = await supabase
    .from('lesson_progress')
    .upsert({ user_id: userData.user.id, node_id: nodeId, state: 'completed' })
  if (error) throw error
}

export async function getCompletedNodeIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from('lesson_progress').select('node_id')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.node_id))
}

/**
 * Pure unlock evaluation (task 2.3): a node is unlocked exactly when every
 * declared prerequisite is completed. Knowledge-only nodes clear through the
 * same lesson_progress mechanism, so no special case is needed here.
 */
export function evaluateUnlocks(
  map: LessonNode[],
  completed: Set<string>,
): Record<string, 'completed' | 'unlocked' | 'locked'> {
  const result: Record<string, 'completed' | 'unlocked' | 'locked'> = {}
  for (const node of map) {
    if (completed.has(node.id)) result[node.id] = 'completed'
    else if (node.prerequisites.every((p) => completed.has(p))) result[node.id] = 'unlocked'
    else result[node.id] = 'locked'
  }
  return result
}

export async function recordRunThrough(
  supabase: SupabaseClient,
  songId: string,
  score: number,
): Promise<RunThrough> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Not authenticated')
  const { data, error } = await supabase
    .from('run_through')
    .insert({ user_id: userData.user.id, song_id: songId, score })
    .select()
    .single()
  if (error) throw error
  return data as RunThrough
}

export async function getHistory(supabase: SupabaseClient, songId: string): Promise<RunThrough[]> {
  const { data, error } = await supabase
    .from('run_through')
    .select('*')
    .eq('song_id', songId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RunThrough[]
}

/** Task 2.5 (F22): the newest attempt's score, or null if none. */
export async function getLastScore(supabase: SupabaseClient, songId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('run_through')
    .select('score')
    .eq('song_id', songId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.score ?? null
}

/** Task 2.6 (F37): per-song tempo preference, validated 50–100 (DB enforces too). */
export async function setTempoPref(
  supabase: SupabaseClient,
  songId: string,
  tempoPct: number,
): Promise<void> {
  if (!Number.isInteger(tempoPct) || tempoPct < 50 || tempoPct > 100) {
    throw new Error(`Tempo must be an integer between 50 and 100, got ${tempoPct}`)
  }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Not authenticated')
  const { error } = await supabase
    .from('song_pref')
    .upsert({ user_id: userData.user.id, song_id: songId, tempo_pct: tempoPct })
  if (error) throw error
}

// ── Guitar Learn progress (migration 0013) ─────────────────────────────

/** What the guitar Learn tab's activities record, as the app keeps it. */
export interface GuitarProgress {
  /** Chord lessons cleared in Practice: chord id → 'passed' | 'skipped'. */
  cleared: Record<string, 'passed' | 'skipped'>
  /** One-minute changes: best count per chord pair ("C-Em"). */
  changesBest: Record<string, number>
  /** Strum-on-the-beat steps passed: step id → true. */
  strumPassed: Record<string, boolean>
}

export const emptyGuitarProgress = (): GuitarProgress => ({ cleared: {}, changesBest: {}, strumPassed: {} })

/**
 * Two records of the same player's progress as one (pure): every chord
 * cleared in either, a pass beating a skip; the higher best for each pair;
 * every step passed in either.
 */
export function mergeGuitarProgress(a: GuitarProgress, b: GuitarProgress): GuitarProgress {
  const cleared: GuitarProgress['cleared'] = { ...a.cleared }
  for (const [id, outcome] of Object.entries(b.cleared)) {
    if (cleared[id] !== 'passed') cleared[id] = outcome
  }
  const changesBest: GuitarProgress['changesBest'] = { ...a.changesBest }
  for (const [pair, count] of Object.entries(b.changesBest)) changesBest[pair] = Math.max(changesBest[pair] ?? 0, count)
  return { cleared, changesBest, strumPassed: { ...a.strumPassed, ...b.strumPassed } }
}

/** The signed-in player's saved guitar progress (empty if they have none yet). */
export async function getGuitarProgress(supabase: SupabaseClient): Promise<GuitarProgress> {
  const { data, error } = await supabase.from('guitar_progress').select('cleared, changes_best, strum_passed').maybeSingle()
  if (error) throw error
  if (!data) return emptyGuitarProgress()
  return { cleared: data.cleared ?? {}, changesBest: data.changes_best ?? {}, strumPassed: data.strum_passed ?? {} }
}

/** Save the signed-in player's guitar progress (replaces what was saved). */
export async function saveGuitarProgress(supabase: SupabaseClient, progress: GuitarProgress): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Not authenticated')
  const { error } = await supabase.from('guitar_progress').upsert({
    user_id: userData.user.id,
    cleared: progress.cleared,
    changes_best: progress.changesBest,
    strum_passed: progress.strumPassed,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function getTempoPref(supabase: SupabaseClient, songId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('song_pref')
    .select('tempo_pct')
    .eq('song_id', songId)
    .maybeSingle()
  if (error) throw error
  return data?.tempo_pct ?? null
}
