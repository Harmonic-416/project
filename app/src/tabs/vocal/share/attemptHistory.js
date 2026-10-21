/**
 * Pure helpers for an opened attempt's history: the singer's other tries
 * at the same song, their trend, and the score line's wording.
 * Unit-tested in app/tests/attemptHistory.test.js.
 */

const pct = (accuracy) => Math.round(Number(accuracy))

/**
 * `attempts` newest first (listSongAttempts'), each with `change`: points
 * up or down from the try before it (null for the first), and `best`:
 * whether it is the highest score (the earliest such try, on a tie).
 */
export function withTrend(attempts) {
  let bestId = null
  let bestScore = -Infinity
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    const score = pct(attempts[i].accuracy)
    if (score > bestScore) {
      bestScore = score
      bestId = attempts[i].id
    }
  }
  return attempts.map((attempt, i) => {
    const before = attempts[i + 1]
    return {
      ...attempt,
      change: before ? pct(attempt.accuracy) - pct(before.accuracy) : null,
      best: attempt.id === bestId,
    }
  })
}

/** { tries, best, latest, first } scores (whole percents) of `attempts` newest first, or null for none. */
export function historySummary(attempts) {
  if (!attempts.length) return null
  return {
    tries: attempts.length,
    best: Math.max(...attempts.map((a) => pct(a.accuracy))),
    latest: pct(attempts[0].accuracy),
    first: pct(attempts.at(-1).accuracy),
  }
}

/** "+12" / "−5" / "±0" for a change in points, or '' for none. */
export function formatChange(change) {
  if (change === null || change === undefined) return ''
  if (change > 0) return `+${change}`
  if (change < 0) return `−${Math.abs(change)}`
  return '±0'
}

/**
 * The score line, saying what each number counts: the percent is how much
 * of what was sung was in tune; the counts are over the whole part, so a
 * short try can be "80% in tune" with most notes not sung yet.
 * `notes` is judgeNotes' ({ hit, missed, total }) or null.
 */
export function scoreLine(accuracy, notes) {
  const headline = `${pct(accuracy)}% in tune`
  if (!notes || !notes.total) return { headline, detail: 'of what you sang' }
  const parts = [`of what you sang · ${notes.hit.length} of ${notes.total} notes sung`]
  if (notes.missed.length) parts.push(`${notes.missed.length} missed (red)`)
  return { headline, detail: parts.join(' · ') }
}
