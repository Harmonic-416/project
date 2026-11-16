import { describe, expect, it } from 'vitest'
import { missedBars } from '../src/tabs/vocal/practice/songBars.js'

describe('missedBars — the bars an attempt missed', () => {
  const bars = [0, 1, 1, 2, 3, 3, 5, 9, 9]
  it('joins misses in touching bars and names a pickup', () => {
    const v = ['miss', 'miss', 'hit', 'miss', 'hit', 'hit', 'miss', 'hit', 'miss']
    expect(missedBars(v, bars)).toEqual({ labels: ['Pickup–bar 2', 'Bar 5', 'Bar 9'], more: 0 })
  })
  it('caps the list and says how many more', () => {
    const far = [1, 3, 5, 7, 9, 11]
    expect(missedBars(far.map(() => 'miss'), far, 4)).toMatchObject({ more: 2 })
  })
  it('says nothing when the bars do not match the attempt', () => {
    expect(missedBars(['miss'], [1, 2])).toBeNull()
    expect(missedBars(['hit', 'hit'], [1, 2])).toEqual({ labels: [], more: 0 })
  })
})

import { takeFeedback } from '../src/tabs/vocal/practice/songBars.js'

describe('takeFeedback — a saved attempt read against its song', () => {
  // Six bars of 2 s, a 1 s note on each second; A4 throughout.
  const song = {
    line: Array.from({ length: 12 }, (_, i) => ({ time: i, duration: 1, midi: 69 })),
    bars: [0, 2, 4, 6, 8, 10].map((time, i) => ({ time, number: i + 1 })),
  }
  const at = (second, midi) => [0.3, 0.5, 0.7].map((d) => [second + d, midi])
  it('says which bars were flat, sharp or not heard, every one of them', () => {
    const verdicts = song.line.map((_, i) => ([2, 3, 6, 7, 10, 11].includes(i) ? 'miss' : 'hit'))
    const trace = [...at(2, 68.2), ...at(3, 68.2), ...at(6, 70.1), ...at(7, 70.1)] // bar 2 flat, bar 4 sharp, bar 6 silent
    const feedback = takeFeedback({ verdicts, trace, song })
    expect(feedback.spots.map((s) => [s.label, s.direction])).toEqual([
      ['Bar 2', 'flat'],
      ['Bar 4', 'sharp'],
      ['Bar 6', 'silent'],
    ])
    expect(feedback).toMatchObject({ hit: 6, total: 12, moreSpots: 0 })
  })
  it('says nothing when the song on this device is not the one sung', () => {
    expect(takeFeedback({ verdicts: ['hit'], trace: [], song })).toBeNull()
  })
})
