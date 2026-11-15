/**
 * What the live pitch meter says, as a pure function of the verdict that
 * pitchDetector.classifyCents already gave. Nothing here judges: the
 * tolerance and the verdict come from the detector, so the meter can never
 * disagree with the score at the end. It only turns cents into words a
 * singer can act on mid-phrase ("a bit higher") and a position on the lane.
 */

import { classifyCents } from '../audio/pitchDetector.js'

/** Cents shown above and below the target on the lane; further off pins to the edge. */
export const METER_RANGE_CENTS = 200

/** The detector's in-tune tolerance (classifyCents' default), drawn as the lane's band. */
export const IN_TUNE_CENTS = 50

/** Fold a distance into the nearest octave, for "right note, other octave". */
export function foldOctave(cents) {
  return ((((cents / 100) % 12) + 18) % 12 - 6) * 100
}

/**
 * @param {{ sung: boolean, hasTarget: boolean, cents: number|null, verdict: string }} input
 * @returns {{ state: string, words: string, arrow: string, offset: number }}
 *   state: idle | rest | in-tune | close | wrong | octave (a CSS modifier);
 *   offset: −1 (bottom of the lane, flat) … 1 (top, sharp).
 */
export function readPitch({ sung, hasTarget, cents, verdict }) {
  if (!hasTarget) return { state: 'rest', words: 'Rest — breathe', arrow: '', offset: 0 }
  if (!sung || cents === null) return { state: 'idle', words: 'Sing this note', arrow: '', offset: 0 }
  const shown = verdict === 'octave' ? foldOctave(cents) : cents
  const offset = Math.max(-1, Math.min(1, shown / METER_RANGE_CENTS))
  if (verdict === 'in-tune') return { state: 'in-tune', words: 'On pitch', arrow: '✓', offset }
  if (verdict === 'octave') return { state: 'octave', words: 'Right note, other octave', arrow: '↕', offset }
  const sharp = shown > 0
  if (verdict === 'close') {
    return { state: 'close', words: sharp ? 'A bit lower' : 'A bit higher', arrow: sharp ? '↓' : '↑', offset }
  }
  return { state: 'wrong', words: sharp ? 'Go lower' : 'Go higher', arrow: sharp ? '⇊' : '⇈', offset }
}

/** Middle value of a list of numbers (null when empty). */
export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The mark a note gets on the staff once it has gone by. Whether it was hit
 * is the judge's call (the Trouble spots tracker, the same one that scores
 * the take); `cents` is the median of what was sung during the note, folded
 * to the nearest octave, and only says which way a missed note was off —
 * by classifyCents, so "close" means what it means everywhere else.
 * @returns {{ tier: 'hit'|'close'|'off'|'silent', glyph: string, label: string }}
 */
export function gradeNote({ hit, cents }) {
  if (hit) return { tier: 'hit', glyph: '✓', label: 'on pitch' }
  if (cents === null || cents === undefined) return { tier: 'silent', glyph: '·', label: 'not heard' }
  const up = cents < 0
  const tier = classifyCents(cents) === 'wrong' ? 'off' : 'close'
  return { tier, glyph: up ? '↑' : '↓', label: `${tier === 'off' ? 'off' : 'a little'} ${up ? 'flat' : 'sharp'}` }
}
