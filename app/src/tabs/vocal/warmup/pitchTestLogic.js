/**
 * Pure helpers behind the two tests on the Warm up screen (no DOM, no audio),
 * unit-tested in tests/pitchTest.test.js.
 *
 * Harmony test: public/pitch-tests/harmony.mid is a run of three-note chords.
 * The piano plays the outer notes; the singer holds the middle one. Each bar
 * is one chord held for three beats and struck again on beat 4, just before
 * it moves a half step. The whole file is transposed so the first middle note
 * suits the chosen voice part.
 *
 * Pitch test: a few random notes within an octave, played once, then sung
 * back in the same order.
 */
import { centsOff, classifyCents } from '../audio/pitchDetector.js'

export const HARMONY_URL = '/pitch-tests/harmony.mid'

/**
 * Where each voice part (the same ones the warm-up offers) sings: the harmony
 * test's first middle note, and the bottom of the pitch test's octave.
 */
export const TEST_NOTES = Object.freeze({
  soprano: { harmony: 67, low: 62 }, // G4; D4–D5
  alto: { harmony: 62, low: 57 }, // D4; A3–A4
  tenor: { harmony: 57, low: 52 }, // A3; E3–E4
  baritone: { harmony: 52, low: 47 }, // E3; B2–B3
  bass: { harmony: 48, low: 43 }, // C3; G2–G3
})

// Right after the chord moves, give the singer this long to get there before judging.
export const SETTLE_SECONDS = 0.3
// How much of the rest of each bar has to be sung in tune to pass it.
export const IN_TUNE_SHARE = 0.5
export const TOLERANCE_CENTS = 50
// Gaps between pitch frames longer than this count as silence.
const MAX_FRAME_GAP = 0.15

/** In tune, or the right note an octave off (men and women singing the same line). */
export function isRightNote(midi, target, toleranceCents = TOLERANCE_CENTS) {
  const verdict = classifyCents(centsOff(midi, target), toleranceCents)
  return verdict === 'in-tune' || verdict === 'octave'
}

/**
 * The harmony test out of a parsed @tonejs/midi Midi:
 * { bpm, beat, length, backing, measures }. `backing` is every note but the
 * middle of each chord ({ midi, time, duration }, seconds). `measures` is one
 * per bar: { start, end, target, cueAt, move }, where `target` is the middle
 * note to sing, `move` the half steps to the next bar's (null on the last) and
 * `cueAt` the start of beat 4, when that move is shown (null on the last).
 */
export function splitHarmony(midi) {
  const ppq = midi.header.ppq
  const [beats = 4, beatType = 4] = midi.header.timeSignatures[0]?.timeSignature ?? []
  const beatTicks = (ppq * 4) / beatType
  const barTicks = beatTicks * beats
  const notes = midi.tracks.flatMap((t) => t.notes)
  if (!notes.length) throw new Error('The harmony test file has no notes.')

  const chords = new Map()
  for (const n of notes) {
    if (!chords.has(n.ticks)) chords.set(n.ticks, [])
    chords.get(n.ticks).push(n)
  }
  const backing = []
  const targets = [] // { ticks, midi }
  for (const [ticks, chord] of [...chords].sort((a, b) => a[0] - b[0])) {
    chord.sort((a, b) => a.midi - b.midi)
    const middle = Math.floor((chord.length - 1) / 2)
    targets.push({ ticks, midi: chord[middle].midi })
    chord.forEach((n, i) => {
      if (i !== middle || chord.length === 1) backing.push({ midi: n.midi, time: n.time, duration: n.duration })
    })
  }

  const endTicks = Math.max(...notes.map((n) => n.ticks + n.durationTicks))
  const bars = Math.ceil(endTicks / barTicks)
  const sec = (ticks) => midi.header.ticksToSeconds(ticks)
  const measures = []
  for (let b = 0; b < bars; b += 1) {
    const first = targets.find((t) => t.ticks >= b * barTicks && t.ticks < (b + 1) * barTicks)
    if (!first) continue
    measures.push({
      start: sec(b * barTicks),
      end: sec(Math.min((b + 1) * barTicks, endTicks)),
      target: first.midi,
      cueAt: sec(b * barTicks + (beats - 1) * beatTicks),
    })
  }
  measures.forEach((m, i) => {
    const next = measures[i + 1]
    m.move = next ? next.target - m.target : null
    if (!next) m.cueAt = null
  })

  return {
    bpm: Math.round(midi.header.tempos[0]?.bpm ?? 120),
    beat: sec(beatTicks),
    length: sec(endTicks),
    backing,
    measures,
  }
}

