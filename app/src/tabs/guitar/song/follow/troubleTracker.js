import { UNSCORED_TECHNIQUES } from './songTimeline.js'
import { betterVerdict } from './noteJudge.js'

/**
 * "Trouble spots" on a guitar song (pure, unit-tested): playback never
 * waits, and every pick or strum the mic hears is matched to the timeline
 * entry it belongs to and judged there. An entry's window is its start ±
 * `graceSeconds` (reaction time, latency), running at least `minWindow`
 * into the note; an onset goes to the window's entry whose start is
 * nearest, so a late note isn't credited to the next one. Once playback is
 * past a window, collect() settles that entry: its best verdict, or 'miss'
 * if nothing was heard. Same shape as the Vocal tab's tracker
 * (vocal/practice/practiceLogic.js), so the two modes read alike.
 */
export function createGuitarTroubleTracker(entries, { graceSeconds = 0.2, minWindow = 0.15, maxWindow = 0.6 } = {}) {
  const best = new Array(entries.length).fill(null)
  let first = 0 // first entry not settled yet

  const windowStart = (entry) => entry.time - graceSeconds
  const windowEnd = (entry) => entry.time + Math.min(Math.max(entry.duration, minWindow), maxWindow) + graceSeconds

  return {
    /** The entry an onset at `time` (song seconds) belongs to, or null. */
    entryFor(time) {
      let pick = null
      for (let i = first; i < entries.length && windowStart(entries[i]) <= time; i += 1) {
        const entry = entries[i]
        if (time > windowEnd(entry)) continue
        if (!pick || Math.abs(time - entry.time) < Math.abs(time - pick.time)) pick = entry
      }
      return pick
    },

    /**
     * An onset at `time`: `judge(entry)` judges the heard audio against the
     * entry it belongs to. Returns { entry, result } or null.
     */
    addOnset(time, judge) {
      const entry = this.entryFor(time)
      if (!entry || UNSCORED_TECHNIQUES.has(entry.technique)) return null
      const result = judge(entry)
      best[entry.index] = betterVerdict(best[entry.index], result.verdict)
      return { entry, result }
    },

    /** Settle every entry whose window closed before `time`: [{ entry, verdict }]. */
    collect(time) {
      const settled = []
      while (first < entries.length && windowEnd(entries[first]) < time) {
        const entry = entries[first]
        const verdict = UNSCORED_TECHNIQUES.has(entry.technique) ? 'skipped' : best[first] ?? 'miss'
        settled.push({ entry, verdict })
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
