import { describe, expect, it } from 'vitest'
import { soundsLikeANote } from '../src/tabs/guitar/song/follow/waitListening.js'
import { COUNT_IN_BEATS, ON_TIME_MS, STRUM_STEPS, passed, scoreStrums, strumTargets, tendency } from '../src/tabs/guitar/exercises/strumTiming.js'
import { RATE, listen, renderGuitar, strum, withRoomNoise } from './guitarSignals.js'

const EM = { 6: 0, 5: 2, 4: 2, 3: 0, 2: 0, 1: 0 }
const step = (id) => STRUM_STEPS.find((s) => s.id === id)

describe('strum targets (F18)', () => {
  it('starts after a bar of count-in and puts eighths halfway between beats', () => {
    const quarters = strumTargets(step('em-60'), { bars: 1 })
    expect(quarters.map((t) => t.time)).toEqual([4000, 5000, 6000, 7000])
    const eighths = strumTargets(step('em-eighths-70'), { bars: 1 })
    expect(eighths).toHaveLength(8)
    expect(eighths[1].up).toBe(true)
    expect(eighths[1].time - eighths[0].time).toBeCloseTo(60000 / 70 / 2, 6)
    expect(quarters[0].time).toBe(COUNT_IN_BEATS * 1000)
  })
})

describe('scoring strums', () => {
  const targets = strumTargets(step('em-60'), { bars: 1 }) // 4000 5000 6000 7000

  it('calls each strum on time, early or late, and a beat with none missed', () => {
    const score = scoreStrums(targets, [4010, 4900 - ON_TIME_MS, 6120])
    expect(score.results.map((r) => r.verdict)).toEqual(['on', 'early', 'late', 'missed'])
    expect(score).toMatchObject({ onTime: 1, total: 4 })
    expect(passed(score)).toBe(false)
  })

  it('uses each strum once and ignores strums far from any beat', () => {
    const score = scoreStrums(targets, [4000, 4005, 4500, 5000, 6000, 7000])
    expect(score.onTime).toBe(4)
    expect(passed(score)).toBe(true)
  })

  it('names a steady rush or drag', () => {
    expect(tendency(scoreStrums(targets, [3955, 4955, 5958, 6957]))).toBe('You rush by about 40 ms.')
    expect(tendency(scoreStrums(targets, [4005, 5000, 5995, 7010]))).toBeNull()
  })
})

describe('strums through the real listener', () => {
  it('hears strums placed on, early and late, close to where they were played', () => {
    // Strums at 0.5 s, 1.41 s (150 ms early) and 2.65 s (150 ms late) against beats at 0.5, 1.56, 2.5 s.
    const at = [0.5, 1.41, 2.65]
    const windows = listen(withRoomNoise(renderGuitar(3.4, at.flatMap((t, i) => strum(t, EM, { seed: 30 + i })))))
    const strums = windows.filter((w) => soundsLikeANote(w).ok).map((w) => (w.onset / RATE) * 1000)
    expect(strums).toHaveLength(3)
    const score = scoreStrums([{ time: 500 }, { time: 1560 }, { time: 2500 }], strums)
    expect(score.results.map((r) => r.verdict)).toEqual(['on', 'early', 'late'])
  })
})
