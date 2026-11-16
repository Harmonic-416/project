import { isScored } from './songTimeline.js'
import { betterVerdict } from './noteJudge.js'

const NEIGHBOR_TIE_SECONDS = 0.06

/**
 * "Trouble spots" on a guitar song (pure, unit-tested): playback never
 * waits, and every pick or strum the mic hears is matched to the timeline
 * entry it belongs to and judged there. An entry's window is its start ±
 * `graceSeconds` (reaction time, latency), running at least `minWindow`
 * into the note. The nearest entry normally owns the onset. Confirmed
 * pitch can resolve a near tie between overlapping single-note windows. Once playback is
 * past a window, collect() settles that entry: its best verdict, or 'miss'
 * if nothing was heard. Same shape as the Vocal tab's tracker
 * (vocal/practice/practiceLogic.js), so the two modes read alike.
 */
export function createGuitarTroubleTracker(entries, { graceSeconds = 0.2, minWindow = 0.15, maxWindow = 0.6 } = {}) {
  const best = new Array(entries.length).fill(null)
  let first = 0 // first entry not settled yet

  const windowStart = (entry) => entry.time - graceSeconds
  const windowEnd = (entry) => entry.time + Math.min(Math.max(entry.duration, minWindow), maxWindow) + graceSeconds

  const candidatesAt = (time) => {
      const candidates = []
      for (let i = first; i < entries.length && windowStart(entries[i]) <= time; i += 1) {
        const entry = entries[i]
        if (time <= windowEnd(entry)) candidates.push(entry)
      }
      return candidates.sort((a, b) => Math.abs(time - a.time) - Math.abs(time - b.time))
  }

  return {
    /** The nearest in-window entry, or null. */
    entryFor(time) {
      return candidatesAt(time)[0] ?? null
    },

    /**
     * An onset at `time`: `judge(entry)` judges the heard audio against the
     * entry it belongs to. Returns { entry, result } or null.
     */
    addOnset(time, judge) {
      const [nearest, ...neighbors] = candidatesAt(time)
      let entry = nearest
      if (!entry || !isScored(entry)) return null
      let result = judge(entry)
      if (entry.kind === 'single' && result.verdict !== 'hit' && Number.isFinite(result.detected)) {
        const neighbor = neighbors.find((candidate) =>
          candidate.kind === 'single' && isScored(candidate) &&
          best[candidate.index]?.verdict !== 'hit' &&
          Math.abs(candidate.time - time) - Math.abs(nearest.time - time) <= NEIGHBOR_TIE_SECONDS &&
          Math.abs(candidate.notes[0].midi - result.detected) < 0.35)
        if (neighbor) {
          const alternate = judge(neighbor)
          if (alternate.verdict === 'hit') {
            entry = neighbor
            result = alternate
          }
        }
      }
      const prior = best[entry.index]
      if (!prior || (prior.verdict !== result.verdict && betterVerdict(prior.verdict, result.verdict) === result.verdict)) {
        best[entry.index] = result
      }
      return { entry, result }
    },

    /** Settle every entry whose window closed before `time`: [{ entry, verdict }]. */
    collect(time) {
      const settled = []
      while (first < entries.length && windowEnd(entries[first]) < time) {
        const entry = entries[first]
        const result = best[first]
        const verdict = isScored(entry) ? result?.verdict ?? 'miss' : 'skipped'
        settled.push({ entry, verdict, result })
        first += 1
      }
      return settled
    },

    /**
     * Jump (seek, loop) to `time`: entries that started before it are
     * dropped without a verdict (one already sounding can't be played in
     * time any more), later ones start fresh.
     */
    skipTo(time) {
      first = 0
      while (first < entries.length && entries[first].time + graceSeconds < time) first += 1
      best.fill(null, first)
    },
  }
}

/** { hit, close, missed, scored } for the summary. */
export function troubleSummary(verdicts) {
  const counts = { hit: 0, close: 0, missed: 0, scored: 0 }
  for (const verdict of verdicts) {
    if (verdict === 'hit') counts.hit += 1
    else if (verdict === 'close') counts.close += 1
    else if (verdict === 'miss') counts.missed += 1
    if (verdict && verdict !== 'skipped') counts.scored += 1
  }
  return counts
}
