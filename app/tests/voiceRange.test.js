import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  COMFORTABLE_RANGES,
  RANGE_KEY,
  VOICE_KEY,
  VOICE_OPTIONS,
  effectiveRange,
  loadMeasuredRange,
  loadVoicePartId,
  rangeFromCaught,
  saveMeasuredRange,
  saveVoicePartId,
} from '../src/tabs/vocal/transpose/voiceRange.js'
import { loadSongShift, saveSongShift } from '../src/tabs/vocal/transpose/useSongTranspose.js'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  }
}

describe('effectiveRange', () => {
  it('uses the voice part’s comfortable range', () => {
    expect(effectiveRange({ partId: 'tenor' })).toEqual({ low: 48, high: 67, source: 'part', partId: 'tenor' })
    expect(effectiveRange({ partId: 'nope' })).toBeNull()
    expect(effectiveRange()).toBeNull()
  })

  it('has a range for every voice part on offer, low to high', () => {
    for (const { id } of VOICE_OPTIONS) {
      const r = COMFORTABLE_RANGES[id]
      expect(r.high - r.low).toBeGreaterThanOrEqual(19)
    }
    expect(COMFORTABLE_RANGES.soprano.low).toBeGreaterThan(COMFORTABLE_RANGES.bass.low)
  })

  it('prefers the singer’s own range, a little inside their extremes', () => {
    expect(effectiveRange({ partId: 'tenor', measured: { low: 45, high: 69 } })).toEqual({ low: 47, high: 67, source: 'measured' })
  })

  it('falls back to the part when told not to use the measured range, or when it is implausible', () => {
    expect(effectiveRange({ partId: 'alto', measured: { low: 45, high: 69 }, useMeasured: false }).source).toBe('part')
    expect(effectiveRange({ partId: 'alto', measured: { low: 60, high: 63 } }).source).toBe('part')
  })

  it('never squeezes a measured range below nine semitones', () => {
    const r = effectiveRange({ measured: { low: 55, high: 63 } })
    expect(r.high - r.low).toBe(9)
    expect(r.low).toBeGreaterThanOrEqual(54)
  })
})

describe('rangeFromCaught', () => {
  it('takes the lowest and highest held notes', () => {
    expect(rangeFromCaught([50.2, 55, 60, 64, 67.4])).toEqual({ low: 50, high: 67 })
  })

  it('drops a stray note far from the rest', () => {
    expect(rangeFromCaught([50, 52, 55, 57, 60, 79])).toEqual({ low: 50, high: 60 })
    expect(rangeFromCaught([33, 50, 52, 55, 57, 60])).toEqual({ low: 50, high: 60 })
  })

  it('handles nothing caught', () => {
    expect(rangeFromCaught([])).toBeNull()
  })
})

describe('storage', () => {
  let saved
  beforeEach(() => {
    saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true })
  })
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved)
    else delete globalThis.localStorage
  })

  it('shares the voice part with the warm-up', () => {
    expect(VOICE_KEY).toBe('harmonic.voicePart')
    expect(loadVoicePartId()).toBeNull()
    saveVoicePartId('baritone')
    expect(loadVoicePartId()).toBe('baritone')
    globalThis.localStorage.setItem(VOICE_KEY, 'kazoo')
    expect(loadVoicePartId()).toBeNull()
  })

  it('keeps the measured range', () => {
    expect(loadMeasuredRange()).toBeNull()
    saveMeasuredRange({ low: 45, high: 67 })
    expect(loadMeasuredRange()).toEqual({ low: 45, high: 67, use: true })
    saveMeasuredRange({ low: 45, high: 67, use: false })
    expect(loadMeasuredRange().use).toBe(false)
    globalThis.localStorage.setItem(RANGE_KEY, '{oops')
    expect(loadMeasuredRange()).toBeNull()
    saveMeasuredRange(null)
    expect(globalThis.localStorage.map.has(RANGE_KEY)).toBe(false)
  })

  it('remembers a song’s transposition by its fingerprint, and forgets it at zero', () => {
    expect(loadSongShift('abc')).toBe(0)
    saveSongShift('abc', -3)
    expect(loadSongShift('abc')).toBe(-3)
    expect(loadSongShift('other')).toBe(0)
    saveSongShift('abc', 0)
    expect(globalThis.localStorage.map.size).toBe(0)
    saveSongShift('abc', 40) // out of range: clamped
    expect(loadSongShift('abc')).toBe(12)
    expect(loadSongShift(null)).toBe(0)
  })

  it('survives storage that throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('blocked')
      },
      configurable: true,
    })
    expect(loadVoicePartId()).toBeNull()
    expect(loadMeasuredRange()).toBeNull()
    expect(() => saveMeasuredRange({ low: 40, high: 60 })).not.toThrow()
    expect(loadSongShift('abc')).toBe(0)
    expect(() => saveSongShift('abc', 2)).not.toThrow()
  })
})
