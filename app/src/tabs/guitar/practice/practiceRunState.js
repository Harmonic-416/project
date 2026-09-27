import { COUNTDOWN_FROM } from './playState.js'

/**
 * Practice mode: the checkpoint that unlocks the next chord. Laid out like
 * Play, but only the chord being learned is up: play it cleanly
 * STRUMS_TO_PASS times in a row before PRACTICE_SECONDS run out to pass.
 * A wrong chord resets the streak; too quiet does not (F21). After
 * MAX_FAILED_RUNS timed-out runs the screen offers "Unlock anyway" — the
 * soft gate (F28), so imperfect detection never walls a learner in.
 * Pure reducer, unit-tested in app/tests/practiceRun.test.js. The component
 * (PracticeRun.jsx) owns the timers and dispatches 'tick' / 'timeout';
 * results arrive as { type: 'result', verdict }, as in Learn and Play.
 *
 *   status: 'idle' → 'countdown' → 'running' → 'passed' | 'failed'
 *   verdict: last result heard this run, or null
 */

export const STRUMS_TO_PASS = 3
export const PRACTICE_SECONDS = 10
export const MAX_FAILED_RUNS = 3

export function initialPracticeRun(failedRuns = 0) {
  return { status: 'idle', count: COUNTDOWN_FROM, streak: 0, verdict: null, failedRuns }
}

export function practiceRunReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { ...initialPracticeRun(state.failedRuns), status: 'countdown' }

    case 'tick': // one second of the 3-2-1 countdown (F8)
      if (state.status !== 'countdown') return state
      return state.count > 1
        ? { ...state, count: state.count - 1 }
        : { ...state, status: 'running', count: 0 }

    case 'result': {
      if (state.status !== 'running') return state
      const { verdict } = action
      if (verdict === 'verified') {
        const streak = state.streak + 1
        return { ...state, streak, verdict, status: streak >= STRUMS_TO_PASS ? 'passed' : 'running' }
      }
      if (verdict === 'wrong') return { ...state, streak: 0, verdict }
      return { ...state, verdict } // 'silent': couldn't hear, streak stands
    }

    case 'timeout': // the window ran out before the streak was reached
      if (state.status !== 'running') return state
      return { ...state, status: 'failed', failedRuns: state.failedRuns + 1 }

    case 'reset': // Stop / Back to Learn: same chord, failed runs kept
      return initialPracticeRun(state.failedRuns)

    case 'chord': // a different chord is up: fresh run, fresh soft-gate count
      return initialPracticeRun()

    default:
      return state
  }
}

/** Soft gate (F28): after enough failed runs, let the learner move on anyway. */
export function canUnlockAnyway(state) {
  return state.failedRuns >= MAX_FAILED_RUNS
}
