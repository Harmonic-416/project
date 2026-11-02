import { describe, expect, it } from 'vitest'
import {
  EAR_LENGTH,
  METERS,
  PHASES,
  READING_LENGTH,
  SCALE,
  checkAnswer,
  earMelody,
  eighthSeconds,
  randomMelody,
  readingMelody,
  rhythmPlan,
  rhythmPosition,
  sameSyllable,
} from '../src/tabs/vocal/learn/learnLogic.js'

/** Seeded stand-in for Math.random (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('solfège', () => {
  it('spells the C major scale do to do', () => {
    expect(SCALE.map((n) => n.syllable).join(' ')).toBe('do re mi fa so la ti do')
    expect(SCALE.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
  })

  it('treats low and high do as the same syllable', () => {
    expect(sameSyllable(0, 7)).toBe(true)
    expect(sameSyllable(0, 1)).toBe(false)
  })

  it('makes melodies in range with no repeats or wide leaps', () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const melody = randomMelody({ length: 8, maxLeap: 4, random: seeded(seed) })
      expect(melody).toHaveLength(8)
      melody.forEach((step, i) => {
        expect(step).toBeGreaterThanOrEqual(0)
        expect(step).toBeLessThanOrEqual(7)
        if (i > 0) {
          expect(step).not.toBe(melody[i - 1])
          expect(Math.abs(step - melody[i - 1])).toBeLessThanOrEqual(4)
        }
      })
    }
  })

  it('reading melodies have six notes; ear melodies four, starting on do', () => {
    expect(readingMelody(seeded(3))).toHaveLength(READING_LENGTH)
    for (let seed = 1; seed < 50; seed += 1) {
      const melody = earMelody(seeded(seed))
      expect(melody).toHaveLength(EAR_LENGTH)
      expect(melody[0]).toBe(0)
    }
  })

  it('checks an answer note by note', () => {
    expect(checkAnswer([0, 2, 4, 7], [0, 2, 3, 0])).toEqual([true, true, false, true])
    expect(checkAnswer([0, 2], [0])).toEqual([true, false])
  })
})

describe('rhythm', () => {
  it.each(Object.values(METERS))('plans a count-in and two bars of each note value in $id', (meter) => {
    const plan = rhythmPlan(meter)
    const bar = meter.eighthsPerBar
    expect(plan.total).toBe(bar * 9)
    expect(plan.phases.map((p) => p.id)).toEqual(['quarter', 'half', 'whole', 'eighth'])
    for (const phase of PHASES) {
      const notes = plan.notes.filter((n) => n.phase === phase.id)
      expect(notes).toHaveLength((bar * 2) / phase.eighths)
    }
    // No notes during the count-in; notes back to back after it.
    expect(plan.notes[0].at).toBe(bar)
    plan.notes.slice(1).forEach((n, i) => expect(n.at).toBe(plan.notes[i].at + plan.notes[i].length))
  })

  it('clicks quarters in 4/4 and accented eighths in 12/8', () => {
    const four = rhythmPlan(METERS['4/4']).clicks.slice(0, 4)
    expect(four).toEqual([
      { at: 0, level: 'down' },
      { at: 2, level: 'beat' },
      { at: 4, level: 'beat' },
      { at: 6, level: 'beat' },
    ])
    const twelve = rhythmPlan(METERS['12/8']).clicks.slice(0, 12).map((c) => c.level)
    expect(twelve).toEqual(['down', 'sub', 'sub', 'beat', 'sub', 'sub', 'beat', 'sub', 'sub', 'beat', 'sub', 'sub'])
  })

  it('times eighths from the pulse tempo', () => {
    expect(eighthSeconds(METERS['4/4'], 60)).toBeCloseTo(0.5)
    expect(eighthSeconds(METERS['12/8'], 60)).toBeCloseTo(1 / 3)
  })

  it('finds the phase and count for a moment in the plan', () => {
    const plan = rhythmPlan(METERS['4/4'])
    expect(rhythmPosition(plan, 3.5)).toEqual({ phaseIndex: -1, countIndex: 3 })
    expect(rhythmPosition(plan, 8)).toEqual({ phaseIndex: 0, countIndex: 0 })
    expect(rhythmPosition(plan, 8 + 16 + 5.2)).toEqual({ phaseIndex: 1, countIndex: 5 })
  })
})
