import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import {
  buildTimeline,
  entryIndexAtTime,
  fingeringLabel,
  practiceableTracks,
  secondsToTicks,
  ticksToSeconds,
} from '../src/tabs/guitar/song/follow/songTimeline.js'
import {
  fourChordStrumBeats,
  houseOfTheRisingSunNotes,
  odeToJoyNotes,
} from '../../tests/fixtures/guitar/generate.mjs'

const bytesOf = (relativePath) => {
  const buffer = readFileSync(new URL(relativePath, import.meta.url))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}
const encode = (text) => new TextEncoder().encode(text).buffer

const song = (file) => loadGuitarNotation(bytesOf(`../public/guitar-songs/${file}`), file)
const tex = (source) => loadGuitarNotation(encode(source), 'snippet.alphatex')

describe('built-in songs', () => {
  it('House of the Rising Sun: 96 eighth notes at quarter = 90, in order, with string and fret', async () => {
    const { score } = await song('house-of-the-rising-sun.musicxml')
    expect(practiceableTracks(score)).toEqual([{ index: 0, name: 'Guitar' }])
    const { entries, duration } = buildTimeline(score)
    const expected = houseOfTheRisingSunNotes()
    expect(entries).toHaveLength(expected.length)
    entries.forEach((entry, i) => {
      expect(entry.index).toBe(i)
      expect(entry.kind).toBe('single')
      expect(entry.technique).toBe('pick')
      expect(entry.notes[0]).toMatchObject({ midi: expected[i].midi, string: expected[i].string, fret: expected[i].fret })
      expect(entry.time).toBeCloseTo(i / 3, 6) // eighth = 1/3 s at quarter = 90
      expect(entry.duration).toBeCloseTo(1 / 3, 6)
    })
    expect(entries[6]).toMatchObject({ bar: 1, tick: 2880 })
    expect(duration).toBeCloseTo(32, 6)
  })

  it('Ode to Joy: single notes with their real lengths', async () => {
    const { score, hasTab } = await song('ode-to-joy.musicxml')
    expect(hasTab).toBe(true)
    const { entries } = buildTimeline(score)
    const expected = odeToJoyNotes()
    expect(entries.map((e) => e.notes[0].midi)).toEqual(expected.map((n) => n.midi))
    // Bar 4 starts with a dotted quarter at quarter = 100 (0.6 s per beat).
    const dotted = entries.findIndex((e) => e.bar === 3)
    expect(entries[dotted].time).toBeCloseTo(3 * 2.4, 6)
    expect(entries[dotted].duration).toBeCloseTo(0.9, 6)
  })

  it('Four-Chord Strum: every beat is a chord, low to high', async () => {
    const { score, hasTab } = await song('four-chord-strum.musicxml')
    expect(hasTab).toBe(true)
    const { entries } = buildTimeline(score)
    const expected = fourChordStrumBeats()
    expect(entries).toHaveLength(expected.length)
    expect(entries.every((e) => e.kind === 'chord')).toBe(true)
    expect(entries[0].notes.map((n) => n.midi)).toEqual([40, 47, 52, 55, 59, 64]) // Em
    expect(entries[0].midi).toBe(64)
    expect(fingeringLabel(entries[0])).toBe('0-2-2-0-0-0')
    expect(fingeringLabel(entries[12])).toBe('x-x-0-2-3-2') // D
    expect(entries[1].time).toBeCloseTo(0.75, 6) // quarter = 80
  })
})

describe('playback order and timing', () => {
  it('writes repeats out', async () => {
    const { score } = await tex(String.raw`\tempo 120 . \ro 1.1 2.1 3.1 4.1 | \rc 2 5.1 6.1 7.1 8.1 | 9.1 10.1 11.1 12.1`)
    const { entries, duration } = buildTimeline(score)
    expect(entries).toHaveLength(20)
    expect(entries.map((e) => e.notes[0].fret)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(entries.map((e) => e.bar)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2])
    expect(entries[8].time).toBeCloseTo(4, 6) // second time through bar 1, quarter = 0.5 s
    expect(entries[8].barStartTick).toBe(7680)
    expect(duration).toBeCloseTo(10, 6)
  })

  it('honours tempo changes, and converts seconds back to ticks', async () => {
    const { score } = await tex(String.raw`\tempo 60 . 1.1 2.1 3.1 4.1 | \tempo 120 5.1 6.1 7.1 8.1`)
    const { entries, tempoMap } = buildTimeline(score)
    expect(entries.map((e) => e.time)).toEqual([0, 1, 2, 3, 4, 4.5, 5, 5.5])
    expect(ticksToSeconds(tempoMap, 3840 + 960)).toBeCloseTo(4.5, 6)
    expect(secondsToTicks(tempoMap, 4.5)).toBe(3840 + 960)
    expect(secondsToTicks(tempoMap, 1.5)).toBe(1440)
  })

  it('lengthens a note through its ties instead of repeating it', async () => {
    const { score } = await tex(String.raw`\tempo 120 . 2.3.2 2.3{t}.2 | 0.1.1`)
    const { entries } = buildTimeline(score)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ tick: 0, endTick: 3840 })
    expect(entries[0].duration).toBeCloseTo(2, 6)
    expect(entries[1].notes[0].midi).toBe(64)
  })

  it('labels techniques the judge treats differently', async () => {
    const { score } = await tex(String.raw`\tempo 120 . 5.1{h} 7.1 3.2{b (0 4)} x.3`)
    const { entries } = buildTimeline(score)
    expect(entries.map((e) => e.technique)).toEqual(['pick', 'legato', 'bend', 'dead'])
  })
})

describe('entryIndexAtTime', () => {
  const entries = [{ time: 0 }, { time: 1 }, { time: 2 }]
  it('finds the first entry at or after a time', () => {
    expect(entryIndexAtTime(entries, 0)).toBe(0)
    expect(entryIndexAtTime(entries, 0.5)).toBe(1)
    expect(entryIndexAtTime(entries, 1)).toBe(1)
    expect(entryIndexAtTime(entries, 9)).toBe(2)
    expect(entryIndexAtTime([], 1)).toBe(-1)
  })
})