/** Half steps to move the whole harmony test so its first middle note suits `part`. */
export function harmonyShift(harmony, part) {
  return TEST_NOTES[part.id].harmony - harmony.measures[0].target
}

/**
 * Seconds of `samples` ({ time, midi }, time from the test's start) that are
 * the right note between `from` and `to`. Each frame counts until the next,
 * up to MAX_FRAME_GAP.
 */
function secondsOnNote(samples, target, from, to) {
  let total = 0
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]
    if (s.time < from || s.time >= to) continue
    const next = samples[i + 1]
    const span = Math.min(next ? next.time - s.time : MAX_FRAME_GAP, MAX_FRAME_GAP, to - s.time)
    if (span > 0 && isRightNote(s.midi, target)) total += span
  }
  return total
}

/**
 * Did the singer hold `target` through `measure`? Skips the first
 * SETTLE_SECONDS, then needs IN_TUNE_SHARE of the rest on the right note.
 * Returns { pass, share, sung } with `sung` the middle of what was sung (or null).
 */
export function judgeMeasure(samples, measure, target) {
  const from = measure.start + SETTLE_SECONDS
  const window = measure.end - from
  const share = window > 0 ? secondsOnNote(samples, target, from, measure.end) / window : 0
  const sung = samples.filter((s) => s.time >= from && s.time < measure.end).map((s) => s.midi)
  return { pass: share >= IN_TUNE_SHARE, share, sung: sung.length ? median(sung) : null }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * `length` random notes for the pitch test, all within the octave from the
 * part's low note up, never the same note twice in a row. `random` is
 * Math.random's shape so tests can pin it.
 */
export function randomPhrase(part, length, random = Math.random) {
  const low = TEST_NOTES[part.id].low
  const phrase = []
  while (phrase.length < length) {
    const note = low + Math.floor(random() * 13)
    if (note !== phrase.at(-1)) phrase.push(note)
  }
  return phrase
}

/**
 * Picks sung notes out of a stream of pitch frames: a note counts once the
 * voice has stayed within `spread` half steps of where it started for
 * `minHold` seconds. The next note needs a change of pitch or a break
 * (silence), so the same note sung twice needs a breath between.
 * push({ time, midi }) returns { midi } (the middle of the held pitch) the
 * moment a note counts, otherwise null.
 */
export function createNoteCatcher({ minHold = 0.3, spread = 0.6, maxGap = MAX_FRAME_GAP } = {}) {
  let run = null // { start, anchor, last, pitches, caught }
  return {
    push(sample) {
      if (!run || sample.time - run.last > maxGap || Math.abs(sample.midi - run.anchor) > spread) {
        run = { start: sample.time, anchor: sample.midi, last: sample.time, pitches: [], caught: false }
      }
      run.last = sample.time
      run.pitches.push(sample.midi)
      if (run.caught || sample.time - run.start < minHold) return null
      run.caught = true
      return { midi: median(run.pitches) }
    },
    reset() {
      run = null
    },
  }
}

/** Each sung note next to the one played: [{ target, sung, right }]; `sung` may be shorter. */
export function judgePhrase(sung, targets) {
  return targets.map((target, i) => {
    const note = sung[i] ?? null
    return { target, sung: note, right: note !== null && isRightNote(note, target) }
  })
}
