import { describe, expect, it } from 'vitest'
import { LEAD_BACKING_LEVEL, LISTEN_MIXES, mixSchedule } from '../src/tabs/vocal/practice/practiceLogic.js'

const notes = [
  { partIndex: 0, time: 0, duration: 1, frequency: 440 }, // the singer's part (partOnTop puts it first)
  { partIndex: 1, time: 0, duration: 1, frequency: 220 },
  { partIndex: 2, time: 1, duration: 1, frequency: 330 },
]

describe('Listen mode part mix', () => {
  it('offers the learning-track ladder in order', () => {
    expect(LISTEN_MIXES.map((m) => m.id)).toEqual(['solo', 'lead', 'others', 'all'])
  })

  it('plays only my part, or only the others', () => {
    expect(mixSchedule(notes, 'solo').map((e) => e.pitches[0])).toEqual([440])
    expect(mixSchedule(notes, 'others').map((e) => e.pitches[0])).toEqual([220, 330])
  })

  it('keeps my part loud and the others under it for "My part louder"', () => {
    const lead = mixSchedule(notes, 'lead')
    expect(lead.map((e) => e.velocity)).toEqual([1, LEAD_BACKING_LEVEL, LEAD_BACKING_LEVEL])
    expect(LEAD_BACKING_LEVEL).toBeLessThan(0.5)
  })

  it('plays everyone at one level', () => {
    expect(mixSchedule(notes, 'all').every((e) => e.velocity === 1)).toBe(true)
    expect(mixSchedule(notes, 'all')).toHaveLength(3)
  })
})
