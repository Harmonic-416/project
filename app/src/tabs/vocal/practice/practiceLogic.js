import { centsOff } from '../audio/pitchDetector.js'

/**
 * Pure logic behind the two practice modes (no DOM, no audio graph), so it
 * can be unit-tested in Node:
 *  - "Wait for me": createHoldDetector decides when the singer has landed
 *    on the highlighted note.
 *  - "Trouble spots": createTroubleTracker decides, note by note as
 *    playback moves on, whether each one was sung.
 * Octaves are folded by default so any voice range can sing any melody.
 */

export const PRACTICE_MODES = [
  { id: 'listen', label: 'Listen', hint: 'Plain playback. Record an attempt below to score it.' },
  { id: 'wait', label: 'Wait for me', hint: 'The next note is highlighted and the score waits until you sing it.' },
  { id: 'trouble', label: 'Trouble spots', hint: 'Plays in time; notes you miss are marked in red.' },
]

/**
 * Who you practise with, for scores with several parts. `hint` is per
 * practice mode (see VocalTab for how each mode uses it).
 */
export const ACCOMPANIMENTS = [
  {
    id: 'solo',
    label: 'By myself',
    hint: {
      listen: 'Only your part plays.',
      wait: 'Silent until you sing.',
      trouble: 'Your part plays for you to sing along with (headphones only; on the speaker it stays silent).',
    },
  },
  {
    id: 'all',
    label: 'With all parts',
    hint: {
      listen: 'Every part plays; yours is on top.',
      wait: 'The other parts hold their chord while you find your note.',
      trouble: 'The other parts play; your part is left for you to sing.',
    },
  },
]

/** Tone.Part events for a set of score-model notes (one pitch each). */
export function scheduleFor(notes) {
  return notes.map((n) => ({
    time: n.time,
    pitches: [n.frequency],
    duration: n.duration,
    partIndex: n.partIndex,
    midi: n.midi,
  }))
}

/**
 * Frequencies sounding at `time` — started by then and not yet ended (so a
 * note ending exactly as the target starts doesn't count), one per pitch.
 */
export function soundingAt(notes, time, epsilon = 1e-3) {
  const frequencies = new Set()
  for (const note of notes) {
    if (note.time <= time + epsilon && time < note.time + note.duration - epsilon) frequencies.add(note.frequency)
  }
  return [...frequencies].sort((a, b) => a - b)
}

/** Cents from the target, folded to the nearest octave when `anyOctave`. */
export function noteDistanceCents(midi, targetMidi, { anyOctave = true } = {}) {
  const cents = centsOff(midi, targetMidi)
  return anyOctave ? cents - 1200 * Math.round(cents / 1200) : cents
}

export function isOnTarget(midi, targetMidi, { toleranceCents = 50, anyOctave = true } = {}) {
  return Math.abs(noteDistanceCents(midi, targetMidi, { anyOctave })) <= toleranceCents
}

/**
 * The line to practise: one part (the first by default), one note per
 * onset (the highest, when the part has chords). Each entry keeps `index` into scoreModel.notes
 * so it can be found on screen again.
 */
export function melodyLine(notes, partIndex = 0) {
  const byTime = new Map()
  notes.forEach((note, index) => {
    if (note.partIndex !== partIndex) return
    const existing = byTime.get(note.time)
    if (!existing || note.midi > existing.midi) byTime.set(note.time, { ...note, index })
  })
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}

/**
 * "Wait for me": the target counts as sung once on-pitch frames have kept
 * coming for `holdMs`, so a slide through the note doesn't trigger it.
 * Pitch frames drop out on consonants and breaths, so a gap shorter than
 * `maxGapMs` doesn't restart the hold.
 */
export function createHoldDetector({ toleranceCents = 50, anyOctave = true, holdMs = 200, maxGapMs = 120 } = {}) {
  let since = null
  let lastOn = null
  return {
    reset() {
      since = null
      lastOn = null
    },
    /** Feed one pitch frame at `nowMs`; true once the target has been held long enough. */
    update(midi, targetMidi, nowMs) {
      if (!isOnTarget(midi, targetMidi, { toleranceCents, anyOctave })) return false
      if (since === null || nowMs - lastOn > maxGapMs) since = nowMs
      lastOn = nowMs
      return nowMs - since >= holdMs
    },
  }
}

/**
 * "Trouble spots": a note is hit when at least `minFrames` pitch frames
 * within `toleranceCents` land inside its window, widened by
 * `graceSeconds` on both sides for reaction time and mic latency. Once
 * playback is past a note's window, collect() resolves it for good.
 * `melody` must be ascending by time (see melodyLine).
 */
export function createTroubleTracker(
  melody,
  { toleranceCents = 100, anyOctave = true, minFrames = 3, graceSeconds = 0.2 } = {},
) {
  const hits = new Array(melody.length).fill(0)
  let first = 0 // first note not resolved yet

  const windowStart = (note) => note.time - graceSeconds
  const windowEnd = (note) => note.time + note.duration + graceSeconds

  return {
    /** One pitch frame ({ time, midi }, time on the playback clock). */
    addSample(sample) {
      for (let i = first; i < melody.length && windowStart(melody[i]) <= sample.time; i += 1) {
        const note = melody[i]
        if (sample.time <= windowEnd(note) && isOnTarget(sample.midi, note.midi, { toleranceCents, anyOctave })) {
          hits[i] += 1
        }
      }
    },
    /** Resolve every note whose window closed before `time`; returns { hit, missed } melody entries. */
    collect(time) {
      const hit = []
      const missed = []
      while (first < melody.length && windowEnd(melody[first]) < time) {
        if (hits[first] >= minFrames) hit.push(melody[first])
        else missed.push(melody[first])
        first += 1
      }
      return { hit, missed }
    },
    /** Jump (seek) to `time`: notes before it are skipped without a verdict, later ones start fresh. */
    skipTo(time) {
      first = 0
      while (first < melody.length && windowEnd(melody[first]) < time) first += 1
      hits.fill(0, first)
    },
  }
}
