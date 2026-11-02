/**
 * Pure helpers behind the Warm up screen (no DOM, no audio), unit-tested in
 * tests/warmup.test.js. public/warmup/warmup.mid holds two exercises: bars
 * 1–2 are the upper-range warm-up, bars 3–4 the lower-range one. Each is
 * played over and over, a half step higher (upper) or lower (lower) every
 * time, from a start that suits the voice part until it would leave the
 * part's range.
 */
import { midiNoteToPitch } from '../midi/pitch.js'

export const WARMUP_URL = '/warmup/warmup.mid'

// The last notes of each pattern aren't sung: they're the piano moving a half
// step and sounding the next starting note.
export const CUE_NOTES = 2

/**
 * Typical choral ranges stretched five half steps each way, since a warm-up
 * goes out to the singer's limit. `upperStart` is the pattern's lowest note
 * on the first upper-range time through, `lowerStart` its highest on the
 * first lower-range one; `low` and `high` are notes the pattern never goes past.
 */
export const VOICE_PARTS = Object.freeze([
  { id: 'soprano', name: 'Soprano', low: 52, high: 86, upperStart: 60, lowerStart: 74 }, // E3–D6
  { id: 'alto', name: 'Alto', low: 48, high: 81, upperStart: 55, lowerStart: 69 }, // C3–A5
  { id: 'tenor', name: 'Tenor', low: 43, high: 74, upperStart: 50, lowerStart: 62 }, // G2–D5
  { id: 'baritone', name: 'Baritone', low: 38, high: 70, upperStart: 45, lowerStart: 59 }, // D2–A#4
  { id: 'bass', name: 'Bass', low: 35, high: 67, upperStart: 43, lowerStart: 55 }, // B1–G4
])

export function voicePart(id) {
  return VOICE_PARTS.find((v) => v.id === id) ?? null
}

/** 'C#4' for 61. */
export function noteName(midi) {
  const { step, alter, octave } = midiNoteToPitch(midi)
  return `${step}${alter ? '#' : ''}${octave}`
}

/**
 * The two exercises out of a parsed @tonejs/midi Midi: { upper, lower }, each
 * { notes: [{ midi, time, duration }] (seconds from the pattern's start),
 * length (seconds), lowest, highest, bpm, cueAt }. A pattern is two bars
 * long; `cueAt` (seconds) is where its last CUE_NOTES notes, the ones not sung, begin.
 */
export function splitWarmup(midi) {
  const ppq = midi.header.ppq
  const [beats = 4, beatType = 4] = midi.header.timeSignatures[0]?.timeSignature ?? []
  const barTicks = (ppq * 4 * beats) / beatType
  const notes = midi.tracks.flatMap((t) => t.notes).sort((a, b) => a.ticks - b.ticks)
  const pattern = (fromBar) => {
    const from = fromBar * barTicks
    const to = from + 2 * barTicks
    const start = midi.header.ticksToSeconds(from)
    const picked = notes
      .filter((n) => n.ticks >= from && n.ticks < to)
      .map((n) => ({ midi: n.midi, time: n.time - start, duration: n.duration }))
    if (!picked.length) throw new Error('The warm-up file is missing its notes.')
    const pitches = picked.map((n) => n.midi)
    return {
      notes: picked,
      length: midi.header.ticksToSeconds(to) - start,
      lowest: Math.min(...pitches),
      highest: Math.max(...pitches),
      bpm: Math.round(midi.header.tempos[0]?.bpm ?? 120),
      cueAt: picked[Math.max(0, picked.length - CUE_NOTES)].time,
    }
  }
  return { upper: pattern(0), lower: pattern(2) }
}

/**
 * Semitone shifts for each time through `pattern`, in order: upward from the
 * part's upper start until the next would pass `high`, or downward from its
 * lower start until the next would pass `low`. Always at least one.
 */
export function warmupShifts(pattern, part, direction) {
  const shifts = []
  if (direction === 'upper') {
    for (let s = part.upperStart - pattern.lowest; pattern.highest + s <= part.high || !shifts.length; s += 1) {
      shifts.push(s)
    }
  } else {
    for (let s = part.lowerStart - pattern.highest; pattern.lowest + s >= part.low || !shifts.length; s -= 1) {
      shifts.push(s)
    }
  }
  return shifts
}
