import { useCallback, useEffect, useState } from 'react'

/**
 * Scored practice runs per song, part, accompaniment and mode, so the Vocal
 * tab can chart how each try went. They are kept:
 *  - in localStorage, on this device, signed in or not (it survives closing
 *    the tab);
 *  - and, for a signed-in user, on the account (`remote`: migration 0015,
 *    src/lib/practiceRuns.ts), which is what the chart shows once loaded, so
 *    the tries follow them to other devices.
 * Storage can be missing or full (private windows, previews), so every
 * access is guarded and the runs still work in memory.
 *
 *   run: { score: 0–100, at: epoch ms, notes: { total, right, half, missed } or absent }
 *   remote: { load(): Promise<run[]> (oldest first), save(run): Promise } or null
 */

const PREFIX = 'harmonic.practiceRuns.'
/** Older runs are dropped beyond this many. */
export const MAX_RUNS = 50

export function runsKey({ songKey, partId, accompaniment, mode }) {
  return `${PREFIX}${songKey ?? 'unknown'}:${partId ?? 'first'}:${accompaniment}:${mode}`
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null
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

/** Saves `runs` (the latest MAX_RUNS) when storage allows; returns what was kept. */
export function storeRuns(key, runs, storage = defaultStorage()) {
  const kept = runs.slice(-MAX_RUNS)
  try {
    storage?.setItem(key, JSON.stringify(kept))
  } catch {
    // Full or blocked: the runs stay in memory for this view.
  }
  return kept
}

/** Appends a run; returns the new list (saved when storage allows). */
export function appendRun(key, runs, run, storage = defaultStorage()) {
  return storeRuns(key, [...runs, run], storage)
}

/** The account's runs (practiceRuns.ts rows) as chart runs. */
export const fromRemote = (rows) =>
  rows.map((r) => ({
    score: Number(r.score),
    at: Date.parse(r.created_at),
    ...(r.notes_total === null || r.notes_total === undefined
      ? {}
      : { notes: { total: r.notes_total, right: r.notes_right, half: r.notes_half, missed: r.notes_missed } }),
  }))

/**
 * [runs, addRun(score, notes)] for one practice setting; follows `key` when it
 * changes. With `remote`, the account's runs replace the device's once
 * loaded (and are kept on the device too), and every new run is saved to
 * the account as well.
 */
export function useSessionRuns(key, remote = null) {
  const [state, setState] = useState(() => ({ key, runs: loadRuns(key) }))
  let current = state
  if (state.key !== key) {
    current = { key, runs: loadRuns(key) }
    setState(current)
  }

  useEffect(() => {
    if (!remote) return undefined
    let live = true
    remote.load().then(
      (runs) => {
        if (!live) return
        setState((s) => (s.key === key ? { key, runs: storeRuns(key, runs) } : s))
      },
      (err) => console.error('Could not load your practice runs', err),
    )
    return () => {
      live = false
    }
  }, [key, remote])

  const addRun = useCallback(
    (score, notes = null) => {
      const run = { score, at: Date.now(), ...(notes ? { notes } : {}) }
      setState((s) => ({ key: s.key, runs: appendRun(s.key, s.runs, run) }))
      remote?.save(run).catch((err) => console.error('Could not save this practice run', err))
    },
    [remote],
  )
  return [current.runs, addRun]
}
