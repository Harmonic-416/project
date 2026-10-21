import { describe, expect, it } from 'vitest'
import { formatChange, historySummary, scoreLine, withTrend } from '../src/tabs/vocal/share/attemptHistory.js'

const tries = (...scores) => scores.map((accuracy, i) => ({ id: `a${i}`, accuracy })) // newest first

describe('an attempt’s history', () => {
  it('marks each try up or down from the one before, and the best', () => {
    const list = withTrend(tries(80.4, 59, 73.6, 40))
    expect(list.map((a) => a.change)).toEqual([21, -15, 34, null])
    expect(list.filter((a) => a.best).map((a) => a.id)).toEqual(['a0'])
  })

  it('calls the earliest of two equal scores the best', () => {
    expect(withTrend(tries(70, 70, 10)).filter((a) => a.best).map((a) => a.id)).toEqual(['a1'])
  })

  it('sums up the tries', () => {
    expect(historySummary(tries(59, 73.6, 0))).toEqual({ tries: 3, best: 74, latest: 59, first: 0 })
    expect(historySummary([])).toBeNull()
  })

  it('writes a change in points', () => {
    expect([formatChange(12), formatChange(-5), formatChange(0), formatChange(null)]).toEqual(['+12', '−5', '±0', ''])
  })
})

describe('the score line', () => {
  const notes = (hit, missed) => ({ hit: Array(hit).fill({}), missed: Array(missed).fill({}), total: hit + missed })

  it('says the percent is of what was sung, and the counts of the whole part', () => {
    expect(scoreLine(80.2, notes(6, 466))).toEqual({ headline: '80% in tune', detail: 'of what you sang · 6 of 472 notes sung · 466 missed (red)' })
    expect(scoreLine(100, notes(4, 0)).detail).toBe('of what you sang · 4 of 4 notes sung')
    expect(scoreLine(50, null)).toEqual({ headline: '50% in tune', detail: 'of what you sang' })
  })
})
