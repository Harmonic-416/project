import { describe, expect, it } from 'vitest'
import { sectionTimeline, songVerdicts } from '../src/tabs/guitar/song/follow/songSection.js'

function timelineFor(order) {
  const bars = order.map((index, i) => ({ index, start: i * 960, end: (i + 1) * 960 }))
  return {
    bars,
    tempoMap: [{ tick: 0, seconds: 0, bpm: 60 }],
    entries: bars.map((bar, index) => ({ index, bar: bar.index, tick: bar.start, time: index })),
  }
}

describe('guitar song sections', () => {
  it('uses inclusive bar numbers, with section-local indexes and whole-score verdict positions', () => {
    const song = timelineFor([0, 1, 2, 3])
    expect(sectionTimeline(song, null)).toBe(song)
    const section = sectionTimeline(song, { first: 1, last: 2 })
    expect(section).toMatchObject({ startTick: 960, endTick: 2880, startTime: 1, duration: 3 })
    expect(section.entries.map(({ index, bar }) => [index, bar])).toEqual([[0, 1], [1, 2]])
    expect(songVerdicts(section, ['hit', 'miss'])).toEqual([null, 'hit', 'miss', null])
  })

  it('uses the pass through a repeat that reaches the requested end without leaving the section', () => {
    const song = timelineFor([0, 1, 0, 1, 2, 3])
    const section = sectionTimeline(song, { first: 1, last: 2 })
    expect(section.entries.map(({ bar }) => bar)).toEqual([1, 2])
    expect(section.startTick).toBe(2880)
    expect(section.endTick).toBe(4800)
  })
})
