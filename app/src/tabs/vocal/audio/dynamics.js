/**
 * Dynamics (F19): how loudly the singer is singing and whether it is rising
 * or falling, from the level of the frames the pitch tracker already hears
 * (each sample's `rms`). Pure functions, no audio graph, so they run in Node.
 *
 * Levels are dBFS of the microphone signal, so they say nothing absolute
 * (a louder mic reads louder); what they do say is the change: a crescendo
 * is the level climbing several dB over a stretch of singing, not one
 * note's attack. The live tracker gives the meter and the arrow while
 * singing; summarizeDynamics gives the after-the-attempt line.
 */

// The meter's ends: quiet singing a step from the mic, and close to clipping.
export const METER_FLOOR_DB = -50
export const METER_CEIL_DB = -6
// A change of this many dB over a stretch of singing is a crescendo / diminuendo…
export const SWING_DB = 6
// …if it takes at least this long (a note's attack is quicker).
export const MIN_SWING_SEC = 0.6
// A gap longer than this (a breath, a rest) starts a new phrase.
const PHRASE_GAP_SEC = 0.5

export function levelDb(rms) {
  return 20 * Math.log10(Math.max(rms, 1e-6))
}

/** A dB level as 0…1 along the meter. */
export function meterFraction(db) {
  return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / (METER_CEIL_DB - METER_FLOOR_DB)))
}

/**
 * Live dynamics: push(time in seconds, rms) for every sung frame, and read
 * { db, trend } back, trend 'rising' | 'falling' | 'steady' from the slope of
 * the level over the last `windowSec` of singing. Silence longer than a
 * breath clears the window, so the next phrase starts steady; read(now)
 * during such a silence gives null.
 */
export function createDynamicsTracker({ windowSec = 0.8, slopeDbPerSec = 5 } = {}) {
  let frames = [] // { time, db }
  let smoothed = null
  return {
    push(time, rms) {
      const last = frames.at(-1)
      if (last && time - last.time > PHRASE_GAP_SEC) {
        frames = []
        smoothed = null
      }
      const db = levelDb(rms)
      smoothed = smoothed === null ? db : smoothed + 0.25 * (db - smoothed)
      frames.push({ time, db: smoothed })
      while (frames.length && frames[0].time < time - windowSec) frames.shift()
      return this.read(time)
    },
    read(now = frames.at(-1)?.time) {
      if (smoothed === null || !frames.length || now - frames.at(-1).time > PHRASE_GAP_SEC) return null
      const slope = slopeOf(frames)
      const span = frames.length ? frames.at(-1).time - frames[0].time : 0
      // Half a window of singing before calling a direction.
      const trend = span < windowSec / 2 ? 'steady' : slope > slopeDbPerSec ? 'rising' : slope < -slopeDbPerSec ? 'falling' : 'steady'
      return { db: smoothed, trend }
    },
    reset() {
      frames = []
      smoothed = null
    },
  }
}

/** Least-squares slope of db over time, dB per second. */
function slopeOf(frames) {
  const n = frames.length
  if (n < 2) return 0
  let st = 0
  let sd = 0
  for (const f of frames) {
    st += f.time
    sd += f.db
  }
  const mt = st / n
  const md = sd / n
  let num = 0
  let den = 0
  for (const f of frames) {
    num += (f.time - mt) * (f.db - md)
    den += (f.time - mt) ** 2
  }
  return den ? num / den : 0
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]
}

/**
 * The level of an attempt in steps of `binSec`: one { time, db } per bin
 * that has singing (the median frame, so one loud consonant doesn't count),
 * grouped into phrases split at breaths.
 */
