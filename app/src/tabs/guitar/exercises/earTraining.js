import { CHORDS } from '../practice/chords.js'

/** Ear training has two levels and six beginner shapes. Results are memory-only. */
export const LEVELS = [
  { id: 'quality', title: 'Major or minor?', text: 'Hear the character of a beginner chord', choices: 2 },
  { id: 'chord', title: 'Which chord?', text: 'Recognise the chord by name', choices: 4 },
]
export const QUALITIES = ['major', 'minor']
export const QUESTIONS_PER_ROUND = 10
export const DEFAULT_PICKS = ['Em', 'Am', 'C', 'G', 'D', 'E']
export const QUALITY_POOL = CHORDS.filter((chord) => DEFAULT_PICKS.includes(chord.id))
/** Four distinct names are required for every chord question. */
export const MIN_POOL = 4

const pickOne = (items, random) => items[Math.floor(random() * items.length)]

/** One of `items`, each as likely as its weight. */
function pickWeighted(items, weightOf, random) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0)
  let left = random() * total
  for (const item of items) {
    left -= weightOf(item)
    if (left < 0) return item
  }
  return items[items.length - 1]
}

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
 * question picks its quality first, evenly, so always guessing the commoner
 * one doesn't pay. A chord question picks its answer by `weights` (chord id
 * → weight, 1 when missing; see missWeights), among up to four choices from
 * `pool`. The same chord never comes twice in a row.
 */
export function makeRound(
  levelId,
  { pool = QUALITY_POOL, weights = {}, count = QUESTIONS_PER_ROUND, random = Math.random } = {},
) {
  const level = LEVELS.find((l) => l.id === levelId)
  if (!level || !Number.isInteger(count) || count < 1) return []
  pool = [...new Map(pool.filter((chord) => QUALITY_POOL.some((known) => known.id === chord?.id)).map((chord) => [chord.id, chord])).values()]
  if (pool.length < MIN_POOL) return []
  const qualities = QUALITIES.filter((quality) => pool.some((chord) => chord.quality === quality))
  if (levelId === 'quality' && qualities.length < 2) return []
  const questions = []
  let previous = null
  for (let i = 0; i < count; i += 1) {
    const candidates = pool.filter((chord) => chord !== previous)
    if (level.id === 'quality') {
      const quality = pickOne(qualities, random)
      const ofQuality = candidates.filter((chord) => chord.quality === quality)
      const answer = pickOne(ofQuality.length ? ofQuality : candidates, random)
      questions.push({ answer, choices: [...qualities], correct: answer.quality })
      previous = answer
      continue
    }
    const answer = pickWeighted(candidates, (chord) => Number.isFinite(weights[chord.id]) && weights[chord.id] > 0 ? weights[chord.id] : 1, random)
    const others = shuffle(pool.filter((chord) => chord !== answer), random).slice(0, Math.min(level.choices, pool.length) - 1)
    const choices = shuffle([answer, ...others], random).map((chord) => chord.id)
    questions.push({ answer, choices, correct: answer.id })
    previous = answer
  }
  return questions
}

// ── How the player does on each chord, and which chords they train ──────

/** Stats after one answer: { [chordId]: { right, wrong } }. */
export function recordAnswer(stats, chordId, correct) {
  const { right = 0, wrong = 0 } = stats[chordId] ?? {}
  return { ...stats, [chordId]: correct ? { right: right + 1, wrong } : { right, wrong: wrong + 1 } }
}

/** Share of a chord's answers that were right, or null before it's been asked. */
export function accuracy(stat) {
  const asked = (stat?.right ?? 0) + (stat?.wrong ?? 0)
  return asked ? stat.right / asked : null
}

/** Weights for makeRound: a chord missed every time comes up three times as often as one never missed. */
export function missWeights(stats) {
  return Object.fromEntries(Object.entries(stats).map(([id, stat]) => [id, 1 + 2 * (1 - (accuracy(stat) ?? 1))]))
}

/** Remove results retained by older versions; never read them into a new visit. */
export function clearLegacyEarResults() {
  try {
    if (globalThis.localStorage.getItem('harmonic.guitar.earStats') !== null) globalThis.localStorage.removeItem('harmonic.guitar.earStats')
  } catch {
    // New results still stay in memory when browser storage is inaccessible.
  }
}

export function initialExercise() {
  return { status: 'idle', level: null, questions: [], index: 0, results: [] }
}

export function exerciseReducer(state, action) {
  switch (action.type) {
    case 'start':
      if (!LEVELS.some((level) => level.id === action.level) || !action.questions?.length) return state
      return { ...initialExercise(), status: 'asking', level: action.level, questions: action.questions }

    case 'answer': {
      // One answer per question; taps after the first are ignored.
      if (state.status !== 'asking') return state
      const question = state.questions[state.index]
      if (!question?.choices.includes(action.choice)) return state
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
