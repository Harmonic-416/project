import { describe, expect, it } from 'vitest'
import { barAt, howFar, summarizeTake } from '../src/tabs/vocal/practice/takeSummary.js'
import { barNumbers } from '../src/tabs/vocal/notation/scoreModel.js'

// Eight bars of 2 s, numbered 1–8; one note per second.
const bars = Array.from({ length: 8 }, (_, i) => ({ time: i * 2, number: i + 1 }))
const line = Array.from({ length: 16 }, (_, i) => ({ time: i, duration: 1 }))
const allBut = (missed) => new Set(line.map((_, i) => i).filter((i) => !missed.includes(i)))

describe('barNumbers', () => {
  it('numbers a pickup 0, as the score prints it', () => {
    const pickup = [
      { time: 0, length: 0.25, numerator: 3, denominator: 4 },
      { time: 0.75, length: 0.75, numerator: 3, denominator: 4 },
    ]
    expect(barNumbers(pickup).map((b) => b.number)).toEqual([0, 1])
    const full = [{ time: 0, length: 1, numerator: 4, denominator: 4 }]
    expect(barNumbers(full)[0].number).toBe(1)
  })
})

describe('summarizeTake', () => {
  it('counts the notes the staff shows and gives honest stars and words', () => {
    const all = summarizeTake({ line, hits: allBut([]), centsByNote: new Map(), bars })
    expect(all).toMatchObject({ hit: 16, total: 16, stars: 3, title: 'Every note!', spots: [] })
    const most = summarizeTake({ line, hits: allBut([3]), centsByNote: new Map([[3, -40]]), bars })
    expect(most.stars).toBe(2) // 15/16 — never "perfect" below every note
    expect(most.title).toBe('Great take')
  })

  it('groups misses in touching bars into one spot that says which way', () => {
    const centsByNote = new Map([[4, -30], [5, -35], [6, -25], [7, 80]]) // bars 3–4, mostly flat
    const take = summarizeTake({ line, hits: allBut([4, 5, 6, 7]), centsByNote, bars })
    expect(take.spots).toHaveLength(1)
    expect(take.spots[0]).toMatchObject({ label: 'Bars 3–4', direction: 'flat', glyph: '↑', time: 4 })
    expect(take.spots[0].words).toBe('flat (about 30¢ low)')
  })

  it('keeps the three biggest spots in score order and says how many more', () => {
    const missed = [0, 6, 7, 12, 13, 14, 15] // bar 1; bar 4; bars 7–8 — plus nothing else
    const take = summarizeTake({ line, hits: allBut(missed), centsByNote: new Map(), bars })
    expect(take.spots.map((s) => s.label)).toEqual(['Bar 1', 'Bar 4', 'Bars 7–8'])
    expect(take.spots[0].direction).toBe('silent')
    const more = summarizeTake({ line, hits: allBut([0, 4, 8, 12]), centsByNote: new Map(), bars })
    expect(more.spots).toHaveLength(3)
    expect(more.moreSpots).toBe(1)
  })

  it('calls a spot unsteady when it went both ways', () => {
    const take = summarizeTake({ line, hits: allBut([2, 3]), centsByNote: new Map([[2, -90], [3, 90]]), bars })
    expect(take.spots[0].direction).toBe('mixed')
  })

  it('finds the bar a time falls in', () => {
    expect(barAt(bars, 0).number).toBe(1)
    expect(barAt(bars, 5.5).number).toBe(3)
    expect(barAt([], 1)).toBeNull()
  })
})

describe('howFar', () => {
  it('uses cents only under a half step, steps above', () => {
    expect(howFar(30)).toBe('about 30¢')
    expect(howFar(110)).toBe('about a half step')
    expect(howFar(170)).toBe('about a whole step')
    expect(howFar(400)).toBe('more than a whole step')
  })
})
