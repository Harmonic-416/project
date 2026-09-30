import * as Tone from 'tone'

/**
 * The score time the singer was hearing when a mic frame was sung.
 *
 * `Tone.Transport.seconds` runs `lookAhead` (~0.1 s) ahead of what is
 * audible, the speaker adds `outputLatency`, and a mic frame reaches the
 * analyser `captureDelay` after it was sung (input latency + half the
 * analysis window). Stamping frames with `Transport.seconds` would score the
 * start of every note against the next one; this subtracts all three.
 *
 * Returns null while the transport isn't running (so paused and warm-up
 * frames aren't scored) and before the first note was audible.
 */
export function heardScoreTime(captureDelay = 0) {
  if (Tone.Transport.state !== 'started') return null
  const context = Tone.getContext()
  const raw = context.rawContext
  const outputLatency = raw.outputLatency || raw.baseLatency || 0
  const seconds = Tone.Transport.getSecondsAtTime(context.currentTime - outputLatency - captureDelay)
  return seconds >= 0 ? seconds : null
}

/** A typical mic → analyser delay, for callers without a live mic (see useMicPitch's captureDelay). */
export const TYPICAL_CAPTURE_DELAY = 0.05
