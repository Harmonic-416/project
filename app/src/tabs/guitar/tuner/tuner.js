import { midiToNoteName } from '../../vocal/audio/pitchDetector.js'

/**
 * Pure tuner logic (F39): string targets, nearest-string choice and a
 * stabilizer that turns noisy per-frame pitches into a steady reading with
 * an in-tune state. No audio here — useTuner feeds it.
 */

const midiToFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12)

/** Standard tuning, low (6th string) to high (1st string). */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64].map((midi, index) => ({
  id: midiToNoteName(midi), // E2 A2 D3 G3 B3 E4
  label: midiToNoteName(midi).replace(/\d/, ''),
  stringNumber: 6 - index,
  midi,
  frequency: midiToFrequency(midi),
}))

/** Search range for auto-detection: a string is only chosen within ±6 semitones. */
export const MAX_DETECT_CENTS = 600

export function centsFrom(frequency, targetFrequency) {
  return 1200 * Math.log2(frequency / targetFrequency)
}

/**
 * The string to measure `frequency` against: the locked one if any,
 * otherwise the nearest target within MAX_DETECT_CENTS (null if none).
 */
export function nearestString(frequency, { lockedId = null, tuning = STANDARD_TUNING } = {}) {
  if (lockedId) {
    const string = tuning.find((s) => s.id === lockedId)
    return string ? { string, cents: centsFrom(frequency, string.frequency) } : null
  }
  let best = null
  for (const string of tuning) {
    const cents = centsFrom(frequency, string.frequency)
    if (Math.abs(cents) <= MAX_DETECT_CENTS && (!best || Math.abs(cents) < Math.abs(best.cents))) {
      best = { string, cents }
    }
  }
  return best
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Smooths frame-by-frame pitches into a reading.
 *
 *   push(frequency | null, timeMs) → { string, cents, frequency, inTune } | null
 *
 * - Median of the last `window` pitches, so one stray or harmonic frame
 *   can't move the needle or switch strings.
 * - A null (too quiet / unclear) frame holds the last reading for
 *   `quietHoldMs`, then clears history and returns null ("play a string").
 * - In tune once |cents| ≤ `inTuneCents` for `holdMs`; stays in tune until
 *   |cents| > `releaseCents` (hysteresis), or the string changes.
 */
export function createStabilizer({
  window = 5,
  inTuneCents = 5,
  releaseCents = 8,
  holdMs = 500,
  quietHoldMs = 250,
  tuning = STANDARD_TUNING,
} = {}) {
  let history = []
  let lastHeardAt = -Infinity
  let last = null
  let withinSince = null
  let inTune = false
  let lockedId = null

  const resetTuneState = () => {
    withinSince = null
    inTune = false
  }

  return {
    setLocked(id) {
      lockedId = id
      history = []
      last = null
      resetTuneState()
    },
    reset() {
      history = []
      last = null
      lastHeardAt = -Infinity
      resetTuneState()
    },
    push(frequency, timeMs) {
      if (frequency == null) {
        if (timeMs - lastHeardAt <= quietHoldMs) return last
        history = []
        last = null
        resetTuneState()
        return null
      }
      lastHeardAt = timeMs
      history.push(frequency)
      if (history.length > window) history.shift()

      const smoothed = median(history)
      const match = nearestString(smoothed, { lockedId, tuning })
      if (!match) {
        last = null
        resetTuneState()
        return null
      }
      if (last && last.string.id !== match.string.id) resetTuneState()

      const abs = Math.abs(match.cents)
      if (inTune) {
        if (abs > releaseCents) resetTuneState()
      } else if (abs <= inTuneCents) {
        if (withinSince === null) withinSince = timeMs
        if (timeMs - withinSince >= holdMs) inTune = true
      } else {
        withinSince = null
      }

      last = { string: match.string, cents: match.cents, frequency: smoothed, inTune }
      return last
    },
  }
}
