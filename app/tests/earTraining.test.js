import { describe, expect, it } from 'vitest'
import { CHORDS, chordMidi } from '../src/tabs/guitar/practice/chords.js'
import { ringResonance } from '../src/tabs/guitar/practice/chordSound.js'
import {
  LEVELS,
  QUESTIONS_PER_ROUND,
  exerciseReducer,
  initialExercise,
  makeRound,
  missedChords,
  roundScore,
} from '../src/tabs/guitar/exercises/earTraining.js'

/** Seeded stand-in for Math.random (mulberry32), so rounds are repeatable. */
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

const ROOT_PITCH_CLASS = { C: 0, D: 2, E: 4, G: 7, A: 9 }
const run = (actions, state = initialExercise()) => actions.reduce(exerciseReducer, state)

describe('chord quality (F41)', () => {
  it('matches the third each chord actually sounds', () => {
    for (const chord of CHORDS) {
      const root = ROOT_PITCH_CLASS[chord.id[0]]
      const pitchClasses = new Set(chordMidi(chord).map((midi) => midi % 12))
      const third = chord.quality === 'major' ? 4 : 3
      expect(pitchClasses.has((root + third) % 12), chord.id).toBe(true)
      expect(pitchClasses.has((root + 7 - third) % 12), chord.id).toBe(false) // not the other third
    }
  })

  it('has both qualities to ask about', () => {
    expect(new Set(CHORDS.map((c) => c.quality))).toEqual(new Set(['major', 'minor']))
  })
})

describe('making a round', () => {
  for (const level of LEVELS) {
    it(`${level.id}: ten questions, the answer always among ${level.choices} different choices`, () => {
      const round = makeRound(level.id, { random: seeded(1) })
      expect(round).toHaveLength(QUESTIONS_PER_ROUND)
      for (const q of round) {
        expect(q.choices).toHaveLength(level.choices)
        expect(new Set(q.choices).size).toBe(level.choices)
        expect(q.choices).toContain(q.correct)
      }
    })

    it(`${level.id}: never the same chord twice in a row`, () => {
      for (let seed = 0; seed < 50; seed += 1) {
        const round = makeRound(level.id, { random: seeded(seed) })
        round.slice(1).forEach((q, i) => expect(q.answer).not.toBe(round[i].answer))
      }
    })
  }

  it('quality: the answer is the chord’s quality, offered as Major | Minor', () => {
    for (const q of makeRound('quality', { random: seeded(2) })) {
      expect(q.choices).toEqual(['major', 'minor'])
      expect(q.correct).toBe(q.answer.quality)
    }
  })

  it('quality: about as many minor as major questions, though only 2 of 6 chords are minor', () => {
    const answers = Array.from({ length: 100 }, (_, seed) => makeRound('quality', { random: seeded(seed) })).flat()
    const minor = answers.filter((q) => q.correct === 'minor').length / answers.length
    expect(minor).toBeGreaterThan(0.4)
    expect(minor).toBeLessThan(0.6)
  })

  it('chord: choices are chord ids, the right one in no fixed place', () => {
    const places = new Set()
    for (let seed = 0; seed < 20; seed += 1) {
      for (const q of makeRound('chord', { random: seeded(seed) })) {
        expect(q.correct).toBe(q.answer.id)
        q.choices.forEach((id) => expect(CHORDS.some((c) => c.id === id)).toBe(true))
        places.add(q.choices.indexOf(q.correct))
      }
    }
    expect(places).toEqual(new Set([0, 1, 2, 3]))
  })

  it('every chord comes up', () => {
    const asked = new Set(
      Array.from({ length: 20 }, (_, seed) => makeRound('chord', { random: seeded(seed) }))
        .flat()
        .map((q) => q.answer.id),
    )
    expect(asked).toEqual(new Set(CHORDS.map((c) => c.id)))
  })
})

describe('a round', () => {
  const questions = makeRound('chord', { count: 3, random: seeded(3) })
  const start = { type: 'start', level: 'chord', questions }
  const wrongChoice = (q) => q.choices.find((c) => c !== q.correct)

  it('asks, takes one answer, moves on, and ends', () => {
    let s = run([start])
    expect(s).toMatchObject({ status: 'asking', level: 'chord', index: 0 })
    s = run([{ type: 'answer', choice: questions[0].correct }], s)
    expect(s.status).toBe('answered')
    expect(s.results[0]).toEqual({ answer: questions[0].answer.id, picked: questions[0].correct, correct: true })
    s = run(
      [
        { type: 'next' },
        { type: 'answer', choice: wrongChoice(questions[1]) },
        { type: 'next' },
        { type: 'answer', choice: questions[2].correct },
        { type: 'next' },
      ],
      s,
    )
    expect(s.status).toBe('done')
    expect(s.results.map((r) => r.correct)).toEqual([true, false, true])
  })

  it('ignores a second answer, and answers or Next at the wrong time', () => {
    expect(run([{ type: 'answer', choice: 'C' }])).toEqual(initialExercise())
    expect(run([start, { type: 'next' }]).index).toBe(0)
    const answered = run([start, { type: 'answer', choice: wrongChoice(questions[0]) }])
    expect(run([{ type: 'answer', choice: questions[0].correct }], answered)).toBe(answered)
  })

  it('End round / Change level go back to the levels', () => {
    expect(run([start, { type: 'reset' }])).toEqual(initialExercise())
  })
})

describe('end of a round', () => {
  const results = [
    { answer: 'G', picked: 'G', correct: true },
    { answer: 'Am', picked: 'Em', correct: false },
    { answer: 'C', picked: 'G', correct: false },
    { answer: 'Am', picked: 'C', correct: false },
  ]

  it('scores the round', () => {
    expect(roundScore(results)).toEqual({ correct: 1, total: 4 })
  })

  it('lists the missed chords once each, first miss first', () => {
    expect(missedChords(results)).toEqual([
      { id: 'Am', misses: 2 },
      { id: 'C', misses: 1 },
    ])
    expect(missedChords(results.slice(0, 1))).toEqual([])
  })
})

describe('guitar sound', () => {
  it('lets a string fall 60 dB in the ring time, whatever its pitch', () => {
    for (const frequency of [82.41, 329.63]) {
      const resonance = ringResonance(frequency, 2.4)
      expect(resonance).toBeLessThan(1)
      expect(20 * Math.log10(resonance ** (2.4 * frequency))).toBeCloseTo(-60, 6)
    }
  })
})
