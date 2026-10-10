import { UNSCORED_TECHNIQUES } from './songTimeline.js'

/**
 * "Wait for me" on a guitar song (pure, unit-tested): the song stops on each
 * note or chord until it's played, like the Vocal tab's Wait for me (F13).
 * Wrong tries are counted but never move on; only the right note, or Skip,
 * does. Unlike the chord lessons (practice/practiceState.js), there is no
 * auto-skip. Retry clears the count. Notes the live judge can't score
 * (UNSCORED_TECHNIQUES) are passed over and marked 'skipped'.
 *
 *   results[i]: 'hit'     – played first try
 *               'close'   – played after a wrong try
 *               'miss'    – passed with Skip
 *               'skipped' – not scored
 *   misses: wrong tries on the current entry
 *   heard: the last judgement for the current entry, or null
 */

/** Wrong tries on one note after which the screen points at Hint and Skip. */
export const NUDGE_AFTER = 3

export function initialWait(entries) {
  return advance(entries, { index: 0, misses: 0, results: [], heard: null }, 0)
}

/** Move to `index`, passing over notes that aren't scored. */
function advance(entries, state, index) {
  const results = [...state.results]
  let i = index
  while (i < entries.length && UNSCORED_TECHNIQUES.has(entries[i].technique)) {
    results[i] = 'skipped'
    i += 1
  }
  return { index: i, misses: 0, results, heard: null }
}

export function isDone(entries, state) {
  return entries.length > 0 && state.index >= entries.length
}

export function waitReducer(entries) {
  return (state, action) => {
    if (action.type === 'reset') return initialWait(entries)
    if (action.type === 'goto') {
      const results = state.results.slice(0, action.index)
      return advance(entries, { ...state, results }, Math.max(0, Math.min(action.index, entries.length - 1)))
    }
    if (isDone(entries, state)) return state

    switch (action.type) {
      case 'judged': {
        const { result } = action
        if (result.verdict === 'skipped') return state
        if (result.verdict === 'hit') {
          const results = [...state.results]
          results[state.index] = state.misses ? 'close' : 'hit'
          return advance(entries, { ...state, results }, state.index + 1)
        }
        return { ...state, misses: state.misses + 1, heard: result }
      }
      case 'skip': {
        const results = [...state.results]
        results[state.index] = 'miss'
        return advance(entries, { ...state, results }, state.index + 1)
      }
      case 'retry':
        return { ...state, misses: 0, heard: null }
      default:
        return state
    }
  }
}

/** { firstTry, afterRetry, missed, scored } for the summary. */
export function waitSummary(results) {
  const counts = { firstTry: 0, afterRetry: 0, missed: 0, scored: 0 }
  for (const r of results) {
    if (r === 'hit') counts.firstTry += 1
    else if (r === 'close') counts.afterRetry += 1
    else if (r === 'miss') counts.missed += 1
    if (r && r !== 'skipped') counts.scored += 1
  }
  return counts
}
