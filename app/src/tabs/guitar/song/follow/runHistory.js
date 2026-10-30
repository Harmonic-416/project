import { isScored } from './songTimeline.js'

/**
 * Guitar run history (pure, unit-tested; change: guitar-run-history, F22).
 * Each finished Wait for me or Trouble spots run is saved as an attempt
 * (vocal/components/ShareAttempt) with a verdict per timeline entry; these
 * helpers turn a run into what is saved and the saved runs into the song's
 * "Last run · best" line.
 */

/** Whether a run judged every scored note of the song: from the first note to the end, nothing seeked past. */
export function isFullRun(entries, verdicts) {
  const scored = entries.filter(isScored)
  return scored.length > 0 && scored.every((entry) => verdicts?.[entry.index] && verdicts[entry.index] !== 'skipped')
}

/** A Wait for me run's results as saved verdicts: one per entry, null where it never got to. */
export function waitVerdicts(entries, results) {
  return entries.map((entry) => results[entry.index] ?? null)
}

/** A Wait for me run's score: the share of its notes played first try (waitState.waitSummary). */
export function waitAccuracy(summary) {
  return summary.scored ? (summary.firstTry / summary.scored) * 100 : 0
}

/** { last, best, count } from saved full runs, newest first (listSongScores), or null with none. */
export function lastAndBest(rows) {
  if (!rows?.length) return null
  const scores = rows.map((row) => Number(row.accuracy))
  const round = (n) => Math.round(n)
  return { last: round(scores[0]), best: round(Math.max(...scores)), count: scores.length }
}

/** "Last run 78% · best 85% (6 runs)", or the line before the first full run. */
export function lastAndBestLine(stats) {
  if (!stats) return 'No full runs yet: play from the first note to the end to start your history.'
  if (stats.count === 1) return `Last run ${stats.last}%`
  return `Last run ${stats.last}% · best ${stats.best}% (${stats.count} runs)`
}
