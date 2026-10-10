/**
 * Beat grid for the metronome (F40), in the same score seconds as the
 * playback schedule, so clicks share the one transport clock (F6).
 *
 *   measures: [{ time, length, numerator, denominator, bpm }]
 *     time   — measure start, in score seconds
 *     length — the measure's actual length in whole notes (shorter than
 *              numerator/denominator in a pickup bar)
 *     bpm    — quarter notes per minute at the start of the measure
 *
 *   beats: [{ time, beat, perBar, downbeat }]  (beat is 1-based)
 */

const EPSILON = 1e-6

/** Whole notes per quarter-note minute → seconds per whole note. */
function secondsPerWholeNote(bpm) {
  return 240 / bpm
}

/**
 * The pulse a metronome clicks, in whole notes: one per 1/denominator in
 * simple meters, one per dotted quarter in compound meters (6/8, 9/8, 12/8).
 */
export function meterPulse(numerator, denominator) {
  const compound = denominator === 8 && numerator > 3 && numerator % 3 === 0
  return compound ? 3 / 8 : 1 / denominator
}

export function beatsFromMeasures(measures) {
  const beats = []
  measures.forEach((measure, index) => {
    const { time, length, numerator, denominator, bpm } = measure
    if (!(bpm > 0) || !(numerator > 0) || !(denominator > 0)) return
    const pulse = meterPulse(numerator, denominator)
    const fullLength = numerator / denominator
    const perBar = Math.max(1, Math.round(fullLength / pulse))
    const spw = secondsPerWholeNote(bpm)
    // A short first bar is a pickup: its beats are the last ones of a full bar.
    const offset = index === 0 && length < fullLength - EPSILON ? fullLength - length : 0
    for (let k = Math.ceil((offset - EPSILON) / pulse); k < perBar; k += 1) {
      const within = k * pulse - offset
      if (within >= length - EPSILON) break
      beats.push({ time: time + within * spw, beat: k + 1, perBar, downbeat: k === 0 })
    }
  })
  return beats
}

/**
 * A one-bar count-in before playing from `fromSeconds`: as many clicks as
 * the bar about to play has beats, at its beat spacing. Null without beats.
 */
export function countIn(beats, fromSeconds) {
  if (!beats.length) return null
  let index = beats.findIndex((b) => b.time >= fromSeconds - EPSILON)
  if (index === -1) index = beats.length - 1
  const next = beats[index + 1]
  const prev = beats[index - 1]
  const interval = next ? next.time - beats[index].time : prev ? beats[index].time - prev.time : 0.5
  return { count: beats[index].perBar, interval }
}
