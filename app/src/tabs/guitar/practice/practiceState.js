import { CHORDS } from './chords.js'

/**
 * The practice screen's state machine (pure, unit-tested).
 *
 * This is the "socket" the chord-detection code plugs into later: whoever
 * builds detection dispatches { type: 'result', verdict, strings } and the
 * screen updates. Until then the demo buttons dispatch the same actions.
 *
 *   verdict: 'verified'  – the expected chord was heard            (F16)
 *            'wrong'     – something else was heard, counts a miss (F13)
 *            'silent'    – too quiet to tell, NOT a miss           (F21)
 *   strings: six of 'good' | 'bad' | 'idle', low E first          (F17, F34)
 *
 * Three misses on one chord auto-skip to the next (F29); Skip and Retry are
 * always available (F30). Only the first `unlocked` chords can be opened:
 * moving on wraps within them, and Practice mode raises the limit.
 */

export const MAX_MISSES = 3

const IDLE_STRINGS = ['idle', 'idle', 'idle', 'idle', 'idle', 'idle']

export function initialPractice(chordIndex = 0, unlocked = CHORDS.length) {
  return { chordIndex, unlocked, verdict: 'listening', strings: IDLE_STRINGS, misses: 0, notice: null }
}

function moveTo(state, chordIndex, notice) {
  return { ...initialPractice(chordIndex % state.unlocked, state.unlocked), notice }
}

export function practiceReducer(state, action) {
  switch (action.type) {
    case 'select':
      if (action.index >= state.unlocked) return state
      return initialPractice(action.index, state.unlocked)

    case 'unlocked': {
      // Practice mode passed a chord, or the demo reset progress.
      const unlocked = Math.max(1, Math.min(action.count, CHORDS.length))
      return state.chordIndex < unlocked ? { ...state, unlocked } : initialPractice(0, unlocked)
    }

    case 'result': {
      const strings = action.strings ?? IDLE_STRINGS
      if (action.verdict === 'wrong') {
        const misses = state.misses + 1
        if (misses >= MAX_MISSES) {
          return moveTo(state, state.chordIndex + 1, `Skipped ${CHORDS[state.chordIndex].name} after ${MAX_MISSES} tries.`)
        }
        return { ...state, verdict: 'wrong', strings, misses, notice: null }
      }
      return { ...state, verdict: action.verdict, strings, notice: null }
    }

    case 'retry':
      return initialPractice(state.chordIndex, state.unlocked)

    case 'skip':
      return moveTo(state, state.chordIndex + 1, `Skipped ${CHORDS[state.chordIndex].name}.`)

    case 'next':
      return moveTo(state, state.chordIndex + 1, null)

    default:
      return state
  }
}