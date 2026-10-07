import { afterEach, describe, expect, it } from 'vitest'
import { clampTempo, effectiveBpm, loadSongTempo, saveSongTempo } from '../src/audio/tempo/tempo.js'
import { scaleTempoMarks, scaleTempoText } from '../src/tabs/vocal/notation/tempoMarks.js'
import { ticksPerScoreSecond } from '../src/tabs/vocal/playback/scoreClock.js'

/** Minimal in-memory stand-in for the browser's localStorage. */
function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    raw: (key) => items.get(key),
  }
}

/** Just enough of an SVG <text> and its container for scaleTempoMarks. */
function fakeMarks(...texts) {
  const elements = texts.map((textContent) => {
    const attrs = new Map()
    return {
      textContent,
      getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
      setAttribute: (name, value) => attrs.set(name, value),
    }
  })
  return { elements, container: { querySelectorAll: () => elements } }
}

describe('tempo values', () => {
  it('snaps to 5% steps between 50% and 100%', () => {
    expect(clampTempo(73)).toBe(75)
    expect(clampTempo(72)).toBe(70)
    expect(clampTempo(49)).toBe(50)
    expect(clampTempo(10)).toBe(50)
    expect(clampTempo(101)).toBe(100)
    expect(clampTempo('60')).toBe(60)
  })

  it('treats anything unreadable as the written tempo', () => {
    expect(clampTempo(Number.NaN)).toBe(100)
    expect(clampTempo(undefined)).toBe(100)
    expect(clampTempo('fast')).toBe(100)
  })

  it('reports the BPM actually heard, rounded like a printed mark', () => {
    expect(effectiveBpm(120, 75)).toBe(90)
    expect(effectiveBpm(90, 50)).toBe(45)
    expect(effectiveBpm(80, 85)).toBe(68)
  })
})

describe('remembering a tempo per song', () => {
  afterEach(() => {
    delete globalThis.localStorage
  })

  it('keeps each song separate and defaults to 100%', () => {
    globalThis.localStorage = fakeStorage()
    saveSongTempo('song-a', 60)
    saveSongTempo('song-b', 85)
    expect(loadSongTempo('song-a')).toBe(60)
    expect(loadSongTempo('song-b')).toBe(85)
    expect(loadSongTempo('song-c')).toBe(100)
  })

  it('stores only slowed-down songs: back to 100% removes the entry', () => {
    const storage = fakeStorage()
    globalThis.localStorage = storage
    saveSongTempo('song-a', 60)
    saveSongTempo('song-a', 100)
    expect(JSON.parse(storage.raw('harmonic.tempo'))).toEqual({})
    expect(loadSongTempo('song-a')).toBe(100)
  })

  it('clamps whatever was saved', () => {
    globalThis.localStorage = fakeStorage({ 'harmonic.tempo': '{"song-a": 30, "song-b": "x"}' })
    expect(loadSongTempo('song-a')).toBe(50)
    expect(loadSongTempo('song-b')).toBe(100)
  })

  it('survives missing, unreadable or blocked storage', () => {
    expect(loadSongTempo('song-a')).toBe(100) // node: no localStorage at all
    expect(() => saveSongTempo('song-a', 60)).not.toThrow()
    globalThis.localStorage = fakeStorage({ 'harmonic.tempo': '{not json' })
    expect(loadSongTempo('song-a')).toBe(100)
    saveSongTempo('song-a', 70) // starts the map over
    expect(loadSongTempo('song-a')).toBe(70)
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadSongTempo('song-a')).toBe(100)
    expect(() => saveSongTempo('song-a', 60)).not.toThrow()
  })

  it('ignores a song without a key', () => {
    globalThis.localStorage = fakeStorage()
    saveSongTempo(undefined, 60)
    expect(loadSongTempo(undefined)).toBe(100)
  })
})

describe('printed tempo marks', () => {
  it('rescales the number in a VexFlow tempo label', () => {
    expect(scaleTempoText(' = 120', 0.75)).toBe(' = 90')
    expect(scaleTempoText(' = 80', 0.85)).toBe(' = 68')
    expect(scaleTempoText(' = 120', 1)).toBe(' = 120')
    expect(scaleTempoText('Allegro', 0.5)).toBe('Allegro')
  })

  it('never compounds: each application starts from the written mark', () => {
    const { elements, container } = fakeMarks(' = 120', ' = 96')
    scaleTempoMarks(container, 0.5)
    expect(elements.map((e) => e.textContent)).toEqual([' = 60', ' = 48'])
    scaleTempoMarks(container, 0.75)
    expect(elements.map((e) => e.textContent)).toEqual([' = 90', ' = 72'])
    scaleTempoMarks(container, 1)
    expect(elements.map((e) => e.textContent)).toEqual([' = 120', ' = 96'])
  })

  it('does nothing without a container', () => {
    expect(() => scaleTempoMarks(null, 0.5)).not.toThrow()
  })
})

describe('score clock', () => {
  it('counts score seconds as ticks at the 120 BPM the schedule was written for', () => {
    expect(ticksPerScoreSecond(192)).toBe(384) // Tone's default PPQ
    expect(ticksPerScoreSecond(480)).toBe(960)
  })
})
