import { readFileSync } from 'node:fs'
import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { VOICE_PARTS, voicePart } from '../src/tabs/vocal/warmup/warmupLogic.js'
import {
  TEST_NOTES,
  createNoteCatcher,
  harmonyShift,
  judgeMeasure,
  judgePhrase,
  randomPhrase,
  splitHarmony,
} from '../src/tabs/vocal/warmup/pitchTestLogic.js'

const harmony = splitHarmony(new Midi(readFileSync(new URL('../public/pitch-tests/harmony.mid', import.meta.url))))

describe('harmony test file', () => {
  it('has one middle note per bar: start, up, back, half step down, back up', () => {
    expect(harmony.measures.map((m) => m.target)).toEqual([64, 65, 64, 63, 64])
    expect(harmony.measures.map((m) => m.move)).toEqual([1, -1, -1, 1, null])
  })

  it('shows each move on beat 4, and none on the last bar', () => {
    const { beat, measures } = harmony
    expect(beat).toBeCloseTo(60 / 90)
    measures.slice(0, -1).forEach((m) => expect(m.cueAt - m.start).toBeCloseTo(3 * beat))
    expect(measures.at(-1).cueAt).toBe(null)
  })

  it('leaves the middle note out of what the piano plays', () => {
    const middles = new Set(harmony.measures.map((m) => m.target))
    expect(harmony.backing).toHaveLength(18)
    expect(harmony.backing.some((n) => n.time === 0 && middles.has(n.midi))).toBe(false)
  })

  it('moves the test to every voice part’s starting note', () => {
    for (const part of VOICE_PARTS) {
      expect(harmony.measures[0].target + harmonyShift(harmony, part)).toBe(TEST_NOTES[part.id].harmony)
    }
  })
})

describe('judging a bar', () => {
  const m = harmony.measures[0]
  const frames = (midi, from, to) => {
    const out = []
    for (let t = from; t < to; t += 0.02) out.push({ time: t, midi })
    return out
  }

  it('passes a bar held in tune, even after a late start', () => {
    expect(judgeMeasure(frames(64.2, m.start + 0.8, m.end), m, 64).pass).toBe(true)
  })

  it('fails a bar sung a half step off, or not sung', () => {
    expect(judgeMeasure(frames(65, m.start, m.end), m, 64).pass).toBe(false)
    expect(judgeMeasure([], m, 64).pass).toBe(false)
  })

  it('accepts the same note an octave away', () => {
    expect(judgeMeasure(frames(52, m.start, m.end), m, 64).pass).toBe(true)
  })
})

describe('pitch test', () => {
  it('picks notes within one octave, never the same twice in a row', () => {
    const part = voicePart('alto')
    for (let i = 0; i < 50; i += 1) {
      const phrase = randomPhrase(part, 6)
      expect(phrase).toHaveLength(6)
      phrase.forEach((n) => {
        expect(n).toBeGreaterThanOrEqual(TEST_NOTES.alto.low)
        expect(n).toBeLessThanOrEqual(TEST_NOTES.alto.low + 12)
      })
      phrase.slice(1).forEach((n, j) => expect(n).not.toBe(phrase[j]))
    }
  })

  it('catches each held note once, and a repeat only after a breath', () => {
    const catcher = createNoteCatcher()
    const caught = []
    const sing = (midi, from, to) => {
      for (let t = from; t < to; t += 0.02) {
        const note = catcher.push({ time: t, midi: midi + Math.sin(t * 30) * 0.15 })
        if (note) caught.push(Math.round(note.midi))
      }
    }
    sing(60, 0, 0.6)
    sing(64, 0.6, 1.2) // straight on, no break
    sing(64, 1.5, 2.1) // after a breath
    sing(67, 2.1, 2.3) // too short to count
    expect(caught).toEqual([60, 64, 64])
  })

  it('marks each sung note against the played one, in order', () => {
    expect(judgePhrase([60.1, 52, 66], [60, 64, 67])).toEqual([
      { target: 60, sung: 60.1, right: true },
      { target: 64, sung: 52, right: true },
      { target: 67, sung: 66, right: false },
    ])
    expect(judgePhrase([60], [60, 62])[1]).toEqual({ target: 62, sung: null, right: false })
  })
})
