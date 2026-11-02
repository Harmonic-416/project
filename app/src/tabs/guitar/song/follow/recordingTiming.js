/**
 * Where in the song a guitar run's recording is (change: guitar-shared-playback):
 * a list of points [seconds into the recording, song seconds], read piecewise
 * linearly. It's saved with the attempt (shared_attempt.timing, 0018), so
 * whoever the run is shared with sees the tab's cursor follow the playing
 * while the recording plays, at the speed and tempo it was played.
 *
 *   - Trouble spots: playback never waits, so the cursor moves with the
 *     song clock; it holds where a pause held it, and jumps with a seek or loop.
 *   - Wait for me: the cursor sits on each note until it was played, then
 *     moves on to the next one, as it did for the player.
 */

// Recording and song times to the millisecond; a step is 1 ms wide.
const STEP = 0.001
const round = (x) => Math.round(x * 1000) / 1000

/** Song seconds at `seconds` into the recording: the first point's before it, the last point's after it; null without timing. */
export function songTimeAt(timing, seconds) {
  if (!timing?.length) return null
  if (seconds <= timing[0][0]) return timing[0][1]
  const last = timing[timing.length - 1]
  if (seconds >= last[0]) return last[1]
  let lo = 0
  let hi = timing.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (timing[mid][0] <= seconds) lo = mid
    else hi = mid
  }
  const [r0, s0] = timing[lo]
  const [r1, s1] = timing[hi]
  return r1 === r0 ? s1 : s0 + ((seconds - r0) / (r1 - r0)) * (s1 - s0)
}

/** Drop the points that lie on the line between their neighbours (within `tolerance` song seconds), and round. */
export function compressTiming(points, tolerance = 0.02) {
  const kept = points.length > 2 ? [points[0]] : [...points]
  if (points.length > 2) {
    for (let i = 1; i < points.length - 1; i++) {
      const a = kept[kept.length - 1]
      const [r, s] = points[i]
      const c = points[i + 1]
      const onLine = c[0] === a[0] ? c[1] : a[1] + ((r - a[0]) / (c[0] - a[0])) * (c[1] - a[1])
      if (Math.abs(onLine - s) > tolerance) kept.push(points[i])
    }
    kept.push(points[points.length - 1])
  }
  return kept.map(([r, s]) => [round(r), round(s)])
}

/**
 * A Trouble spots run, from its clock anchors ({ wall, seconds }: page time
 * and song seconds, taken while playback ran). The mic hears the guitar
 * `latencyMs` after the song clock (as the judging assumes), and a gap
 * between anchors longer than `gapMs` was a pause, so the cursor stays put.
 */
export function troubleTiming(anchors, { recordingStartWall, latencyMs = 0, gapMs = 200 }) {
  if (!anchors?.length || recordingStartWall == null) return null
  const points = []
  let previous = null
  for (const anchor of anchors) {
    const at = (anchor.wall + latencyMs - recordingStartWall) / 1000
    if (previous && anchor.wall - previous.wall > gapMs) points.push([at - STEP, previous.seconds])
    points.push([at, anchor.seconds])
    previous = anchor
  }
  return compressTiming(points)
}

/**
 * A Wait for me run, from its steps ({ at, time }: at `at` seconds into the
 * recording the cursor moved to the note at song time `time`; the first step
 * is where it started). The cursor holds between steps.
 */
export function waitTiming(steps) {
  const sorted = steps.filter((step) => step.at != null).sort((a, b) => a.at - b.at)
  if (!sorted.length) return null
  const points = [[sorted[0].at, sorted[0].time]]
  for (let i = 1; i < sorted.length; i++) {
    const { at, time } = sorted[i]
    points.push([Math.max(at - STEP, points[points.length - 1][0]), sorted[i - 1].time], [at, time])
  }
  return compressTiming(points)
}

/** The timeline entry being played at song time `seconds`: the last one at or before it (the first before any). */
export function entryAt(entries, seconds) {
  let found = entries[0] ?? null
  for (const entry of entries) {
    if (entry.time > seconds + 0.02) break
    found = entry
  }
  return found
}
