import { CHORDS } from '../practice/chords.js'

/**
 * Ear training (F41): the app plays a chord and the learner picks what they
 * heard from a few answers. Quality comes first, as in ear-training courses:
 * "Major or minor?" trains hearing the major vs. minor third, then "Which
 * chord?" names it among four. No microphone. Pure, unit-tested in
 * app/tests/earTraining.test.js; Exercises.jsx owns the sound.
 *
 *   status: 'idle' → 'asking' → 'answered' → 'asking' … → 'done'
 *   questions[i]: { answer: chord, choices: string[], correct: string }
 *                 choices are 'major' / 'minor', or chord ids
 *   results[i]: { answer: chordId, picked, correct: boolean }
 */

export const LEVELS = [
  { id: 'quality', title: 'Major or minor?', text: 'Hear whether a chord sounds bright or dark', choices: 2 },
  { id: 'chord', title: 'Which chord?', text: 'Name it from four of the chords you are learning', choices: 4 },
]

export const QUALITIES = ['major', 'minor']
export const QUESTIONS_PER_ROUND = 10

const pickOne = (items, random) => items[Math.floor(random() * items.length)]

/** A shuffled copy (Fisher–Yates). */
function shuffle(items, random) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * A round of questions, made up front so the reducer stays pure. A quality
 * question picks major or minor 50/50 before the chord, so always guessing
 * the commoner one (4 of the 6 chords are major) doesn't pay. The same chord
 * never comes twice in a row.
 */
export function makeRound(levelId, { pool = CHORDS, count = QUESTIONS_PER_ROUND, random = Math.random } = {}) {
  const level = LEVELS.find((l) => l.id === levelId)
  const questions = []
  let previous = null
  for (let i = 0; i < count; i += 1) {
    let candidates = pool.filter((chord) => chord !== previous)
    if (level.id === 'quality') {
      const quality = pickOne(QUALITIES, random)
      const ofQuality = candidates.filter((chord) => chord.quality === quality)
      if (ofQuality.length) candidates = ofQuality
    }
    const answer = pickOne(candidates, random)
    if (level.id === 'quality') {
      questions.push({ answer, choices: [...QUALITIES], correct: answer.quality })
    } else {
      const others = shuffle(pool.filter((chord) => chord !== answer), random).slice(0, level.choices - 1)
      const choices = shuffle([answer, ...others], random).map((chord) => chord.id)
      questions.push({ answer, choices, correct: answer.id })
    }
    previous = answer
  }
  return questions
}

export function initialExercise() {
  return { status: 'idle', level: null, questions: [], index: 0, results: [] }
}

export function exerciseReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { ...initialExercise(), status: 'asking', level: action.level, questions: action.questions }

    case 'answer': {
      // One answer per question; taps after the first are ignored.
      if (state.status !== 'asking') return state
      const question = state.questions[state.index]
      const result = { answer: question.answer.id, picked: action.choice, correct: action.choice === question.correct }
      return { ...state, status: 'answered', results: [...state.results, result] }
    }

    case 'next':
      if (state.status !== 'answered') return state
      return state.index + 1 >= state.questions.length
        ? { ...state, status: 'done' }
        : { ...state, status: 'asking', index: state.index + 1 }

    case 'reset':
      return initialExercise()

    default:
      return state
  }
}

/** { correct, total } for the end of a round. */
export function roundScore(results) {
  return { correct: results.filter((r) => r.correct).length, total: results.length }
}

/** Chords answered wrong, in the order they first came up: [{ id, misses }]. */
export function missedChords(results) {
  const misses = new Map()
  for (const result of results) {
    if (!result.correct) misses.set(result.answer, (misses.get(result.answer) ?? 0) + 1)
  }
  return [...misses].map(([id, count]) => ({ id, misses: count }))
}
