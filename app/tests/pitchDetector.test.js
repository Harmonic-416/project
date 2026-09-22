import { describe, expect, it } from 'vitest'
import {
  centsOff,
  classifyCents,
  createPitchTracker,
  findActiveNote,
  frequencyToMidi,
  midiToNoteName,
  scoreAttempt,
} from '../src/tabs/vocal/audio/pitchDetector.js'
import { diatonicIndex, pitchToY, positionFor } from '../src/tabs/vocal/audio/useSheetOverlay.js'

const SAMPLE_RATE = 48000
function sine(frequency, amplitude = 0.4, size = 2048) {
  const buffer = new Float32Array(size)
  for (let i = 0; i < size; i += 1) buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE)
  return buffer
}

describe('pitch tracking frames', () => {
  const tracker = createPitchTracker()

  it('finds A4 and C4 in clean sine waves', () => {
    const a4 = tracker.analyze(sine(440), SAMPLE_RATE)
    expect(a4.frequency).toBeCloseTo(440, 0)
    expect(a4.midi).toBeCloseTo(69, 1)
    expect(a4.clarity).toBeGreaterThan(0.95)
    const c4 = tracker.analyze(sine(261.63), SAMPLE_RATE)
    expect(c4.midi).toBeCloseTo(60, 1)
  })

  it('reports nothing for silence, noise-level input, or out-of-range pitches', () => {
    expect(tracker.analyze(new Float32Array(2048), SAMPLE_RATE)).toBeNull()
    expect(tracker.analyze(sine(440, 0.001), SAMPLE_RATE)).toBeNull()
    expect(tracker.analyze(sine(20), SAMPLE_RATE)).toBeNull()
  })

  it('names notes and measures cents', () => {
    expect(midiToNoteName(69)).toBe('A4')
    expect(midiToNoteName(60.4)).toBe('C4')
    expect(midiToNoteName(61)).toBe('C#4')
    expect(frequencyToMidi(880)).toBeCloseTo(81, 6)
    expect(centsOff(60.2, 60)).toBeCloseTo(20, 6)
  })

  it('classifies pitch errors', () => {
    expect(classifyCents(30)).toBe('in-tune')
    expect(classifyCents(-80)).toBe('close')
    expect(classifyCents(1200 + 20)).toBe('octave')
    expect(classifyCents(-2400 - 40)).toBe('octave')
    expect(classifyCents(700)).toBe('wrong')
  })
})

describe('scoring an attempt', () => {
  const melody = [
    { midi: 60, time: 0, duration: 1 },
    { midi: 64, time: 1, duration: 1 },
    { midi: 67, time: 3, duration: 1 }, // rest between 2 and 3
  ]

  it('finds the note sounding at a time, or null in a rest', () => {
    expect(findActiveNote(melody, 0.5).midi).toBe(60)
    expect(findActiveNote(melody, 1.0).midi).toBe(64)
    expect(findActiveNote(melody, 2.5)).toBeNull()
    expect(findActiveNote(melody, 9)).toBeNull()
  })

  it('counts in-tune, octave, close and wrong frames; ignores rests', () => {
    const samples = [
      { time: 0.2, midi: 60.1 }, // in tune
      { time: 0.5, midi: 62 }, // wrong (2 semitones)
      { time: 1.3, midi: 76.2 }, // octave up
      { time: 1.6, midi: 64.7 }, // close (70 cents)
      { time: 2.5, midi: 60 }, // rest: not scored
    ]
    const result = scoreAttempt(samples, melody)
    expect(result.scoredFrames).toBe(4)
    expect(result.inTune).toBe(1)
    expect(result.octaveInTune).toBe(2)
    expect(result.accuracy).toBeCloseTo(25, 6)
    expect(result.octaveAgnosticAccuracy).toBeCloseTo(50, 6)
    expect(result.samples.map((s) => s.verdict)).toEqual(['in-tune', 'wrong', 'octave', 'close', 'rest'])
  })

  it('returns zero accuracy without scored frames', () => {
    expect(scoreAttempt([], melody).accuracy).toBe(0)
  })
})

describe('sheet overlay geometry (treble clef)', () => {
  it('maps pitches to staff positions: E4 bottom line, F5 top line, A4 second space', () => {
    const top = 100
    const staffPx = 40
    expect(pitchToY(64, top, staffPx)).toBeCloseTo(140, 6) // E4 bottom line
    expect(pitchToY(77, top, staffPx)).toBeCloseTo(100, 6) // F5 top line
    expect(pitchToY(69, top, staffPx)).toBeCloseTo(125, 6) // A4 second space
    expect(pitchToY(72, top, staffPx)).toBeCloseTo(115, 6) // C5 third space
    expect(pitchToY(60, top, staffPx)).toBeCloseTo(150, 6) // C4 first ledger line below
  })

  it('interpolates sharps and cents between diatonic positions', () => {
    expect(diatonicIndex(61)).toBeCloseTo(diatonicIndex(60) + 0.5, 6)
    expect(diatonicIndex(64.5)).toBeGreaterThan(diatonicIndex(64))
    expect(diatonicIndex(64.5)).toBeLessThan(diatonicIndex(65))
  })

  it('interpolates x between cursor stops and nudges across line breaks', () => {
    const steps = [
      { time: 0, x: 100, top: 50 },
      { time: 1, x: 200, top: 50 },
      { time: 2, x: 60, top: 300 }, // next system
    ]
    expect(positionFor(steps, 0.5)).toEqual({ x: 150, top: 50 })
    expect(positionFor(steps, 1.5).x).toBeGreaterThan(200)
    expect(positionFor(steps, 1.5).top).toBe(50)
    expect(positionFor(steps, 5)).toEqual({ x: 60, top: 300 })
    expect(positionFor([], 1)).toBeNull()
  })
})
