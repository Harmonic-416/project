import { describe, expect, it } from 'vitest'
import { createPitchTracker } from '../src/tabs/vocal/audio/pitchDetector.js'
import { STANDARD_TUNING, centsFrom, createStabilizer, nearestString } from '../src/tabs/guitar/tuner/tuner.js'

const withCents = (frequency, cents) => frequency * 2 ** (cents / 1200)
const byId = (id) => STANDARD_TUNING.find((s) => s.id === id)

describe('standard tuning targets', () => {
  it('lists E2 A2 D3 G3 B3 E4 at their standard frequencies', () => {
    expect(STANDARD_TUNING.map((s) => s.id)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4'])
    const expected = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63]
    STANDARD_TUNING.forEach((s, i) => expect(s.frequency).toBeCloseTo(expected[i], 1))
    expect(STANDARD_TUNING.map((s) => s.stringNumber)).toEqual([6, 5, 4, 3, 2, 1])
  })
})

describe('centsFrom and nearestString', () => {
  it('reads 115 Hz against A2 as about +77 cents', () => {
    expect(centsFrom(115, 110)).toBeCloseTo(77, 0)
  })

  it('picks every open string at 0 cents', () => {
    for (const string of STANDARD_TUNING) {
      const match = nearestString(string.frequency)
      expect(match.string.id).toBe(string.id)
      expect(match.cents).toBeCloseTo(0, 6)
    }
  })

  it('picks the nearest string for ±30 cent offsets', () => {
    for (const string of STANDARD_TUNING) {
      expect(nearestString(withCents(string.frequency, 30)).cents).toBeCloseTo(30, 6)
      expect(nearestString(withCents(string.frequency, -30)).string.id).toBe(string.id)
    }
  })

  it('returns null far outside the guitar range unless a string is locked', () => {
    expect(nearestString(40)).toBeNull()
    const locked = nearestString(40, { lockedId: 'E2' })
    expect(locked.string.id).toBe('E2')
    expect(locked.cents).toBeLessThan(-1200)
  })

  it('measures against the locked string even when another is nearer', () => {
    const match = nearestString(110, { lockedId: 'E2' })
    expect(match.string.id).toBe('E2')
    expect(match.cents).toBeCloseTo(500, 0)
  })
})

describe('stabilizer', () => {
  /** Push `frequency` every 10 ms from `startMs` for `durationMs`; returns the last reading. */
  function hold(stabilizer, frequency, startMs, durationMs) {
    let reading = null
    for (let t = startMs; t <= startMs + durationMs; t += 10) reading = stabilizer.push(frequency, t)
    return reading
  }

  it('marks a string in tune only after holding within ±5 cents for 0.5 s', () => {
    const stabilizer = createStabilizer()
    expect(hold(stabilizer, withCents(110, 3), 0, 300).inTune).toBe(false)
    expect(hold(stabilizer, withCents(110, 3), 310, 300).inTune).toBe(true)
  })

  it('keeps in-tune through wobble within ±8 cents and clears it beyond', () => {
    const stabilizer = createStabilizer()
    hold(stabilizer, 110, 0, 600)
    expect(hold(stabilizer, withCents(110, 7), 610, 100).inTune).toBe(true)
    expect(hold(stabilizer, withCents(110, 12), 720, 100).inTune).toBe(false)
  })

  it('ignores one harmonic reading while tuning low E', () => {
    const stabilizer = createStabilizer()
    hold(stabilizer, byId('E2').frequency, 0, 100)
    const reading = stabilizer.push(byId('E2').frequency * 2, 110)
    expect(reading.string.id).toBe('E2')
    expect(Math.abs(reading.cents)).toBeLessThan(1)
  })

  it('holds briefly through a dropout, then reports silence', () => {
    const stabilizer = createStabilizer()
    hold(stabilizer, 110, 0, 100)
    expect(stabilizer.push(null, 200).string.id).toBe('A2')
    expect(stabilizer.push(null, 400)).toBeNull()
  })

  it('resets the in-tune state when a different string is played', () => {
    const stabilizer = createStabilizer()
    hold(stabilizer, 110, 0, 600)
    const reading = hold(stabilizer, byId('D3').frequency, 1000, 100)
    expect(reading.string.id).toBe('D3')
    expect(reading.inTune).toBe(false)
  })
})

describe('tuner on synthetic plucked strings', () => {
  const SAMPLE_RATE = 48000
  /** A decaying string-like tone: fundamental plus louder 2nd harmonic. */
  function pluck(frequency, size = 4096) {
    const buffer = new Float32Array(size)
    for (let i = 0; i < size; i += 1) {
      const t = i / SAMPLE_RATE
      buffer[i] =
        Math.exp(-t * 2) *
        (0.25 * Math.sin(2 * Math.PI * frequency * t) + 0.3 * Math.sin(2 * Math.PI * 2 * frequency * t) +
          0.1 * Math.sin(2 * Math.PI * 3 * frequency * t))
    }
    return buffer
  }

  it('identifies each open string through Pitchy on 4096-sample frames', () => {
    const tracker = createPitchTracker({ bufferSize: 4096, minRms: 0.005, maxFrequency: 1000 })
    for (const string of STANDARD_TUNING) {
      const detected = tracker.analyze(pluck(withCents(string.frequency, -20)), SAMPLE_RATE)
      const match = nearestString(detected.frequency)
      expect(match.string.id).toBe(string.id)
      expect(match.cents).toBeCloseTo(-20, 0)
    }
  })
})
