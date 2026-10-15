import { afterEach, describe, expect, it } from 'vitest'
import { parseChordName } from '../src/tabs/guitar/practice/chordNames.js'
import { CHORDS, chordMidi } from '../src/tabs/guitar/practice/chords.js'
import { ringResonance } from '../src/tabs/guitar/practice/chordSound.js'
import {
  DEFAULT_PICKS,
  LEVELS,
  QUALITIES,
  QUALITY_POOL,
  QUESTIONS_PER_ROUND,
  accuracy,
  exerciseReducer,
  initialExercise,
  loadPicks,
  loadStats,
  makeRound,
  missWeights,
  missedChords,
  recordAnswer,
  roundScore,
  savePicks,
  saveStats,
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

const run = (actions, state = initialExercise()) => actions.reduce(exerciseReducer, state)

describe('chord quality (F41)', () => {
  it('each major, minor and seventh shape sounds its third, and a seventh its flat seventh', () => {
    for (const chord of QUALITY_POOL) {
      const root = parseChordName(chord.id).pitchClass
      const pitchClasses = new Set(chordMidi(chord).map((midi) => midi % 12))
      const third = chord.quality === 'minor' ? 3 : 4
      expect(pitchClasses.has((root + third) % 12), chord.id).toBe(true)
      expect(pitchClasses.has((root + 7 - third) % 12), chord.id).toBe(false) // not the other third
      expect(pitchClasses.has((root + 10) % 12), chord.id).toBe(chord.quality === '7')
    }
  })

  it('has major, minor and seventh chords to ask about', () => {
    expect(new Set(QUALITY_POOL.map((c) => c.quality))).toEqual(new Set(QUALITIES))
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

  it('quality: the answer is the chord’s quality, offered as Major | Minor | Seventh', () => {
    for (const q of makeRound('quality', { random: seeded(2) })) {
      expect(q.choices).toEqual(['major', 'minor', '7'])
      expect(q.correct).toBe(q.answer.quality)
    }
  })

  it('quality: each kind about a third of the time, however many shapes each has', () => {
    const answers = Array.from({ length: 100 }, (_, seed) => makeRound('quality', { random: seeded(seed) })).flat()
    for (const quality of QUALITIES) {
      const share = answers.filter((q) => q.correct === quality).length / answers.length
      expect(share, quality).toBeGreaterThan(0.27)
      expect(share, quality).toBeLessThan(0.4)
    }
  })

  it('chord: only the chords in the pool, with fewer choices when the pool is small', () => {
    const pool = CHORDS.filter((c) => ['G', 'C'].includes(c.id))
    for (const q of makeRound('chord', { pool, random: seeded(4) })) {
      expect(['G', 'C']).toContain(q.answer.id)
      expect([...q.choices].sort()).toEqual(['C', 'G'])
    }
  })

  // Never twice in a row caps it: with C weighted 3 among four chords, C is asked 3/8 of the time and each other 5/24.
  it('chord: a chord weighted 3 comes up about 1.8 times as often as one weighted 1', () => {
    const pool = CHORDS.filter((c) => ['G', 'C', 'D', 'Em'].includes(c.id))
    const asked = Array.from({ length: 200 }, (_, seed) => makeRound('chord', { pool, weights: { C: 3 }, random: seeded(seed) }))
      .flat()
      .map((q) => q.answer.id)
    const count = (id) => asked.filter((a) => a === id).length
    expect(count('C') / count('G')).toBeGreaterThan(1.5)
    expect(count('C') / count('G')).toBeLessThan(2.2)
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

describe('how the player does on each chord', () => {
  afterEach(() => {
    delete globalThis.localStorage
  })

  it('counts right and wrong answers per chord', () => {
    let stats = recordAnswer({}, 'C', true)
    stats = recordAnswer(stats, 'C', false)
    stats = recordAnswer(stats, 'G', true)
    expect(stats).toEqual({ C: { right: 1, wrong: 1 }, G: { right: 1, wrong: 0 } })
    expect(accuracy(stats.C)).toBe(0.5)
    expect(accuracy(undefined)).toBeNull()
  })

  it('weights the chords missed most: 1 when always right, up to 3 when always wrong', () => {
    expect(missWeights({ G: { right: 4, wrong: 0 }, C: { right: 1, wrong: 1 }, D: { right: 0, wrong: 2 } })).toEqual({ G: 1, C: 2, D: 3 })
  })

  it('remembers the stats and the picked chords, with the common open chords by default', () => {
    const store = new Map()
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
    expect(loadPicks()).toEqual(DEFAULT_PICKS)
    expect(loadStats()).toEqual({})
    savePicks(['G', 'C', 'D7'])
    saveStats({ C: { right: 2, wrong: 1 } })
    expect(loadPicks()).toEqual(['G', 'C', 'D7'])
    expect(loadStats()).toEqual({ C: { right: 2, wrong: 1 } })
    savePicks(['G']) // too few, or unknown chords: back to the default
    expect(loadPicks()).toEqual(DEFAULT_PICKS)
    savePicks(['G', 'Xyz'])
    expect(loadPicks()).toEqual(DEFAULT_PICKS)
  })
})