export function levelCurve(samples, { binSec = 0.2 } = {}) {
  const bins = new Map()
  for (const s of samples) {
    if (!(s.rms > 0) || !Number.isFinite(s.time)) continue
    const key = Math.floor(s.time / binSec)
    if (!bins.has(key)) bins.set(key, [])
    bins.get(key).push(levelDb(s.rms))
  }
  const phrases = []
  let phrase = null
  for (const key of [...bins.keys()].sort((a, b) => a - b)) {
    const dbs = bins.get(key).sort((a, b) => a - b)
    const point = { time: (key + 0.5) * binSec, db: percentile(dbs, 0.5) }
    if (!phrase || point.time - phrase.at(-1).time > PHRASE_GAP_SEC + binSec) {
      phrase = []
      phrases.push(phrase)
    }
    phrase.push(point)
  }
  // Smooth each phrase over three bins.
  return phrases.map((points) =>
    points.map((p, i) => {
      const near = points.slice(Math.max(0, i - 1), i + 2)
      return { time: p.time, db: near.reduce((sum, q) => sum + q.db, 0) / near.length }
    }),
  )
}

/**
 * The swings in one phrase: alternating peaks and troughs at least
 * `swingDb` apart, kept when they take at least `minSec` to happen.
 * Each is { kind: 'crescendo' | 'diminuendo', from, to (seconds), changeDb }.
 */
function phraseSwings(points, swingDb, minSec) {
  const swings = []
  if (points.length < 2) return swings
  let pivot = null // the last confirmed peak or trough
  let extreme = null // the furthest point since it, in the current direction
  let dir = 0 // +1 climbing, -1 falling, 0 not yet known
  // Until the first swing shows which way the phrase goes, the quietest and loudest so far.
  let low = points[0]
  let high = points[0]
  const close = (to) => {
    const change = to.db - pivot.db
    if (Math.abs(change) >= swingDb && to.time - pivot.time >= minSec) {
      swings.push({ kind: change > 0 ? 'crescendo' : 'diminuendo', from: pivot.time, to: to.time, changeDb: change })
    }
  }
  for (const p of points.slice(1)) {
    if (dir === 0) {
      if (p.db >= low.db + swingDb) [dir, pivot, extreme] = [1, low, p]
      else if (p.db <= high.db - swingDb) [dir, pivot, extreme] = [-1, high, p]
      else {
        if (p.db < low.db) low = p
        if (p.db > high.db) high = p
      }
      continue
    }
    if ((dir > 0 && p.db >= extreme.db) || (dir < 0 && p.db <= extreme.db)) {
      extreme = p
    } else if (Math.abs(extreme.db - p.db) >= swingDb) {
      close(extreme)
      pivot = extreme
      extreme = p
      dir = -dir
    }
  }
  if (dir !== 0) close(extreme)
  return swings
}

/**
 * After an attempt: { rangeDb (softest to loudest singing, 10th to 90th
 * percentile), softestDb, loudestDb, swings, crescendos, diminuendos } from
 * its pitch samples ({ time, rms }), or null when there wasn't enough singing.
 */
export function summarizeDynamics(samples, { swingDb = SWING_DB, minSec = MIN_SWING_SEC } = {}) {
  const phrases = levelCurve(samples)
  const all = phrases.flat().map((p) => p.db).sort((a, b) => a - b)
  if (all.length < 5) return null
  const softestDb = percentile(all, 0.1)
  const loudestDb = percentile(all, 0.9)
  const swings = phrases.flatMap((points) => phraseSwings(points, swingDb, minSec))
  return {
    rangeDb: loudestDb - softestDb,
    softestDb,
    loudestDb,
    swings,
    crescendos: swings.filter((s) => s.kind === 'crescendo').length,
    diminuendos: swings.filter((s) => s.kind === 'diminuendo').length,
  }
}

/** One line for the result panel. */
export function describeDynamics(summary) {
  if (!summary) return null
  const range = Math.round(summary.rangeDb)
  const parts = []
  if (summary.crescendos) parts.push(`${summary.crescendos} ${summary.crescendos === 1 ? 'crescendo' : 'crescendos'}`)
  if (summary.diminuendos) parts.push(`${summary.diminuendos} ${summary.diminuendos === 1 ? 'diminuendo' : 'diminuendos'}`)
  const swings = parts.length ? parts.join(', ') : 'no clear swells or fades'
  if (range < 4) return `Dynamics: an even volume throughout (${range} dB softest to loudest) · ${swings}`
  return `Dynamics: ${range} dB from softest to loudest · ${swings}`
}
