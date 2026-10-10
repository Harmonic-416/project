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
  for (const entry of entries) {
    if (entry.time < from - 1e-6 || entry.time > to + 1e-6) continue
    if (entry.technique === 'dead' || entry.technique === 'harmonic') {
      verdicts[entry.index] = 'skipped'
      continue
    }
    const start = entry.time - graceSeconds
    const end = entry.time + Math.min(Math.max(entry.duration, minWindow), maxWindow) + graceSeconds
    const heard = songNotes.filter((note) => note.time >= start && note.time <= end)
    const exact = (midi) => heard.filter((note) => note.midi === midi)

    if (entry.kind === 'single') {
      const target = entry.notes[0].midi
      const matches = exact(target)
      if (matches.length) {
        const bentEnough = matches.some((note) => note.bendSemitones >= HEARD_BEND_SEMITONES)
        verdicts[entry.index] = entry.technique === 'bend' && !bentEnough ? 'close' : 'hit'
      } else if (heard.some((note) => note.midi % 12 === target % 12 || Math.abs(note.midi - target) === 1)) {
        verdicts[entry.index] = 'close'
      } else {
        verdicts[entry.index] = 'miss'
      }
      continue
    }

    const sounding = entry.notes.filter(({ midi }) => exact(midi).length > 0).length
    const share = sounding / entry.notes.length
    verdicts[entry.index] = share >= CHORD_HIT ? 'hit' : share >= CHORD_CLOSE ? 'close' : 'miss'
  }
  return verdicts
}
