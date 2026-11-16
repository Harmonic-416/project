import { songTimeAtWall } from './songClock.js'
import { CHORD_CLOSE, CHORD_HIT } from './noteJudge.js'

/**
 * The after-the-run check: Spotify's basic-pitch transcribes the recording
 * into notes (refineWithBasicPitch.js), and each timeline entry the run
 * covered is judged against them — the same windows as the live Trouble
 * spots tracker, but with a polyphonic transcription to look at, so
 * arpeggios and chords are judged note by note and bends can be heard.
 * Pure, unit-tested in Node.
 */

// basic-pitch's pitch-bend contour has 3 bins per semitone.
const BEND_BINS_PER_SEMITONE = 3
const HEARD_BEND_SEMITONES = 0.5 // a bend that rose at least this far counts as bent

/**
 * basic-pitch notes ({ startTimeSeconds, durationSeconds, pitchMidi,
 * amplitude, pitchBends }) → song-time notes ({ time, duration, midi,
 * bendSemitones }), using the run's clock anchors ([{ wall, seconds }]),
 * the page time the recording started and the calibrated latency.
 */
export function toSongNotes(notes, { anchors, recordingStartWall, latencyMs = 0, speed = 1 }) {
  return notes
    .map((note) => {
      const wall = recordingStartWall + note.startTimeSeconds * 1000 - latencyMs
      const time = songTimeAtWall(anchors, wall, speed)
      const bends = note.pitchBends ?? []
      const bendSemitones = bends.length ? Math.max(...bends) / BEND_BINS_PER_SEMITONE : 0
      return { time, duration: note.durationSeconds * speed, midi: note.pitchMidi, bendSemitones }
    })
    .filter((note) => note.time !== null && note.time >= -0.5)
}

/**
 * Verdict per entry index for the entries whose start lies in
 * [`from`, `to`] (the stretch the run covered): an array with undefined for
 * entries outside it.
 */
export function matchTranscription(entries, songNotes, { from = 0, to = Infinity, graceSeconds = 0.2, minWindow = 0.15, maxWindow = 0.5 } = {}) {
  const verdicts = new Array(entries.length)
  const candidates = []
  const targets = []
  for (const entry of entries) {
    if (entry.time < from - 1e-6 || entry.time > to + 1e-6) continue
    if (entry.technique === 'dead' || entry.technique === 'harmonic' || entry.optional) {
      verdicts[entry.index] = 'skipped'
      continue
    }
    const start = entry.time - graceSeconds
    const end = entry.time + Math.min(Math.max(entry.duration, minWindow), maxWindow) + graceSeconds
    const slots = [...new Set(entry.notes.map((note) => note.midi))].map((midi) => ({ midi, grade: 0 }))
    targets.push({ entry, slots })
    for (const [noteIndex, note] of songNotes.entries()) {
      if (note.time < start || note.time > end) continue
      for (const slot of slots) {
        const difference = Math.abs(note.midi - slot.midi)
        const exact = difference === 0
        const close = entry.kind === 'single' && (difference === 1 || difference % 12 === 0)
        if (!exact && !close) continue
        const weakBend = entry.technique === 'bend' && !(note.bendSemitones >= HEARD_BEND_SEMITONES)
        const grade = exact && !weakBend ? 2 : 1
        candidates.push({ noteIndex, slot, grade, exact, distance: Math.abs(note.time - entry.time) })
      }
    }
  }

  // A detected onset can fill just one target. Prefer exact pitches and the
  // closest onsets within the existing timing windows. If greedy pairing
  // strands an exact match, try moving an earlier match to another slot.
  const consumed = new Set()
  candidates.sort((a, b) => b.grade - a.grade || Number(b.exact) - Number(a.exact) || a.distance - b.distance)
  const exactOptions = new Map()
  const owners = new Map()
  for (const { noteIndex, slot, grade } of candidates) {
    if (grade !== 2) break
    if (!exactOptions.has(noteIndex)) exactOptions.set(noteIndex, [])
    exactOptions.get(noteIndex).push(slot)
    if (!owners.has(slot) && !consumed.has(noteIndex)) {
      owners.set(slot, noteIndex)
      consumed.add(noteIndex)
    }
  }
  function placeExact(noteIndex, visited) {
    for (const slot of exactOptions.get(noteIndex)) {
      if (visited.has(slot)) continue
      visited.add(slot)
      const owner = owners.get(slot)
      if (owner !== undefined && !placeExact(owner, visited)) continue
      owners.set(slot, noteIndex)
      return true
    }
    return false
  }
  for (const noteIndex of exactOptions.keys()) {
    if (!consumed.has(noteIndex) && placeExact(noteIndex, new Set())) consumed.add(noteIndex)
  }
  for (const slot of owners.keys()) slot.grade = 2
  for (const { noteIndex, slot, grade } of candidates) {
    if (grade !== 1 || slot.grade || consumed.has(noteIndex)) continue
    slot.grade = 1
    consumed.add(noteIndex)
  }

  for (const { entry, slots } of targets) {
    if (entry.kind === 'single') {
      verdicts[entry.index] = ['miss', 'close', 'hit'][slots[0].grade]
      continue
    }
    const sounding = slots.filter((slot) => slot.grade > 0).length
    const share = sounding / slots.length
    verdicts[entry.index] = share >= CHORD_HIT ? 'hit' : share >= CHORD_CLOSE ? 'close' : 'miss'
  }
  return verdicts
}
