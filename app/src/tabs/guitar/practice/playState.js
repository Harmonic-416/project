import { CHORDS } from './chords.js'

/**
 * Play mode (F14, F32): the chords go by on their own. A clean strum of
 * the chord that's up moves on to the next at once; otherwise its
 * SECONDS_PER_CHORD run out and the next comes anyway, the app never
 * waiting for you. Each chord gets whatever was heard while it was up; a
 * chord with nothing heard counts as missed. At the end you get a score (F33).
 * Pure reducer, unit-tested in app/tests/playState.test.js. The component
 * (PlayRun.jsx) owns the timers and dispatches 'tick' / 'advance'.
 *
 *   status: 'idle' → 'countdown' → 'running' → 'done'
 *   results[i]: 'verified' | 'wrong' | 'silent' | null  (null = nothing heard)
 */

export const PROGRESSION = ['Em', 'C', 'G', 'D']
export const SECONDS_PER_CHORD = 5 // the longest a chord stays up; a clean strum moves on sooner
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
    case 'start':
      return { ...initialPlay(state.results.length), status: 'countdown' }

    case 'tick': // one second of the 3-2-1 countdown (F8)
      if (state.status !== 'countdown') return state
      return state.count > 1
        ? { ...state, count: state.count - 1 }
        : { ...state, status: 'running', count: 0 }

    case 'result': {
      // Whatever the app heard for the chord that is up right now; a clean strum moves on.
      if (state.status !== 'running') return state
      const results = [...state.results]
      results[state.index] = action.verdict
      return action.verdict === 'verified' ? next({ ...state, results }) : { ...state, results }
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