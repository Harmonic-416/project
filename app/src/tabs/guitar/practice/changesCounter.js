import { createWaitAttempts } from '../song/follow/waitListening.js'
import { lessonEntry } from './lessonVerdicts.js'

/**
 * The mic's count for one-minute changes (F38). Each strum is judged
 * against both chords with Wait for me's rules (waitListening.js: noise
 * isn't a strum, one strum is judged once, a chord still ringing doesn't
 * count again, every string must sound), and a change counts when a strum of
 * the other chord is heard. Strumming the same chord twice is no change.
 * Pure, unit-tested in app/tests/changes.test.js.
 *
 *   window(w) → { count, heard }   heard: the chord id just verified, or null
 */
export function createChangeCounter(chordA, chordB) {
  const chords = [chordA, chordB]
  const entries = chords.map(lessonEntry)
  const trackers = chords.map(() => createWaitAttempts())
  let last = null // index of the chord heard last
  let count = 0

  return {
    window(w) {
      let heard = null
      trackers.forEach((tracker, i) => {
        for (const action of tracker.consider(w, entries[i]).actions) {
          if (action.result.verdict === 'hit') heard = i
        }
      })
      if (heard !== null) {
        if (last !== null && heard !== last) count += 1
        last = heard
      }
      return { count, heard: heard === null ? null : chords[heard].id }
    },

    get count() {
      return count
    },

    reset() {
      trackers.forEach((tracker) => tracker.reset())
      last = null
      count = 0
    },
  }
}
