import { ticksToSeconds } from './songTimeline.js'

/**
 * Where in the song (seconds, at the score's own tempo) a moment on the page
 * clock (performance.now()) falls. alphaTab plays on its own AudioContext and
 * reports progress from the audio it has actually played; the microphone
 * runs on another. Both are mapped onto performance.now(): alphaTab's
 * position events become anchors here, mic frames are stamped as they
 * arrive (useGuitarListener), and the calibrated latency (output + input,
 * measured by LatencyCalibration) is taken off before asking.
 *
 * Ticks, not alphaTab's millisecond `currentTime`, are the anchor: that time
 * runs at the playback speed, while ticks map to the score's seconds through
 * the tempo map (songTimeline.js). Pure, unit-tested in Node.
 */
const MAX_EXTRAPOLATION_MS = 300 // past the last anchor, assume the audio stalled

/** During finalization, use the end of playback even if the player has rewound. */
export function finishedOnsetTime(finish, onsetWall, latencyMs, speed) {
  const corrected = onsetWall - latencyMs
  if (corrected > finish.wall) return null
  return finish.seconds + ((corrected - finish.wall) / 1000) * speed
}

export function createSongClock(tempoMap) {
  let anchor = null // { wall, seconds, speed, playing }
  return {
    /** One alphaTab position event, seen at `wall` (ms). */
    update({ wall, tick, speed = 1, playing }) {
      anchor = { wall, seconds: ticksToSeconds(tempoMap, tick), speed, playing }
    },
    /** Song seconds at `wall` (ms), or null before the first position. */
    secondsAt(wall) {
      if (!anchor) return null
      if (!anchor.playing) return anchor.seconds
      const elapsed = Math.min(wall - anchor.wall, MAX_EXTRAPOLATION_MS)
      return anchor.seconds + (elapsed / 1000) * anchor.speed
    },
    get playing() {
      return Boolean(anchor?.playing)
    },
    reset() {
      anchor = null
    },
  }
}

/**
 * Song seconds at `wall` from a run's recorded anchors ([{ wall, seconds }],
 * ascending), interpolating between them and extrapolating at `speed`
 * outside them. Used to place a recording's notes after the run.
 */
export function songTimeAtWall(anchors, wall, speed = 1) {
  if (!anchors.length) return null
  if (wall <= anchors[0].wall) return anchors[0].seconds + ((wall - anchors[0].wall) / 1000) * speed
  const last = anchors[anchors.length - 1]
  if (wall >= last.wall) return last.seconds + ((wall - last.wall) / 1000) * speed
  let lo = 0
  let hi = anchors.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (anchors[mid].wall <= wall) lo = mid
    else hi = mid
  }
  const a = anchors[lo]
  const b = anchors[hi]
  return a.seconds + ((wall - a.wall) / (b.wall - a.wall)) * (b.seconds - a.seconds)
}

// ── Latency ──────────────────────────────────────────────────────────────

const LATENCY_KEY = 'harmonic.guitar.latencyMs'

/**
 * Round-trip latency from a calibration run: the app plays clicks, the mic
 * hears them (or the player strums along with headphones on), and each
 * onset is matched to the click just before it. Median of the offsets in
 * ms, or null with too few matches.
 */
export function estimateLatency(clicks, onsets, { maxMs = 400, minMatches = 4, jitterMs = 25 } = {}) {
  const pulses = [...new Set(clicks)].sort((a, b) => a - b)
  const heard = [...new Set(onsets)]
  const options = pulses.map((click) => heard
    .map((wall) => ({ wall, delay: wall - click }))
    .filter(({ delay }) => delay >= 0 && delay <= maxMs))
  const seeds = options.flat().map(({ delay }) => delay).sort((a, b) => a - b)
  let offsets = []
  for (const seed of seeds) {
    const used = new Set()
    const cluster = []
    for (const candidates of options) {
      let best
      for (const candidate of candidates) {
        if (used.has(candidate.wall) || Math.abs(candidate.delay - seed) > jitterMs) continue
        if (!best || Math.abs(candidate.delay - seed) < Math.abs(best.delay - seed)) best = candidate
      }
      if (best) {
        used.add(best.wall)
        cluster.push(best.delay)
      }
    }
    if (cluster.length > offsets.length) offsets = cluster
  }
  if (offsets.length < minMatches) return null
  offsets.sort((a, b) => a - b)
  const mid = offsets.length >> 1
  return Math.round(offsets.length % 2 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2)
}

/** Saved latency in ms (0 when never calibrated, or storage is blocked). */
export function loadLatency() {
  try {
    const value = Number(globalThis.localStorage.getItem(LATENCY_KEY))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

export function saveLatency(ms) {
  try {
    globalThis.localStorage.setItem(LATENCY_KEY, String(Math.round(ms)))
  } catch {
    // Private window or blocked storage: the value lasts until reload.
  }
}
