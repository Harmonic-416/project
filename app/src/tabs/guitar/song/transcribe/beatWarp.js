import { Midi } from '@tonejs/midi'

/**
 * Notes heard in a recording, put on the song's own beat. Basic Pitch hears
 * notes in seconds and knows nothing of beats, so notation made straight
 * from it assumes a steady 120 BPM and its bars land anywhere. Here every
 * note's start and end are measured in beats along the beats Beat This!
 * found (beats.js) — linearly between two beats, at the median beat length
 * before the first and after the last — so a song that drifts in tempo
 * still lands on the grid. Bar 1 starts at the first downbeat; if notes come
 * before it, whole bars are added in front (a pickup).
 *
 * The drafts place notes with beatClock and barOrigin (pipeline.js);
 * notesToMidi makes a MIDI file at the song's median tempo instead. Pure,
 * unit-tested in app/tests/beatWarp.test.js.
 *
 *   note: { startTimeSeconds, durationSeconds, pitchMidi, amplitude } (Basic Pitch's)
 */

export const GUITAR_LOW = 38 // D2, a drop-D low string
export const GUITAR_HIGH = 88 // E6, the 24th fret of the high E
export const MAX_AT_ONCE = 6 // strings
const GRID = 4 // sixteenths per beat, the converter's grid

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Seconds → beats along `beats` (ascending seconds): { toBeats(seconds),
 * period } with `period` the median beat length. With fewer than two beats,
 * a steady 120 BPM from 0.
 */
export function beatClock(beats) {
  if (beats.length < 2) return { toBeats: (s) => s / 0.5, period: 0.5 }
  const gaps = beats.slice(1).map((b, i) => b - beats[i])
  const period = median(gaps)
  const last = beats.length - 1
  const toBeats = (seconds) => {
    if (seconds <= beats[0]) return (seconds - beats[0]) / period
    if (seconds >= beats[last]) return last + (seconds - beats[last]) / period
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (beats[mid] <= seconds) lo = mid
      else hi = mid
    }
    return lo + (seconds - beats[lo]) / (beats[lo + 1] - beats[lo])
  }
  return { toBeats, period }
}

/** A pitch moved by whole octaves onto the guitar (a bass guitar's E1 becomes E2). */
export function foldToGuitar(midi) {
  let p = midi
  while (p < GUITAR_LOW) p += 12
  while (p > GUITAR_HIGH) p -= 12
  return p
}

/**
 * Fitted to the guitar: notes outside its range moved by octaves onto it
 * (a full mix's bass line is mostly below the low E), and no more than six
 * starting on the same sixteenth (the quietest go) — a guitar has six
 * strings. `toBeats` places the notes (beatClock).
 */
export function cleanNotes(notes, toBeats) {
  const inRange = notes.map((n) => (n.pitchMidi >= GUITAR_LOW && n.pitchMidi <= GUITAR_HIGH ? n : { ...n, pitchMidi: foldToGuitar(n.pitchMidi) }))
  const byOnset = new Map()
  for (const note of inRange) {
    const slot = Math.round(toBeats(note.startTimeSeconds) * GRID)
    if (!byOnset.has(slot)) byOnset.set(slot, [])
    byOnset.get(slot).push(note)
  }
  const kept = new Set()
  for (const group of byOnset.values()) {
    group
      .sort((a, b) => b.amplitude - a.amplitude)
      .slice(0, MAX_AT_ONCE)
      .forEach((n) => kept.add(n))
  }
  return inRange.filter((n) => kept.has(n))
}

/**
 * Where bar 1 starts, as a beat along the song's beats: the first downbeat,
 * or whole bars before it if anything starts earlier (a pickup).
 * `earliest` is the earliest start, in beats; a hair early counts as on
 * the beat.
 */
export function barOrigin(earliest, { beatsPerBar = 4, firstDownbeat = 0 } = {}) {
  const pickupBars = Math.max(0, Math.ceil((firstDownbeat - Math.min(firstDownbeat, earliest) - 0.5 / GRID) / beatsPerBar))
  return firstDownbeat - pickupBars * beatsPerBar
}

/**
 * The notes as a one-track MIDI file on the beat grid: { midi, bpm,
 * beatsPerBar, origin }. `bars` is beats.js's result ({ beats, beatsPerBar,
 * firstDownbeat }); `origin` is the beat (index along `beats`, fractional
 * before the first) where bar 1 starts.
 */
export function notesToMidi(notes, { beats, beatsPerBar = 4, firstDownbeat = 0 }, { name = 'Guitar' } = {}) {
  const { toBeats, period } = beatClock(beats)
  const placed = cleanNotes(notes, toBeats).map((n) => ({
    pitch: n.pitchMidi,
    start: toBeats(n.startTimeSeconds),
    end: toBeats(n.startTimeSeconds + n.durationSeconds),
    velocity: Math.max(0.05, Math.min(1, n.amplitude ?? 0.8)),
  }))
  const origin = barOrigin(Math.min(firstDownbeat, ...placed.map((n) => n.start)), { beatsPerBar, firstDownbeat })

  const bpm = 60 / period
  const midi = new Midi()
  midi.header.setTempo(bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [beatsPerBar, 4], measures: 0 })
  midi.header.update()
  const track = midi.addTrack()
  track.name = name
  const ppq = midi.header.ppq
  for (const n of placed.sort((a, b) => a.start - b.start || a.pitch - b.pitch)) {
    const ticks = Math.max(0, Math.round((n.start - origin) * ppq))
    const durationTicks = Math.max(1, Math.round((n.end - origin) * ppq) - ticks)
    track.addNote({ midi: n.pitch, ticks, durationTicks, velocity: n.velocity })
  }
  return { midi, bpm, beatsPerBar, origin }
}
