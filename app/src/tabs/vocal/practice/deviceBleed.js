import { noteDistanceCents } from './practiceLogic.js'

/**
 * Keeping the device's own sound out of the pitch score (pure, no audio
 * graph, so it can be unit-tested in Node).
 *
 * Without headphones the microphone hears the speaker. Three rules keep that
 * from being scored as singing:
 *  1. The practised part (always the rendered score's part 0) is never played
 *     while the mic is scoring: otherwise the device sings every note for you.
 *  2. Accompaniment notes that share a pitch class with the melody note
 *     sounding at the same time (release tail included) are left out, so any
 *     frame at the target's pitch class can only have come from the singer.
 *  3. Any frame within `toleranceCents` (any octave) of a note the device is
 *     sounding at that moment is dropped as bleed, not scored.
 * Because of rule 2, rule 3 never drops a frame that is on the target.
 *
 * Schedule events are `{ time, duration, pitches, partIndex, midi }`.
 * `midi` lets the rules work without converting frequencies back.
 */

/** Tone.Synth's release is 1 s, exponential; by ~0.5 s it's too quiet to track. */
export const RELEASE_TAIL_SECONDS = 0.5
/** Scheduling and latency jitter: treat a note as sounding slightly early. */
export const LEAD_SECONDS = 0.05

const pitchClass = (midi) => ((Math.round(midi) % 12) + 12) % 12

function sounds(note, time, tail = RELEASE_TAIL_SECONDS) {
  return note.time - LEAD_SECONDS <= time && time < note.time + note.duration + tail
}

function overlaps(a, b, tail = RELEASE_TAIL_SECONDS) {
  return a.time - LEAD_SECONDS < b.time + b.duration && b.time < a.time + a.duration + tail
}

/**
 * The schedule events the device may play while the mic is scoring `melody`.
 * With headphones the speaker can't reach the mic, so everything plays.
 */
export function playableWhileScoring(schedule, melody, { headphones = false } = {}) {
  if (headphones) return schedule
  return schedule.filter(
    (event) =>
      event.partIndex !== 0 &&
      !melody.some((note) => pitchClass(note.midi) === pitchClass(event.midi) && overlaps(event, note)),
  )
}

/**
 * `isBleed(time, midi)`: true when the frame matches a note the device is
 * sounding at `time` (the score time the singer heard; see scoreClock.js).
 */
export function createBleedGate(deviceNotes, { toleranceCents = 60 } = {}) {
  const notes = [...deviceNotes].sort((a, b) => a.time - b.time)
  return function isBleed(time, midi) {
    for (const note of notes) {
      if (note.time - LEAD_SECONDS > time) break
      if (sounds(note, time) && Math.abs(noteDistanceCents(midi, note.midi)) <= toleranceCents) return true
    }
    return false
  }
}
