import { progressSaved } from '../learn/progressEvents.js'
import { CHORDS } from './chords.js'

/**
 * Which chords the learner may open. Chords unlock in CHORDS order: the
 * first is always open, and each later one opens once the chord before it
 * is cleared in Practice mode — passed, or skipped via "Unlock anyway".
 *
 *   cleared: { [chordId]: 'passed' | 'skipped' }
 *
 * A linear version of evaluateUnlocks (src/lib/progress.ts); saved in this
 * browser, and on the player's account when they're signed in
 * (learn/useLearnProgressSync.js).
 */

export const STORAGE_KEY = 'harmonic.guitar.cleared'
let unsaved = null
const isCleared = (value) => value === 'passed' || value === 'skipped'
export function normalizeCleared(cleared) {
  return Object.fromEntries(CHORDS.filter((chord) => isCleared(cleared?.[chord.id])).map((chord) => [chord.id, cleared[chord.id]]))
}
export function clearClearedMemory() { unsaved = null }

/** Per chord id: 'passed' | 'skipped' | 'unlocked' | 'locked'. */
export function chordStatuses(cleared) {
  const statuses = {}
  CHORDS.forEach((chord, i) => {
    const open = i < unlockedCount(cleared)
    statuses[chord.id] = !open ? 'locked' : isCleared(cleared[chord.id]) ? cleared[chord.id] : 'unlocked'
  })
  return statuses
}

/** How many chords, from the start of CHORDS, are open (unlocked chords are always a prefix). */
export function unlockedCount(cleared) {
  let count = 1
  while (count < CHORDS.length && isCleared(cleared[CHORDS[count - 1].id])) count++
  return count
}

/** Saved progress, or {} when storage is empty, blocked or unreadable. */
export function loadCleared() {
  if (unsaved) return { ...unsaved }
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? '{}')
    return normalizeCleared(saved)
  } catch {
    return {}
  }
}

export function writeCleared(cleared) {
  const clean = normalizeCleared(cleared)
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    unsaved = null
    return true
  } catch {
    unsaved = clean
    return false
  }
}
export function saveCleared(cleared) {
  const persisted = writeCleared(cleared)
  progressSaved()
  return persisted
}
