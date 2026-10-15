/**
 * Strum on the beat (F18): when did each strum land against the click?
 * Pure, unit-tested in app/tests/strumTiming.test.js; StrumDrill.jsx plays
 * the clicks and hears the strums. All times are in milliseconds on one
 * clock (the page's performance.now(), with the mic's latency taken off).
 *
 * The mic can't tell a down-strum from an up-strum reliably, so only timing
 * is scored; the strum lane shows the motion instead.
 */

/** Within this many ms of the beat counts as on time (a beginner's window). */
export const ON_TIME_MS = 60
/** Share of beats on time that passes a step. */
export const PASS_SHARE = 0.8

/**
 * The drill's ladder: down-strums on muted strings, then on a chord, getting
 * faster, then down-up eighths. `per`: strums per beat (2 = eighths).
 * `muted`: the strings are deadened, so the strum doesn't have to ring.
 */
export const STRUM_STEPS = [
  { id: 'muted-60', title: 'Muted strums', text: 'Rest your fretting hand lightly on all six strings and strum down on every click.', bpm: 60, per: 1, muted: true },
  { id: 'em-60', title: 'E minor, 60', text: 'Hold E minor and strum down on every click.', bpm: 60, per: 1, muted: false },
  { id: 'em-80', title: 'E minor, 80', text: 'The same, a little faster.', bpm: 80, per: 1, muted: false },
  { id: 'em-100', title: 'E minor, 100', text: 'Faster again. Keep the arm loose.', bpm: 100, per: 1, muted: false },
  { id: 'em-eighths-70', title: 'Down-up, 70', text: 'Down on the click, up halfway between. Keep the hand moving.', bpm: 70, per: 2, muted: false },
]

export const COUNT_IN_BEATS = 4
export const SCORED_BARS = 4
export const BEATS_PER_BAR = 4

/** When to strum, in ms after the first count-in click, for a step: [{ time, beat, up }]. */
export function strumTargets(step, { bars = SCORED_BARS } = {}) {
  const beatMs = 60000 / step.bpm
  const targets = []
  for (let beat = 0; beat < bars * BEATS_PER_BAR; beat += 1) {
    for (let sub = 0; sub < step.per; sub += 1) {
      targets.push({ time: (COUNT_IN_BEATS + beat) * beatMs + (sub * beatMs) / step.per, beat, up: sub > 0 })
    }
  }
  return targets
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Match each target to the nearest strum within half the gap to its
 * neighbours, each strum used once: { results, onTime, total, offset, spread }.
 *   results[i]: { target, strum, offset, verdict: 'on' | 'early' | 'late' | 'missed' }
 *   offset: the median of the strums' offsets (negative = rushing), ms
 *   spread: their median distance from that, ms (steadiness)
 */
export function scoreStrums(targets, strums, { tolerance = ON_TIME_MS } = {}) {
  const sorted = [...strums].sort((a, b) => a - b)
  const used = new Set()
  const results = targets.map((target, i) => {
    const before = i > 0 ? target.time - targets[i - 1].time : Infinity
    const after = i + 1 < targets.length ? targets[i + 1].time - target.time : Infinity
    const reach = Math.min(before, after) / 2
    let best = null
    sorted.forEach((time, j) => {
      if (used.has(j) || Math.abs(time - target.time) > reach) return
      if (best === null || Math.abs(time - target.time) < Math.abs(sorted[best] - target.time)) best = j
    })
    if (best === null) return { target, strum: null, offset: null, verdict: 'missed' }
    used.add(best)
    const offset = sorted[best] - target.time
    const verdict = Math.abs(offset) <= tolerance ? 'on' : offset < 0 ? 'early' : 'late'
    return { target, strum: sorted[best], offset, verdict }
  })
  const offsets = results.filter((r) => r.offset !== null).map((r) => r.offset)
  const offset = offsets.length ? median(offsets) : null
  return {
    results,
    onTime: results.filter((r) => r.verdict === 'on').length,
    total: results.length,
    offset,
    spread: offsets.length ? median(offsets.map((o) => Math.abs(o - offset))) : null,
  }
}

export const passed = (score) => score.total > 0 && score.onTime / score.total >= PASS_SHARE

/** "you rush by about 40 ms" — the habit worth knowing, or null when it's within the on-time window. */
export function tendency(score) {
  if (score.offset === null || Math.abs(score.offset) <= ON_TIME_MS / 2) return null
  return `You ${score.offset < 0 ? 'rush' : 'drag'} by about ${Math.round(Math.abs(score.offset) / 10) * 10} ms.`
}
