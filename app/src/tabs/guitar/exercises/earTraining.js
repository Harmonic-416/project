import { CHORDS } from '../practice/chords.js'

/**
 * Ear training (F41): the app plays a chord and the player picks what they
 * heard. Three levels, as ear-training courses and apps order them:
 *   - "What kind of chord?": major, minor or seventh, the chord's character;
 *   - "Which chord?": name it among the chords the player picked to train,
 *     the ones they keep missing coming up more often;
 *   - "Chords from my song": the same, with the chords of the last song
 *     they opened in Songs (practice/chordNames.js).
 * No microphone. Pure apart from the storage helpers, unit-tested in
 * app/tests/earTraining.test.js; EarTraining.jsx owns the sound.
 *
 *   status: 'idle' → 'asking' → 'answered' → 'asking' … → 'done'
 *   questions[i]: { answer: chord, choices: string[], correct: string }
 *                 choices are qualities ('major', 'minor', '7') or chord ids
 *   results[i]: { answer: chordId, picked, correct: boolean }
 */

export const LEVELS = [
  { id: 'quality', title: 'What kind of chord?', text: 'Major, minor or seventh: hear its character', choices: 3 },
  { id: 'chord', title: 'Which chord?', text: 'Name it among the chords you pick to train', choices: 4 },
  { id: 'song', title: 'Chords from my song', text: 'The chords of the last song you opened', choices: 4 },
]

export const QUALITIES = ['major', 'minor', '7']
export const QUESTIONS_PER_ROUND = 10

/** The chords the quality level draws from: every major, minor and seventh shape. */
export const QUALITY_POOL = CHORDS.filter((chord) => QUALITIES.includes(chord.quality))

/** "Which chord?" until the player picks their own: the common open chords. */
export const DEFAULT_PICKS = ['Em', 'Am', 'C', 'G', 'D', 'E', 'A', 'Dm']

/** Fewest chords a "Which chord?" round can be made from. */
export const MIN_POOL = 2

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
  { pool = levelId === 'quality' ? QUALITY_POOL : CHORDS, weights = {}, count = QUESTIONS_PER_ROUND, random = Math.random } = {},
) {
  const level = LEVELS.find((l) => l.id === levelId)
  const qualities = QUALITIES.filter((quality) => pool.some((chord) => chord.quality === quality))
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
    const answer = pickWeighted(candidates, (chord) => weights[chord.id] ?? 1, random)
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

const STATS_KEY = 'harmonic.guitar.earStats'
const PICKS_KEY = 'harmonic.guitar.earChords'

function load(key, fallback, valid) {
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(key) ?? 'null')
    return valid(saved) ? saved : fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private window or blocked storage: it lasts until reload.
  }
}

export const loadStats = () => load(STATS_KEY, {}, (v) => v && typeof v === 'object' && !Array.isArray(v))
export const saveStats = (stats) => save(STATS_KEY, stats)

/** The chord ids picked for "Which chord?", in CHORDS order. */
export const loadPicks = () =>
  load(PICKS_KEY, DEFAULT_PICKS, (v) => Array.isArray(v) && v.length >= MIN_POOL && v.every((id) => CHORDS.some((c) => c.id === id)))
export const savePicks = (ids) => save(PICKS_KEY, ids)

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
