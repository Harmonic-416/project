import { CHORDS } from './chords.js'

/**
 * Which chords the learner may open. Chords unlock in CHORDS order: the
 * first is always open, and each later one opens once the chord before it
 * is cleared in Practice mode — passed, or skipped via "Unlock anyway".
 *
 *   cleared: { [chordId]: 'passed' | 'skipped' }
 *
 * A linear version of evaluateUnlocks (src/lib/progress.ts); saved in this
 * browser only until guitar progress moves to lesson_progress.
 */

const STORAGE_KEY = 'harmonic.guitar.cleared'

/** Per chord id: 'passed' | 'skipped' | 'unlocked' | 'locked'. */
export function chordStatuses(cleared) {
  const statuses = {}
  CHORDS.forEach((chord, i) => {
    const open = i === 0 || Boolean(cleared[CHORDS[i - 1].id])
    statuses[chord.id] = cleared[chord.id] ?? (open ? 'unlocked' : 'locked')
  })
  return statuses
}

/** How many chords, from the start of CHORDS, are open (unlocked chords are always a prefix). */
export function unlockedCount(cleared) {
  let count = 1
  while (count < CHORDS.length && cleared[CHORDS[count - 1].id]) count++
  return count
}

/** Saved progress, or {} when storage is empty, blocked or unreadable. */
export function loadCleared() {
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

export function saveCleared(cleared) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleared))
  } catch {
    // Private window or blocked storage: progress lasts until reload.
  }
}
