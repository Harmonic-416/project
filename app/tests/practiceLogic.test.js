import { describe, expect, it } from 'vitest'
import {
  createHoldDetector,
  createTroubleTracker,
  isOnTarget,
  melodyLine,
  noteDistanceCents,
  scheduleFor,
  soundingAt,
} from '../src/tabs/vocal/practice/practiceLogic.js'

describe('note matching', () => {
  it('folds octaves by default', () => {
    expect(noteDistanceCents(57, 69)).toBeCloseTo(0)
    expect(noteDistanceCents(57, 69, { anyOctave: false })).toBeCloseTo(-1200)
    expect(noteDistanceCents(69.3, 69)).toBeCloseTo(30)
    expect(isOnTarget(81.4, 69)).toBe(true)
    expect(isOnTarget(70, 69)).toBe(false)
    expect(isOnTarget(70, 69, { toleranceCents: 100 })).toBe(true)
  })

  it('keeps the top note of each onset in the first part', () => {
    const notes = [
      { partIndex: 0, midi: 60, time: 0, duration: 1 },
      { partIndex: 0, midi: 64, time: 0, duration: 1 },
      { partIndex: 1, midi: 72, time: 0, duration: 1 },
      { partIndex: 0, midi: 62, time: 1, duration: 1 },
    ]
    expect(melodyLine(notes).map((n) => [n.midi, n.index])).toEqual([
      [64, 1],
      [62, 3],
    ])
  })
})

describe('melody line', () => {
  it('follows the chosen part', () => {
    const note = (partIndex, midi, time) => ({ partIndex, midi, time, duration: 1 })
    const notes = [note(0, 72, 0), note(1, 64, 0), note(1, 65, 1)]
    expect(melodyLine(notes, 1).map((n) => [n.midi, n.index])).toEqual([
      [64, 1],
      [65, 2],
    ])
  })
})

describe('accompaniment', () => {
  const note = (frequency, time, duration) => ({ frequency, time, duration })
  const others = [note(220, 0, 2), note(330, 0, 1), note(440, 1, 1), note(220, 1, 0.5), note(550, 3, 1)]

  it('finds what the other parts are holding at a moment', () => {
    expect(soundingAt(others, 0)).toEqual([220, 330])
    expect(soundingAt(others, 1)).toEqual([220, 440]) // 330 ended exactly as this onset begins
    expect(soundingAt(others, 1.75)).toEqual([220, 440])
    expect(soundingAt(others, 2.5)).toEqual([]) // everyone resting
  })

  it('schedules notes for playback', () => {
    expect(scheduleFor([note(440, 1, 0.5)])).toEqual([{ time: 1, pitches: [440], duration: 0.5 }])
  })
})

describe('wait mode hold detector', () => {
  it('fires only after the note is held', () => {
    const d = createHoldDetector({ holdMs: 200 })
    expect(d.update(69, 69, 0)).toBe(false)
    expect(d.update(69, 69, 100)).toBe(false)
    expect(d.update(69.2, 69, 210)).toBe(true)
  })

  it('bridges short dropouts but restarts after long ones', () => {
    const d = createHoldDetector({ holdMs: 200, maxGapMs: 120 })
    d.update(69, 69, 0)
    expect(d.update(69, 69, 100)).toBe(false) // 100 ms gap, bridged
    expect(d.update(69, 69, 200)).toBe(true)
    d.reset()
    d.update(69, 69, 0)
    expect(d.update(69, 69, 300)).toBe(false) // 300 ms gap restarts the hold
    expect(d.update(69, 69, 400)).toBe(false)
    expect(d.update(69, 69, 500)).toBe(true)
  })

  it('ignores wrong notes', () => {
    const d = createHoldDetector({ holdMs: 0 })
    expect(d.update(71, 69, 0)).toBe(false)
    expect(d.update(69, 69, 10)).toBe(true)
  })
})

describe('trouble spot tracker', () => {
  const melody = [
    { midi: 60, time: 0, duration: 1, index: 0 },
    { midi: 62, time: 1, duration: 1, index: 1 },
    { midi: 64, time: 2, duration: 1, index: 2 },
  ]
  const sing = (tracker, midi, from, to) => {
    for (let t = from; t < to; t += 0.02) tracker.addSample({ time: t, midi })
  }

  it('marks notes missed only once playback is past them', () => {
    const tracker = createTroubleTracker(melody)
    sing(tracker, 60, 0.1, 0.8)
    expect(tracker.collect(1.1)).toEqual({ hit: [], missed: [] }) // still within grace
    const first = tracker.collect(1.25)
    expect(first.hit.map((n) => n.index)).toEqual([0])
    sing(tracker, 66, 1.1, 1.9) // a whole tone sharp
    sing(tracker, 52, 2.1, 2.9) // right note, an octave down
    const rest = tracker.collect(Infinity)
    expect(rest.missed.map((n) => n.index)).toEqual([1])
    expect(rest.hit.map((n) => n.index)).toEqual([2])
  })

  it('needs more than a stray frame', () => {
    const tracker = createTroubleTracker(melody, { minFrames: 3 })
    tracker.addSample({ time: 0.5, midi: 60 })
    tracker.addSample({ time: 0.52, midi: 60 })
    expect(tracker.collect(1.5).missed.map((n) => n.index)).toEqual([0])
  })

  it('skips notes before a seek without a verdict', () => {
    const tracker = createTroubleTracker(melody)
    tracker.skipTo(1.5)
    sing(tracker, 62, 1.5, 1.9)
    expect(tracker.collect(Infinity).hit.map((n) => n.index)).toEqual([1])
  })
})
