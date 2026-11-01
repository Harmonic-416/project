import { describe, expect, it } from 'vitest'
import { compressTiming, entryAt, songTimeAt, troubleTiming, waitTiming } from '../src/tabs/guitar/song/follow/recordingTiming.js'

// Shared guitar runs follow their recording (change: guitar-shared-playback).
describe('songTimeAt', () => {
  const timing = [
    [1, 0],
    [3, 2],
    [5, 2],
    [5.001, 4],
  ]

  it('reads between points, and holds before the first and after the last', () => {
    expect(songTimeAt(timing, 0)).toBe(0)
    expect(songTimeAt(timing, 2)).toBe(1)
    expect(songTimeAt(timing, 4)).toBe(2) // held
    expect(songTimeAt(timing, 9)).toBe(4)
  })

  it('is null without timing', () => {
    expect(songTimeAt(null, 1)).toBeNull()
    expect(songTimeAt([], 1)).toBeNull()
  })
})

describe('compressTiming', () => {
  it('drops points on a straight line and keeps the bends', () => {
    const line = Array.from({ length: 50 }, (_, i) => [i * 0.04, i * 0.04])
    const pause = [
      [2.5, 1.96],
      [3.5, 1.96],
    ]
    expect(compressTiming([...line, ...pause])).toEqual([
      [0, 0],
      [1.96, 1.96],
      [3.5, 1.96],
    ])
  })
})

describe('Trouble spots timing', () => {
  it('follows the clock anchors, a latency later, and holds through a pause', () => {
    const anchors = [
      { wall: 1000, seconds: 0 },
      { wall: 1040, seconds: 0.04 },
      { wall: 1080, seconds: 0.08 },
      // paused for two seconds
      { wall: 3080, seconds: 0.08 },
      { wall: 3120, seconds: 0.12 },
    ]
    const timing = troubleTiming(anchors, { recordingStartWall: 900, latencyMs: 100 })
    expect(songTimeAt(timing, 0.2)).toBeCloseTo(0)
    expect(songTimeAt(timing, 0.24)).toBeCloseTo(0.04)
    expect(songTimeAt(timing, 1.2)).toBeCloseTo(0.08) // mid-pause
    expect(songTimeAt(timing, 2.32)).toBeCloseTo(0.12)
  })

  it('needs anchors and a recording', () => {
    expect(troubleTiming([], { recordingStartWall: 0 })).toBeNull()
    expect(troubleTiming([{ wall: 1, seconds: 0 }], { recordingStartWall: null })).toBeNull()
  })
})

describe('Wait for me timing', () => {
  it('sits on each note until it was played', () => {
    const timing = waitTiming([
      { at: 0, time: 0 },
      { at: 4, time: 0.6 }, // first note played 4 s in
      { at: 9, time: 1.2 },
    ])
    expect(songTimeAt(timing, 3.9)).toBe(0)
    expect(songTimeAt(timing, 4)).toBe(0.6)
    expect(songTimeAt(timing, 8.5)).toBe(0.6)
    expect(songTimeAt(timing, 12)).toBe(1.2)
  })

  it('takes steps out of order (a window closes after a Skip) and none at all', () => {
    const timing = waitTiming([
      { at: 0, time: 0 },
      { at: 5, time: 1.2 },
      { at: 3, time: 0.6 },
    ])
    expect(songTimeAt(timing, 4)).toBe(0.6)
    expect(waitTiming([])).toBeNull()
  })
})

describe('entryAt', () => {
  const entries = [{ time: 0.5 }, { time: 1 }, { time: 2 }]

  it('is the last entry at or before the time', () => {
    expect(entryAt(entries, 0)).toBe(entries[0])
    expect(entryAt(entries, 1.5)).toBe(entries[1])
    expect(entryAt(entries, 1.99)).toBe(entries[2]) // just ahead counts
    expect(entryAt([], 1)).toBeNull()
  })
})
