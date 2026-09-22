import { PitchDetector } from 'pitchy'

/**
 * Pure pitch helpers (no DOM, no audio graph) so they can be unit-tested in
 * Node: frame analysis on top of pitchy (McLeod pitch method), note naming,
 * and scoring of a sung attempt against the expected melody.
 */

export const DEFAULT_BUFFER_SIZE = 2048
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function frequencyToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / 440)
}

export function midiToNoteName(midi) {
  const rounded = Math.round(midi)
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`
}

export function centsOff(midi, targetMidi) {
  return (midi - targetMidi) * 100
}

export function rms(buffer) {
  let sum = 0
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

/**
 * Classify a pitch error in cents: within tolerance, close (≤ 1 semitone),
 * right pitch class in the wrong octave, or wrong.
 */
export function classifyCents(cents, toleranceCents = 50) {
  const abs = Math.abs(cents)
  if (abs <= toleranceCents) return 'in-tune'
  const wrapped = (((cents / 100) % 12) + 18) % 12 - 6 // fold into [-6, 6) semitones
  if (Math.abs(wrapped) * 100 <= toleranceCents) return 'octave'
  if (abs <= 100) return 'close'
  return 'wrong'
}

export function createPitchTracker({
  bufferSize = DEFAULT_BUFFER_SIZE,
  minClarity = 0.9,
  minRms = 0.01,
  minFrequency = 60,
  maxFrequency = 1500,
} = {}) {
  const detector = PitchDetector.forFloat32Array(bufferSize)
  return {
    bufferSize,
    /** One time-domain frame → { frequency, clarity, midi, rms } or null when nothing pitched is there. */
    analyze(buffer, sampleRate) {
      const level = rms(buffer)
      if (level < minRms) return null
      const [frequency, clarity] = detector.findPitch(buffer, sampleRate)
      if (!(clarity >= minClarity) || frequency < minFrequency || frequency > maxFrequency) return null
      return { frequency, clarity, midi: frequencyToMidi(frequency), rms: level }
    },
  }
}

/** The note sounding at `time`, or null during a rest. `sortedNotes` is ascending by time. */
export function findActiveNote(sortedNotes, time) {
  let found = null
  for (const note of sortedNotes) {
    if (note.time > time) break
    if (time < note.time + note.duration) found = note
  }
  return found
}

/**
 * Score pitch samples ({ time, midi }) against the expected melody
 * ({ midi, time, duration }). Frames during rests are not scored.
 */
export function scoreAttempt(samples, notes, { toleranceCents = 50 } = {}) {
  const sorted = [...notes].sort((a, b) => a.time - b.time)
  let scoredFrames = 0
  let inTune = 0
  let octaveInTune = 0
  const scored = []
  for (const sample of samples) {
    const target = findActiveNote(sorted, sample.time)
    if (!target) {
      scored.push({ ...sample, target: null, cents: null, verdict: 'rest' })
      continue
    }
    const cents = centsOff(sample.midi, target.midi)
    const verdict = classifyCents(cents, toleranceCents)
    scoredFrames += 1
    if (verdict === 'in-tune') inTune += 1
    if (verdict === 'in-tune' || verdict === 'octave') octaveInTune += 1
    scored.push({ ...sample, target: target.midi, cents, verdict })
  }
  return {
    scoredFrames,
    inTune,
    octaveInTune,
    accuracy: scoredFrames ? (inTune / scoredFrames) * 100 : 0,
    octaveAgnosticAccuracy: scoredFrames ? (octaveInTune / scoredFrames) * 100 : 0,
    samples: scored,
  }
}
