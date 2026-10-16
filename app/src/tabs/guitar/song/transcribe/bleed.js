import { decibels, hz, power } from './ghostNotes.js'

/**
 * Other instruments bleeding into the separated guitar. The separator
 * (separate.js) is far from perfect on guitar — keys and synths leak into
 * its guitar stem — and Basic Pitch hears the leak as notes. A real guitar
 * note is mostly in the stem: at its pitch, the stem holds a good share of
 * what the whole song has. A leaked one is mostly elsewhere: the song is
 * much louder at that pitch than the stem.
 *
 * Unit-tested in app/tests/bleed.test.js.
 */

const BLEED_DB = -12 // the stem this much quieter than the song at a note's pitch: the note is someone else's

/**
 * `notes` (Basic Pitch's) without those that are mostly another
 * instrument: `stem` is the separated guitar and `song` the whole
 * recording, both mono at `sampleRate`.
 */
export function dropBleed(notes, stem, song, { sampleRate = 22050 } = {}) {
  return notes.filter((note) => {
    const from = note.startTimeSeconds + 0.02
    const to = from + Math.min(0.15, Math.max(0.05, note.durationSeconds))
    const f = hz(note.pitchMidi)
    return decibels(power(stem, sampleRate, f, from, to), power(song, sampleRate, f, from, to)) >= BLEED_DB
  })
}
