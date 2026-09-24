import { describe, expect, it } from 'vitest'
import { CHORDS, chordMidi, dotLabel, noteAt } from '../src/tabs/guitar/practice/chords.js'
import { MAX_MISSES, initialPractice, practiceReducer } from '../src/tabs/guitar/practice/practiceState.js'

const em = CHORDS.find((c) => c.id === 'Em')
const am = CHORDS.find((c) => c.id === 'Am')

describe('chord data', () => {
  it('every chord has six strings, sensible frets and matching fingers', () => {
    for (const chord of CHORDS) {
      expect(chord.frets).toHaveLength(6)
      expect(chord.fingers).toHaveLength(6)
      chord.frets.forEach((fret, i) => {
        expect(fret).toBeGreaterThanOrEqual(-1)
        expect(fret).toBeLessThanOrEqual(4)
        // a finger only where a fret is pressed, and a fret pressed only with a finger
        expect(chord.fingers[i] > 0).toBe(fret > 0)
      })
    }
  })

  it('E minor is 0-2-2-0-0-0 and spells E B E G B E', () => {
    expect(em.frets).toEqual([0, 2, 2, 0, 0, 0])
    expect(em.frets.map((fret, i) => noteAt(i, fret))).toEqual(['E', 'B', 'E', 'G', 'B', 'E'])
  })

  it('leaves muted strings out of the sound', () => {
    expect(noteAt(0, -1)).toBeNull()
    expect(chordMidi(am)).toEqual([45, 52, 57, 60, 64]) // A E A C E
  })
})

describe('dotLabel (F35 label toggle)', () => {
  it('shows fret numbers, note names or finger numbers', () => {
    expect(dotLabel(em, 1, 'fret')).toBe('2')
    expect(dotLabel(em, 1, 'note')).toBe('B')
    expect(dotLabel(em, 1, 'finger')).toBe('2')
    expect(dotLabel(em, 2, 'finger')).toBe('3')
  })
})

describe('practiceReducer', () => {
  const wrong = { type: 'result', verdict: 'wrong' }

  it('starts listening on the chosen chord', () => {
    expect(initialPractice(2)).toMatchObject({ chordIndex: 2, verdict: 'listening', misses: 0 })
  })

  it('a verified chord shows "heard it" without counting a miss', () => {
    const s = practiceReducer(initialPractice(0), { type: 'result', verdict: 'verified' })
    expect(s.verdict).toBe('verified')
    expect(s.misses).toBe(0)
  })

  it('silence is not a wrong note (F21)', () => {
    const s = practiceReducer(initialPractice(0), { type: 'result', verdict: 'silent' })
    expect(s.verdict).toBe('silent')
    expect(s.misses).toBe(0)
  })

  it(`auto-skips after ${MAX_MISSES} wrong tries (F29)`, () => {
    let s = initialPractice(0)
    for (let i = 1; i < MAX_MISSES; i++) {
      s = practiceReducer(s, wrong)
      expect(s).toMatchObject({ chordIndex: 0, verdict: 'wrong', misses: i })
    }
    s = practiceReducer(s, wrong)
    expect(s).toMatchObject({ chordIndex: 1, verdict: 'listening', misses: 0 })
    expect(s.notice).toMatch(/Skipped E minor/)
  })

  it('Retry resets the same chord, Skip and Next move on, and the list wraps', () => {
    const missed = practiceReducer(initialPractice(0), wrong)
    expect(practiceReducer(missed, { type: 'retry' })).toMatchObject({ chordIndex: 0, misses: 0 })
    expect(practiceReducer(missed, { type: 'skip' }).chordIndex).toBe(1)
    const last = initialPractice(CHORDS.length - 1)
    expect(practiceReducer(last, { type: 'next' }).chordIndex).toBe(0)
  })
})