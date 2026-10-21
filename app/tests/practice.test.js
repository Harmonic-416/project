import { describe, expect, it } from 'vitest'
import { CHORDS, barresOf, chordMidi, dotLabel, noteAt } from '../src/tabs/guitar/practice/chords.js'
import { lessonEntry, markedStrings, toLessonVerdict } from '../src/tabs/guitar/practice/lessonVerdicts.js'
import { initialPractice, practiceReducer } from '../src/tabs/guitar/practice/practiceState.js'
import { createWaitAttempts } from '../src/tabs/guitar/song/follow/waitListening.js'
import { listen, renderGuitar, strum, typing, withRoomNoise } from './guitarSignals.js'

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

  it('never moves to another chord on what the mic hears: wrong tries are only counted', () => {
    let s = initialPractice(1, 2) // A minor, with E minor and A minor unlocked
    for (let i = 1; i <= 10; i++) {
      s = practiceReducer(s, wrong)
      expect(s).toMatchObject({ chordIndex: 1, verdict: 'wrong', misses: i })
    }
    s = practiceReducer(s, { type: 'result', verdict: 'verified' })
    expect(s.chordIndex).toBe(1)
  })

  it('Retry resets the same chord, Skip and Next move on, and the list wraps', () => {
    const missed = practiceReducer(initialPractice(0), wrong)
    expect(practiceReducer(missed, { type: 'retry' })).toMatchObject({ chordIndex: 0, misses: 0 })
    expect(practiceReducer(missed, { type: 'skip' }).chordIndex).toBe(1)
    const last = initialPractice(CHORDS.length - 1)
    expect(practiceReducer(last, { type: 'next' }).chordIndex).toBe(0)
  })

  it('locked chords cannot be opened, and moving on stays within the unlocked ones', () => {
    const onlyEm = initialPractice(0, 1)
    expect(practiceReducer(onlyEm, { type: 'select', index: 2 })).toBe(onlyEm)
    expect(practiceReducer(onlyEm, { type: 'next' }).chordIndex).toBe(0)
    expect(practiceReducer(onlyEm, { type: 'skip' }).chordIndex).toBe(0)

    const am = initialPractice(1, 2)
    expect(practiceReducer(am, { type: 'next' })).toMatchObject({ chordIndex: 0, unlocked: 2 })
  })

  it('unlocking raises the limit; lowering it moves back to the first chord', () => {
    const passed = practiceReducer(initialPractice(0, 1), { type: 'unlocked', count: 2 })
    expect(passed).toMatchObject({ chordIndex: 0, unlocked: 2 })
    expect(practiceReducer(passed, { type: 'select', index: 1 }).chordIndex).toBe(1)

    const onAm = initialPractice(1, 2)
    expect(practiceReducer(onAm, { type: 'unlocked', count: 1 })).toMatchObject({ chordIndex: 0, unlocked: 1 })
  })
})

describe('barres', () => {
  it('finds the small F’s first finger across B and e, and nothing in an open chord', () => {
    expect(barresOf(CHORDS.find((c) => c.id === 'F'))).toEqual([{ from: 4, to: 5, fret: 1 }])
    expect(barresOf(em)).toEqual([])
  })
})

describe('lessons from the mic', () => {
  const shapeOf = (chord) => Object.fromEntries(chord.frets.flatMap((fret, i) => (fret < 0 ? [] : [[6 - i, fret]])))

  /** Audio through the real listener and Wait for me's rules, into the lesson reducer. */
  function lesson(chord, signal) {
    const attempts = createWaitAttempts()
    const results = []
    for (const window of listen(signal)) {
      for (const action of attempts.consider(window, lessonEntry(chord)).actions) results.push(toLessonVerdict(action.result))
    }
    return results
  }

  it('builds the chord as the song judge’s one-entry timeline (tab numbering)', () => {
    expect(lessonEntry(am).notes.map((n) => [n.string, n.fret, n.midi])).toEqual([
      [5, 0, 45],
      [4, 2, 52],
      [3, 2, 57],
      [2, 1, 60],
      [1, 0, 64],
    ])
  })

  it('verifies a strummed chord once, with every string lit', () => {
    const results = lesson(em, withRoomNoise(renderGuitar(3, strum(0.5, shapeOf(em)))))
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ verdict: 'verified', strings: ['good', 'good', 'good', 'good', 'good', 'good'] })
    const s = practiceReducer(initialPractice(0), { type: 'result', ...results[0] })
    expect(s).toMatchObject({ verdict: 'verified', misses: 0 })
  })

  it('calls E major wrong when E minor is the lesson, and shows the G string', () => {
    const e = CHORDS.find((c) => c.id === 'E')
    const [result] = lesson(em, withRoomNoise(renderGuitar(3, strum(0.5, shapeOf(e)))))
    expect(result.verdict).toBe('wrong')
    expect(result.strings[3]).toBe('bad') // G string, low E first
  })

  it('hears nothing in typing', () => {
    expect(lesson(em, withRoomNoise(typing(4, 0.5, 3.5, { amp: 0.08, seed: 4 })))).toEqual([])
  })

  it('marked results light the chord’s strings for "right" and none otherwise', () => {
    expect(markedStrings('verified', am)).toEqual(['idle', 'good', 'good', 'good', 'good', 'good'])
    expect(markedStrings('wrong', am)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle', 'idle'])
  })
})