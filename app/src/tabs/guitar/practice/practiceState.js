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
 * always available (F30).
 */

export const MAX_MISSES = 3

const IDLE_STRINGS = ['idle', 'idle', 'idle', 'idle', 'idle', 'idle']

export function initialPractice(chordIndex = 0) {
  return { chordIndex, verdict: 'listening', strings: IDLE_STRINGS, misses: 0, notice: null }
}

function moveTo(chordIndex, notice) {
  return { ...initialPractice(chordIndex % CHORDS.length), notice }
}

export function practiceReducer(state, action) {
  switch (action.type) {
    case 'select':
      return initialPractice(action.index)

    case 'result': {
      const strings = action.strings ?? IDLE_STRINGS
      if (action.verdict === 'wrong') {
        const misses = state.misses + 1
        if (misses >= MAX_MISSES) {
          return moveTo(state.chordIndex + 1, `Skipped ${CHORDS[state.chordIndex].name} after ${MAX_MISSES} tries.`)
        }
        return { ...state, verdict: 'wrong', strings, misses, notice: null }
      }
      return { ...state, verdict: action.verdict, strings, notice: null }
    }

    case 'retry':
      return initialPractice(state.chordIndex)

    case 'skip':
      return moveTo(state.chordIndex + 1, `Skipped ${CHORDS[state.chordIndex].name}.`)

    case 'next':
      return moveTo(state.chordIndex + 1, null)

    default:
      return state
  }
}