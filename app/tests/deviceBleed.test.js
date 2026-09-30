import { describe, expect, it } from 'vitest'
import { createBleedGate, playableWhileScoring } from '../src/tabs/vocal/practice/deviceBleed.js'

const ev = (partIndex, midi, time, duration = 1) => ({ partIndex, midi, time, duration, pitches: [440] })

describe('playableWhileScoring', () => {
  const melody = [
    { midi: 67, time: 0, duration: 1 }, // G4
    { midi: 69, time: 2, duration: 1 }, // A4
  ]
  const schedule = [
    ev(0, 67, 0), // the singer's own G
    ev(1, 55, 0), // G3 under it: same pitch class
    ev(1, 60, 0), // C4: harmony
    ev(1, 57, 1), // A3 ending at 2 — its release tail runs into the melody's A
    ev(1, 57, 5), // A3 long after: fine
    ev(0, 69, 2), // own A
  ]

  it('mutes the singer’s part and accompaniment on the target’s pitch class', () => {
    expect(playableWhileScoring(schedule, melody)).toEqual([schedule[2], schedule[4]])
  })

  it('plays everything with headphones', () => {
    expect(playableWhileScoring(schedule, melody, { headphones: true })).toBe(schedule)
  })
})

describe('createBleedGate', () => {
  const isBleed = createBleedGate([ev(1, 60, 1, 1)]) // C4 from 1 s to 2 s

  it('drops frames on a sounding device note, in any octave', () => {
    expect(isBleed(1.5, 60)).toBe(true)
    expect(isBleed(1.5, 72.3)).toBe(true)
    expect(isBleed(1.5, 48)).toBe(true)
  })

  it('covers the release tail but not afterwards', () => {
    expect(isBleed(2.3, 60)).toBe(true)
    expect(isBleed(2.6, 60)).toBe(false)
    expect(isBleed(0.5, 60)).toBe(false)
  })

  it('keeps frames that differ from what the device plays', () => {
    expect(isBleed(1.5, 62)).toBe(false)
    expect(isBleed(1.5, 61)).toBe(false)
  })

  it('never drops an on-target frame after playableWhileScoring', () => {
    const melody = [{ midi: 64, time: 1, duration: 1 }]
    const device = playableWhileScoring([ev(1, 52, 1), ev(1, 60, 1), ev(0, 64, 1)], melody)
    const gate = createBleedGate(device)
    for (const t of [1, 1.25, 1.5, 1.75, 1.99]) expect(gate(t, 64)).toBe(false)
  })
})
