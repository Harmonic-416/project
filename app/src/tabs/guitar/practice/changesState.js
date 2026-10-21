import { progressSaved } from '../learn/progressEvents.js'
import { CHORDS } from './chords.js'

/**
 * One-minute changes (F38, JustinGuitar's drill): two chords, a minute,
 * count every change. Pure, unit-tested in app/tests/changes.test.js; the
 * component (ChangesRun.jsx) owns the timers and the mic. The player taps
 * each change; the mic counts the changes it hears too, side by side, until
 * it has earned trust. The tap count is the score.
 *
 *   status: 'idle' → 'countdown' → 'running' → 'done'
 */

export const RUN_SECONDS = 60
export const COUNTDOWN_FROM = 3
/** JustinGuitar's targets: 30 changes a minute first, 60 the goal. */
export const FIRST_TARGET = 30
export const GOAL = 60

export function initialChanges() {
  return { status: 'idle', count: COUNTDOWN_FROM, left: RUN_SECONDS, tapped: 0, heard: 0 }
}

export function changesReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { ...initialChanges(), status: 'countdown' }

    case 'tick': // one second of the countdown, or of the run
      if (state.status === 'countdown') {
        return state.count > 1 ? { ...state, count: state.count - 1 } : { ...state, status: 'running', count: 0 }
      }
      if (state.status === 'running') {
        return state.left > 1 ? { ...state, left: state.left - 1 } : { ...state, status: 'done', left: 0 }
      }
      return state

    case 'tap':
      return state.status === 'running' ? { ...state, tapped: state.tapped + 1 } : state

    case 'heard': // the mic's running count
      return state.status === 'running' ? { ...state, heard: action.count } : state

    case 'reset':
      return initialChanges()

    default:
      return state
  }
}

/** The pair a run is for, by default: the newest chord the player has opened and the one before it. */
export function defaultPair(unlocked) {
  const last = Math.max(1, Math.min(unlocked, CHORDS.length) - 1)
  return [CHORDS[last - 1].id, CHORDS[last].id]
}

/** Best scores are kept per pair, either way round: "C-Em" for Em ↔ C. */
export const pairKey = (a, b) => [a, b].sort().join('-')

export const BEST_KEY = 'harmonic.guitar.changesBest'

export function loadBests() {
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(BEST_KEY) ?? '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

/** Save `count` for the pair if it beats the best; returns the bests after. */
export function recordBest(bests, a, b, count) {
  const key = pairKey(a, b)
  if (count <= (bests[key] ?? 0)) return bests
  const updated = { ...bests, [key]: count }
  try {
    globalThis.localStorage.setItem(BEST_KEY, JSON.stringify(updated))
  } catch {
    // Private window or blocked storage: the best lasts until reload.
  }
  progressSaved()
  return updated
}
