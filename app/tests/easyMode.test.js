import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { easyEntries, loadEasy, saveEasy, withEasy } from '../src/tabs/guitar/song/follow/easyMode.js'
import { buildTimeline, isScored } from '../src/tabs/guitar/song/follow/songTimeline.js'
import { initialWait, waitReducer } from '../src/tabs/guitar/song/follow/waitState.js'

const SONGS = new URL('../public/guitar-songs/', import.meta.url)
const bytesOf = (file) => {
  const buffer = readFileSync(new URL(file, SONGS))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}
const timelineOf = async (file) => buildTimeline((await loadGuitarNotation(bytesOf(file), file)).score)
const tex = async (source) =>
  buildTimeline((await loadGuitarNotation(new TextEncoder().encode(source).buffer, 'snippet.alphatex')).score)

describe('Easy version (F45)', () => {
  it('Four-Chord Strum: one strum per bar', async () => {
    const { entries } = await timelineOf('four-chord-strum.musicxml')
    expect([...easyEntries(entries)]).toEqual([0, 4, 8, 12, 16, 20, 24, 28])
  })

  it('House of the Rising Sun: the bass note of each bar', async () => {
    const { entries } = await timelineOf('house-of-the-rising-sun.musicxml')
    const kept = [...easyEntries(entries)]
    expect(kept).toHaveLength(16)
    expect(kept.every((index) => index % 6 === 0)).toBe(true)
  })

  it('keeps a chord change in the middle of a bar', async () => {
    const em = '(0.6 2.5 2.4 0.3 0.2 0.1).4'
    const c = '(3.5 2.4 0.3 1.2 0.1).4'
    const { entries } = await tex(String.raw`\tempo 120 . ${em} ${em} ${c} ${c} | ${c} ${c} ${c} ${c}`)
    expect([...easyEntries(entries)]).toEqual([0, 2, 4])
  })

  it('keeps the first note of a bar each time a repeat plays it', async () => {
    const { entries } = await tex(String.raw`\tempo 120 . \ro 1.1 2.1 3.1 4.1 | \rc 2 5.1 6.1 7.1 8.1 | 9.1 10.1 11.1 12.1`)
    expect([...easyEntries(entries)]).toEqual([0, 4, 8, 12, 16])
  })

  it('marks the rest optional, so Wait for me passes over them', async () => {
    const timeline = await timelineOf('four-chord-strum.musicxml')
    expect(withEasy(timeline, false)).toBe(timeline)
    const easy = withEasy(timeline, true)
    expect(easy.entries).toHaveLength(timeline.entries.length)
    expect(easy.entries.filter(isScored).map((e) => e.index)).toEqual([0, 4, 8, 12, 16, 20, 24, 28])
    expect(timeline.entries.every(isScored)).toBe(true) // the full version is untouched

    const reduce = waitReducer(easy.entries)
    const start = initialWait(easy.entries)
    expect(start.index).toBe(0)
    const next = reduce(start, { type: 'judged', result: { verdict: 'hit' } })
    expect(next.index).toBe(4)
    expect(next.results.slice(0, 4)).toEqual(['hit', 'skipped', 'skipped', 'skipped'])
  })
})

describe('Easy choice per song', () => {
  afterEach(() => {
    delete globalThis.localStorage
  })

  it('is remembered by fingerprint, and off by default', () => {
    const store = new Map()
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
    expect(loadEasy('abc')).toBe(false)
    saveEasy('abc', true)
    expect(loadEasy('abc')).toBe(true)
    expect(loadEasy('other')).toBe(false)
    saveEasy('abc', false)
    expect(loadEasy('abc')).toBe(false)
    expect(loadEasy(null)).toBe(false)
  })

  it('works without storage', () => {
    expect(loadEasy('abc')).toBe(false)
    expect(() => saveEasy('abc', true)).not.toThrow()
  })
})
