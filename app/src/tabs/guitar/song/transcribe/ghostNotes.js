/**
 * Basic Pitch's notes, cleaned of two things a guitar fools it into
 * hearing, judged against the recording itself:
 *
 *   - a string still ringing when another string is picked gets a fresh
 *     start. A real re-pick makes the note's own frequency louder (7 dB or
 *     more in the benchmark); a string that just rings on doesn't (under
 *     5 dB). Fresh starts that don't get louder are joined back onto the
 *     note they continue.
 *   - a pick's overtones (an octave, an octave and a fifth, two octaves up)
 *     heard as notes of their own. Against an octave that's really played
 *     with it, an overtone dies much sooner than its note (under 0.6 of its
 *     length) and isn't louder than it.
 *
 * Thresholds from tests/transcribeBenchmark.test.js (synthetic guitar).
 * Unit-tested in app/tests/ghostNotes.test.js.
 */

const RISE_DB = 5 // a re-pick gets at least this much louder
const OVERTONES = [12, 19, 24] // semitones above the note that made them
const TOGETHER = 0.05 // seconds: notes starting this close were picked together (a strum spreads ~40 ms)
const SHORTER = 0.6 // an overtone lasts under this share of its note
const OVERTONE_DB = 3 // … and is no more than this much louder

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

/** Power at `frequency` (Hz) in `samples` between `from` and `to` seconds (Hann-windowed Goertzel), per sample. */
export function power(samples, sampleRate, frequency, from, to) {
  const start = Math.max(0, Math.round(from * sampleRate))
  const n = Math.min(samples.length, Math.round(to * sampleRate)) - start
  if (n < 16) return 0
  const c = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < n; i += 1) {
    const s = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))) + c * s1 - s2
    s2 = s1
    s1 = s
  }
  return (s1 * s1 + s2 * s2 - c * s1 * s2) / (n * n)
}

export const decibels = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20))

/**
 * `notes` ({ startTimeSeconds, durationSeconds, pitchMidi, amplitude, … })
 * without the ringing restarts and overtones; `samples` is the recording
 * (mono, at `sampleRate`). Returns new note objects, sorted by start.
 */
export function dropGhostNotes(notes, samples, { sampleRate = 22050 } = {}) {
  const end = (n) => n.startTimeSeconds + n.durationSeconds
  const loudness = (n, from, to) => power(samples, sampleRate, hz(n.pitchMidi), from, to)

  // Ringing restarts, joined back on (in time order, so a chain joins up).
  const kept = []
  for (const note of [...notes].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds).map((n) => ({ ...n }))) {
    const t = note.startTimeSeconds
    const before = kept.findLast((n) => n.pitchMidi === note.pitchMidi && n.startTimeSeconds < t - 0.02 && Math.abs(end(n) - t) < 0.04)
    if (before && decibels(loudness(note, t + 0.015, t + 0.1), loudness(note, t - 0.1, t - 0.015)) < RISE_DB) {
      before.durationSeconds = Math.max(end(before), end(note)) - before.startTimeSeconds
      continue
    }
    kept.push(note)
  }

  // Overtones of a note picked with them.
  return kept.filter((note) => {
    const t = note.startTimeSeconds
    const source = kept.find(
      (n) => OVERTONES.includes(note.pitchMidi - n.pitchMidi) && Math.abs(n.startTimeSeconds - t) <= TOGETHER,
    )
    if (!source) return true
    const shorter = note.durationSeconds < SHORTER * source.durationSeconds
    const notLouder = decibels(loudness(note, t + 0.03, t + 0.13), loudness(source, t + 0.03, t + 0.13)) < OVERTONE_DB
    return !(shorter && notLouder)
  })
}
