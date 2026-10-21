import { progressSaved } from '../learn/progressEvents.js'

/**
 * Strum on the beat's progress in this browser: the steps passed, { [step
 * id]: true }. Copied to the player's account when they're signed in
 * (learn/useLearnProgressSync.js).
 */

export const PASSED_KEY = 'harmonic.guitar.strumPassed'

export function loadPassed() {
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(PASSED_KEY) ?? '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

export function savePassed(passedSteps) {
  try {
    globalThis.localStorage.setItem(PASSED_KEY, JSON.stringify(passedSteps))
  } catch {
    // Private window or blocked storage: progress lasts until reload.
  }
  progressSaved()
}
