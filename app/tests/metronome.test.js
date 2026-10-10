import { afterEach, describe, expect, it } from 'vitest'
import { beatsFromMeasures, countIn, meterPulse } from '../src/audio/metronome/beats.js'
import { DEFAULT_METRONOME, loadMetronomeSettings, saveMetronomeSettings } from '../src/audio/metronome/settings.js'

/** Minimal in-memory stand-in for the browser's localStorage. */
function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  }
}

/** Back-to-back full measures of one meter at one tempo, as the score model lists them. */
function measuresOf(count, numerator, denominator, bpm, { start = 0 } = {}) {
  const seconds = (numerator / denominator) * (240 / bpm)
  return Array.from({ length: count }, (_, i) => ({
    time: start + i * seconds,
    length: numerator / denominator,
    numerator,
    denominator,
    bpm,
  }))
}

const times = (beats) => beats.map((b) => Number(b.time.toFixed(6)))

describe('metronome pulse', () => {
  it('clicks the denominator in simple meters and dotted quarters in compound ones', () => {
    expect(meterPulse(4, 4)).toBe(1 / 4)
    expect(meterPulse(3, 4)).toBe(1 / 4)
    expect(meterPulse(2, 2)).toBe(1 / 2)
    expect(meterPulse(3, 8)).toBe(1 / 8)
    expect(meterPulse(6, 8)).toBe(3 / 8)
    expect(meterPulse(12, 8)).toBe(3 / 8)
  })
})

describe('beat grid', () => {
  it('4/4 at 120 clicks every half second with a downbeat on each 1', () => {
    const beats = beatsFromMeasures(measuresOf(2, 4, 4, 120))
    expect(times(beats)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5])
    expect(beats.map((b) => b.beat)).toEqual([1, 2, 3, 4, 1, 2, 3, 4])
    expect(beats.filter((b) => b.downbeat).map((b) => b.time)).toEqual([0, 2])
    expect(beats.every((b) => b.perBar === 4)).toBe(true)
  })

  it('a one-beat pickup in 3/4 is beat 3, and the first full bar starts on the downbeat', () => {
    // Amazing Grace: 3/4, quarter = 80 (0.75 s a beat), one-beat pickup.
    const pickup = { time: 0, length: 1 / 4, numerator: 3, denominator: 4, bpm: 80 }
    const beats = beatsFromMeasures([pickup, ...measuresOf(1, 3, 4, 80, { start: 0.75 })])
    expect(times(beats)).toEqual([0, 0.75, 1.5, 2.25])
    expect(beats.map((b) => b.beat)).toEqual([3, 1, 2, 3])
    expect(beats.map((b) => b.downbeat)).toEqual([false, true, false, false])
  })

  it('6/8 clicks twice a bar, on the dotted quarters', () => {
    // House of the Rising Sun: 6/8 at quarter = 90 → dotted quarter = 1 s.
    const beats = beatsFromMeasures(measuresOf(2, 6, 8, 90))
    expect(times(beats)).toEqual([0, 1, 2, 3])
    expect(beats.map((b) => b.downbeat)).toEqual([true, false, true, false])
  })

  it('follows a tempo change at a bar line', () => {
    const slow = measuresOf(1, 2, 4, 60) // 1 s a beat, 2 s a bar
    const fast = measuresOf(1, 2, 4, 120, { start: 2 })
    expect(times(beatsFromMeasures([...slow, ...fast]))).toEqual([0, 1, 2, 2.5])
  })

  it('a short final bar only clicks the beats it has', () => {
    const last = { time: 2, length: 2 / 4, numerator: 4, denominator: 4, bpm: 120 }
    expect(times(beatsFromMeasures([...measuresOf(1, 4, 4, 120), last]))).toEqual([0, 0.5, 1, 1.5, 2, 2.5])
  })

  it('skips measures without a usable tempo or meter', () => {
    expect(beatsFromMeasures([{ time: 0, length: 1, numerator: 4, denominator: 4, bpm: 0 }])).toEqual([])
    expect(beatsFromMeasures([])).toEqual([])
  })
})

describe('count-in', () => {
  it('counts one bar of the meter about to play, at its beat spacing', () => {
    const beats = beatsFromMeasures(measuresOf(2, 3, 4, 80))
    expect(countIn(beats, 0)).toEqual({ count: 3, interval: 0.75 })
  })

  it('uses the bar at the playhead when starting mid-song', () => {
    const beats = beatsFromMeasures([...measuresOf(1, 4, 4, 120), ...measuresOf(2, 3, 4, 60, { start: 2 })])
    expect(countIn(beats, 3.2)).toEqual({ count: 3, interval: 1 })
  })

  it('is null for a score without beats', () => {
    expect(countIn([], 0)).toBeNull()
  })
})

describe('metronome settings', () => {
  afterEach(() => {
    delete globalThis.localStorage
  })

  it('falls back to the defaults when storage is missing or unreadable', () => {
    expect(loadMetronomeSettings()).toEqual(DEFAULT_METRONOME) // node: no localStorage at all
    globalThis.localStorage = fakeStorage({ 'harmonic.metronome': '{not json' })
    expect(loadMetronomeSettings()).toEqual(DEFAULT_METRONOME)
    globalThis.localStorage = fakeStorage({ 'harmonic.metronome': '[true]' })
    expect(loadMetronomeSettings()).toEqual(DEFAULT_METRONOME)
  })

  it('round-trips through localStorage, keeping volume within 0–1', () => {
    globalThis.localStorage = fakeStorage()
    saveMetronomeSettings({ on: true, volume: 0.4, countIn: false })
    expect(loadMetronomeSettings()).toEqual({ on: true, volume: 0.4, countIn: false })
    saveMetronomeSettings({ on: true, volume: 7, countIn: 'yes' })
    expect(loadMetronomeSettings()).toEqual({ on: true, volume: 1, countIn: DEFAULT_METRONOME.countIn })
  })

  it('saving without storage does not throw', () => {
    expect(() => saveMetronomeSettings({ on: true, volume: 0.5, countIn: true })).not.toThrow()
  })
})
