import { CHORDS } from './chords.js'
import { unlockedCount } from './unlocks.js'

/**
 * Play mode (F14, F32): chords advance at a steady pace regardless of
 * detection. Each chord keeps the best evidence heard during its window; a
 * chord with nothing heard counts as missed. At the end you get a score (F33).
 * Pure reducer, unit-tested in app/tests/playState.test.js. The component
 * (PlayRun.jsx) owns the timers and dispatches 'tick' / 'advance'.
 *
 *   status: 'idle' → 'countdown' → 'running' → 'done'
 *   results[i]: 'verified' | 'wrong' | 'silent' | null  (null = nothing heard)
 */

export const PROGRESSION = ['Em', 'C', 'G', 'D']

/** The newest one to four open shapes, including the player's current lesson. */
export function learnedProgression(cleared = {}) {
  return CHORDS.slice(0, unlockedCount(cleared)).slice(-4).map((chord) => chord.id)
}
export const LOOP_ROUNDS = 4
export const BEATS_PER_BAR = 4
export const LOOP_BPM = 80
export function strummingLoop(cleared = {}) {
  return Array.from({length: LOOP_ROUNDS}, () => learnedProgression(cleared)).flat()
}
export const COUNTDOWN_FROM = 3

export function progressionChords(ids = PROGRESSION) {
  return ids.map((id) => CHORDS.find((chord) => chord.id === id))
}

export function initialPlay(length = PROGRESSION.length) {
  return { status: 'idle', count: COUNTDOWN_FROM, index: 0, results: Array(length).fill(null) }
}

/** On to the next chord, or done after the last. */
const next = (state) =>
  state.index + 1 >= state.results.length ? { ...state, status: 'done' } : { ...state, index: state.index + 1 }

export function playReducer(state, action) {
  switch (action.type) {
    case 'configure':
      return initialPlay(action.length)
    case 'start':
      return { ...initialPlay(state.results.length), status: 'countdown' }

    case 'tick': // one second of the 3-2-1 countdown (F8)
      if (state.status !== 'countdown') return state
      return state.count > 1
        ? { ...state, count: state.count - 1 }
        : { ...state, status: 'running', count: 0 }

    case 'result': {
      // The microphone changes the verdict, never the transport position.
      if (state.status !== 'running') return state
      const rank = { verified: 3, wrong: 2, silent: 1 }
      if (!rank[action.verdict]) return state
      const results = [...state.results]
      if (rank[action.verdict] > (rank[results[state.index]] ?? 0)) results[state.index] = action.verdict
      return { ...state, results }
    }

    case 'advance': // the current chord's time is up
      if (state.status !== 'running') return state
      return next(state)

    case 'reset':
      return initialPlay(state.results.length)

    default:
      return state
  }
}

/** { heard, total } for the summary: only a verified chord counts as heard. */
export function playScore(results) {
  return { heard: results.filter((r) => r === 'verified').length, total: results.length }
}
