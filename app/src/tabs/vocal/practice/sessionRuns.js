import { useCallback, useState } from 'react'

/**
 * Practice runs scored this session, per song, part, accompaniment and
 * mode, so the Vocal tab can show how each repetition went. Kept in
 * sessionStorage: it survives a reload but not closing the tab, and never
 * leaves the device. Storage can be missing or full (private windows,
 * previews), so every access is guarded and the runs still work in memory.
 *
 *   run: { score: 0–100, at: epoch ms }
 */

const PREFIX = 'harmonic.practiceRuns.'
/** Older runs are dropped beyond this many. */
export const MAX_RUNS = 50

export function runsKey({ songKey, partId, accompaniment, mode }) {
  return `${PREFIX}${songKey ?? 'unknown'}:${partId ?? 'first'}:${accompaniment}:${mode}`
}

function defaultStorage() {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

export function loadRuns(key, storage = defaultStorage()) {
  try {
    const runs = JSON.parse(storage?.getItem(key) ?? '[]')
    return Array.isArray(runs) ? runs.filter((r) => Number.isFinite(r?.score)) : []
  } catch {
    return []
  }
}

/** Appends a run; returns the new list (saved when storage allows). */
export function appendRun(key, runs, run, storage = defaultStorage()) {
  const next = [...runs, run].slice(-MAX_RUNS)
  try {
    storage?.setItem(key, JSON.stringify(next))
  } catch {
    // Full or blocked: the runs stay in memory for this view.
  }
  return next
}

/** [runs, addRun(score)] for one practice setting; follows `key` when it changes. */
export function useSessionRuns(key) {
  const [state, setState] = useState(() => ({ key, runs: loadRuns(key) }))
  let current = state
  if (state.key !== key) {
    current = { key, runs: loadRuns(key) }
    setState(current)
  }
  const addRun = useCallback(
    (score) => setState((s) => ({ key: s.key, runs: appendRun(s.key, s.runs, { score, at: Date.now() }) })),
    [],
  )
  return [current.runs, addRun]
}
