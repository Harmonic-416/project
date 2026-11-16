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
