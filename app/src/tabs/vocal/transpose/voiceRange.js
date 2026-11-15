/**
 * The singer's range, for fitting a song's key to it (keyFit.js): from the
 * voice part they chose, or from their own lowest and highest notes when
 * they've sung them for us. Both live in this browser, like the other
 * vocal preferences: the voice part under the warm-up's own key (so
 * choosing it in one place chooses it everywhere), the measured range
 * under its own. Pure apart from the storage helpers; unit-tested in
 * app/tests/voiceRange.test.js.
 */
import { VOICE_PARTS, voicePart } from '../warmup/warmupLogic.js'

export const VOICE_KEY = 'harmonic.voicePart' // shared with the warm-up and the tests
export const RANGE_KEY = 'harmonic.voiceRange'

/**
 * Comfortable ranges for singing a whole song, not the edges a warm-up
 * reaches for (warmupLogic's VOICE_PARTS are those stretched further) —
 * the same ones the arranger writes SATB parts in, with the baritone between.
 */
export const COMFORTABLE_RANGES = Object.freeze({
  soprano: { low: 60, high: 79 }, // C4–G5
  alto: { low: 55, high: 74 }, // G3–D5
  tenor: { low: 48, high: 67 }, // C3–G4
  baritone: { low: 45, high: 64 }, // A2–E4
  bass: { low: 40, high: 60 }, // E2–C4
})

export const VOICE_OPTIONS = VOICE_PARTS.map(({ id, name }) => ({ id, name }))

// Your lowest and highest notes are where you can reach, not where a song
// should sit: the comfortable range is this far inside them.
const COMFORT_INSET = 2
// Fewer notes than this between lowest and highest is a capture gone wrong.
export const MIN_MEASURED_SPAN = 7

/** The range to fit songs to, or null without a part or a measurement. `measured`: { low, high } as sung. */
export function effectiveRange({ partId = null, measured = null, useMeasured = true } = {}) {
  if (measured && useMeasured && measured.high - measured.low >= MIN_MEASURED_SPAN) {
    // Never narrower than an octave and a bit: keep the middle when the inset would squeeze it.
    let low = measured.low + COMFORT_INSET
    let high = measured.high - COMFORT_INSET
    if (high - low < 9) {
      const mid = (measured.low + measured.high) / 2
      low = Math.round(mid - 4.5)
      high = low + 9
    }
    return { low, high, source: 'measured' }
  }
  const range = COMFORTABLE_RANGES[partId]
  return range ? { ...range, source: 'part', partId } : null
}

/**
 * Lowest and highest held notes out of a capture: the singer slides from
 * their lowest comfortable note to their highest, holding each end, and
 * createNoteCatcher (warmup/pitchTestLogic.js) reports every note held long
 * enough. One stray note an octave off (the pitch tracker on a crack or a
 * breath) is dropped when it sits far from all the others.
 */
export function rangeFromCaught(caught) {
  const notes = caught.map((n) => Math.round(n)).filter(Number.isFinite).sort((a, b) => a - b)
  if (!notes.length) return null
  const isolated = (i) => {
    const gapBelow = i > 0 ? notes[i] - notes[i - 1] : Infinity
    const gapAbove = i < notes.length - 1 ? notes[i + 1] - notes[i] : Infinity
    return Math.min(gapBelow, gapAbove) >= 7
  }
  const kept = notes.length > 2 ? notes.filter((_, i) => !isolated(i)) : notes
  const used = kept.length ? kept : notes
  return { low: used[0], high: used.at(-1) }
}

function storage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadVoicePartId() {
  try {
    return voicePart(storage()?.getItem(VOICE_KEY))?.id ?? null
  } catch {
    return null
  }
}

export function saveVoicePartId(id) {
  try {
    storage()?.setItem(VOICE_KEY, id)
  } catch {
    // Private window or blocked storage: asked again next time.
  }
}

/** { low, high, use } or null. `use`: fit songs to it rather than to the voice part. */
export function loadMeasuredRange() {
  try {
    const saved = JSON.parse(storage()?.getItem(RANGE_KEY) ?? 'null')
    if (!saved || !Number.isFinite(saved.low) || !Number.isFinite(saved.high) || saved.high <= saved.low) return null
    return { low: saved.low, high: saved.high, use: saved.use !== false }
  } catch {
    return null
  }
}

export function saveMeasuredRange(range) {
  try {
    if (range) storage()?.setItem(RANGE_KEY, JSON.stringify({ low: range.low, high: range.high, use: range.use !== false }))
    else storage()?.removeItem(RANGE_KEY)
  } catch {
    // As above: measured again next time.
  }
}
