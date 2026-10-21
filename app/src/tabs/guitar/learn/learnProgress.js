import { PASSED_KEY } from '../exercises/strumProgress.js'
import { BEST_KEY } from '../practice/changesState.js'
import { STORAGE_KEY as CLEARED_KEY } from '../practice/unlocks.js'

/**
 * Everything the Learn tab records, as kept in this browser — the chord
 * lessons cleared, the one-minute changes bests and the strum steps passed
 * — in the shape src/lib/progress.ts keeps on the account (GuitarProgress).
 * Written here without announcing a save (progressEvents.js), so copying
 * the account's progress into the browser doesn't send it straight back.
 */

const KEYS = { cleared: CLEARED_KEY, changesBest: BEST_KEY, strumPassed: PASSED_KEY }

function read(key) {
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(key) ?? '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

export function readLocalProgress() {
  return Object.fromEntries(Object.entries(KEYS).map(([part, key]) => [part, read(key)]))
}

export function writeLocalProgress(progress) {
  try {
    for (const [part, key] of Object.entries(KEYS)) globalThis.localStorage.setItem(key, JSON.stringify(progress[part] ?? {}))
  } catch {
    // Private window or blocked storage: the account still has it.
  }
}

/** Forget it in this browser (signing out), so the next player starts fresh. */
export function clearLocalProgress() {
  try {
    for (const key of Object.values(KEYS)) globalThis.localStorage.removeItem(key)
  } catch {
    // Nothing was kept.
  }
}
