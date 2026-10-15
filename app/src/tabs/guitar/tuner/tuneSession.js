/**
 * "Tune first?" (F39): scored guitar runs prompt for a tune-up if the tuner
 * hasn't been used this session, but never block them. The flags live in
 * sessionStorage — a guitar drifts between sessions, so yesterday's tune-up
 * doesn't count. Pure, unit-tested in app/tests/tuner.test.js.
 */

/** Strings that must reach "in tune" for the guitar to count as tuned. */
export const TUNED_STRINGS_NEEDED = 5

const TUNED_KEY = 'harmonic.guitar.tunedThisSession'
const DISMISSED_KEY = 'harmonic.guitar.tunePromptDismissed'

function read(key) {
  try {
    return globalThis.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function write(key) {
  try {
    globalThis.sessionStorage.setItem(key, '1')
  } catch {
    // Private window or blocked storage: it lasts until reload.
  }
}

export const isTunedThisSession = () => read(TUNED_KEY)
export const markTuned = () => write(TUNED_KEY)
export const isTunePromptDismissed = () => read(DISMISSED_KEY)
export const dismissTunePrompt = () => write(DISMISSED_KEY)

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Drift during play: the cents of single notes heard as right (in tune within
 * ±50¢). If the last `size` of them sit more than `limit`¢ off the same way,
 * the guitar has probably slipped out of tune. push(cents) → the drift in
 * cents (negative = flat), or null while it's fine or not yet known.
 */
export function createTuningWatch({ size = 8, limit = 25 } = {}) {
  let recent = []
  return {
    push(cents) {
      if (!Number.isFinite(cents) || Math.abs(cents) > 50) return this.drift()
      recent.push(cents)
      if (recent.length > size) recent.shift()
      return this.drift()
    },
    drift() {
      if (recent.length < size) return null
      const off = median(recent)
      return Math.abs(off) > limit ? off : null
    },
    reset() {
      recent = []
    },
  }
}
