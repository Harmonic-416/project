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

export async function getTempoPref(supabase: SupabaseClient, songId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('song_pref')
    .select('tempo_pct')
    .eq('song_id', songId)
    .maybeSingle()
  if (error) throw error
  return data?.tempo_pct ?? null
}
