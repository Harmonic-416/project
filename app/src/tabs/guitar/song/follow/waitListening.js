import { EVERY_STRING, averageSpectrum, judgeWindow, noteGain, spectralPeaks } from './noteJudge.js'

/**
 * "Wait for me" on a guitar song: which listening windows (listenWindows.js)
 * are an attempt at the current note, and which are noise or a note still
 * ringing. Pure, so it runs in Node (app/tests/waitListening.test.js).
 *
 *   - Is it a note? It must be tonal (a peak that stands well above the
 *     rest of the spectrum all through the window: a ringing string is a
 *     steady line, a click is gone at once), keep ringing (not fall far
 *     below its attack within 300 ms) and stay above the room's floor.
 *     Typing, taps and bumps fail, and get no verdict at all (N6).
 *   - One strum, one judgement: onsets within `groupSeconds` of each other
 *     are one gesture, however spread out the strum. A hit counts at once
 *     and the rest of the gesture is ignored; a wrong verdict waits until
 *     the gesture is over, so a slow strum's first half isn't called wrong.
 *   - Freshly played: a hit needs the expected notes to be louder than just
 *     before the gesture, so a chord still ringing can't satisfy the next,
 *     identical chord; a wrong try needs something new to have been played.
 *
 * The numbers come from simulated strings (two-stage decay, beating, pick
 * noise) and keyboard clicks; tune them by ear against real playing, with
 * the measurements the dev-mode judgement log records.
 */

// Tuning knobs.
export const TONAL_CONTRAST_DB = 25 // how far the strongest peak stands above a frame's median level …
export const TONAL_SHARE = 0.8 // … in at least this share of the window's frames
export const MAX_DECAY_DB = 25 // how far a note may fall below its first 60 ms within 300 ms
export const ABOVE_FLOOR_DB = 6 // how far above the room's floor its quietest point must stay
export const FRESH_GAIN = 1.3 // how much louder than before the gesture the expected notes must be, for a hit
export const ATTACK_GAIN = 1.5 // … and the loudest peaks, for a wrong try to count
export const GROUP_SECONDS = 0.2 // onsets this close together are one strum

const HEAD_SECONDS = 0.06
const RING_SECONDS = 0.3
const MIN_FREQUENCY = 60
const MAX_FREQUENCY = 5000
const LOUDEST_PEAKS = 5

const db = (ratio) => 20 * Math.log10(Math.max(ratio, 1e-9))

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Share of the window's frames in which its strongest peak stands TONAL_CONTRAST_DB above that frame's median level. */
export function tonalShare(spectra, sampleRate) {
  const average = averageSpectrum(spectra)
  const n = (average.length - 1) * 2
  const lo = Math.max(1, Math.floor((MIN_FREQUENCY * n) / sampleRate))
  const hi = Math.min(average.length - 2, Math.ceil((MAX_FREQUENCY * n) / sampleRate))
  let best = lo
  for (let bin = lo; bin <= hi; bin += 1) if (average[bin] > average[best]) best = bin
  const contrast = 10 ** (TONAL_CONTRAST_DB / 20)
  let tonal = 0
  for (const spectrum of spectra) {
    const levels = Array.from(spectrum.subarray(lo, hi + 1)).sort((a, b) => a - b)
    const peak = Math.max(spectrum[best - 1], spectrum[best], spectrum[best + 1])
    if (peak > levels[levels.length >> 1] * contrast) tonal += 1
  }
  return tonal / spectra.length
}

/**
 * Does a listening window sound like a played note? { ok, tonal, decayDb,
 * aboveFloorDb }. Reads the window's `spectra`, and the hop `levels`, `hop`
 * and room `floor` the collector adds; a check without its data (no floor
 * yet) passes.
 */
export function soundsLikeANote({ spectra, sampleRate, onset, levels = [], hop = 512, floor = null }) {
  const tonal = tonalShare(spectra, sampleRate)
  const head = onset + HEAD_SECONDS * sampleRate
  const end = onset + RING_SECONDS * sampleRate
  let attack = 0
  let quietest = Infinity
  for (const { position, level } of levels) {
    const start = position - hop
    if (start >= onset && position <= head) attack = Math.max(attack, level)
    else if (start >= head && position <= end) quietest = Math.min(quietest, level)
  }
  const ringing = Number.isFinite(quietest)
  const decayDb = attack > 0 && ringing ? db(quietest / attack) : 0
  const aboveFloorDb = floor && ringing ? db(quietest / floor) : Infinity
  const ok = tonal >= TONAL_SHARE && decayDb >= -MAX_DECAY_DB && aboveFloorDb >= ABOVE_FLOOR_DB
  return { ok, tonal, decayDb, aboveFloorDb }
}

/**
 * Wait for me's listening rules, one window at a time.
 *
 *   consider(window, entry) → { actions, log }
 *     actions: waitReducer actions to dispatch ({ type: 'judged', result }):
 *              a hit at once, a wrong try once its gesture is over
 *     log:     the decision and the measurements behind it
 *   reset():   forget the gesture in progress (Skip, Retry, Hint, a seek, Stop)
 *
 * `window` is listenWindows' window with `sampleRate`; `entry` the timeline
 * entry being waited on.
 */
export function createWaitAttempts({ groupSeconds = GROUP_SECONDS, judgeOptions = EVERY_STRING } = {}) {
  let gesture = null // { first, reference, hit, held }

  const settle = () => {
    const held = gesture?.held
    if (held) gesture.held = null
    return held ? [{ type: 'judged', result: held }] : []
  }

  return {
    consider(window, entry) {
      const { sampleRate } = window
      const group = groupSeconds * sampleRate
      const actions = []
      // A new gesture: the first window, one past the group, or the clock started over (a new mic session).
      if (!gesture || window.onset < gesture.first || window.onset - gesture.first > group) {
        actions.push(...settle())
        gesture = { first: window.onset, reference: window.referenceSpectrum ?? window.beforeSpectrum ?? null, hit: false, held: null }
      }

      const note = soundsLikeANote(window)
      const log = { decision: null, verdict: null, tonal: note.tonal, decayDb: note.decayDb, aboveFloorDb: note.aboveFloorDb }
      let result = null
      if (gesture.hit) log.decision = 'ignored: same strum as the hit'
      else if (!note.ok) log.decision = 'ignored: not a note'
      else {
        result = judgeWindow({ ...window, beforeSpectrum: gesture.reference }, entry, judgeOptions)
        log.verdict = result.verdict
        log.result = result
        const after = spectralPeaks(averageSpectrum(window.spectra), sampleRate)
        const before = gesture.reference ? spectralPeaks(gesture.reference, sampleRate) : null
        const gain = (midi) => (before ? noteGain(after, before, midi) : Infinity)
        if (result.verdict === 'hit') {
          log.fresh = median(entry.notes.map((n) => gain(n.midi)))
          log.decision = log.fresh >= FRESH_GAIN ? 'hit' : 'ignored: still ringing'
        } else if (result.verdict === 'skipped') {
          log.decision = 'ignored: not scored'
        } else {
          const loudest = [...after.peaks].sort((a, b) => b.magnitude - a.magnitude).slice(0, LOUDEST_PEAKS)
          log.attack = loudest.length ? median(loudest.map((p) => gain(69 + 12 * Math.log2(p.frequency / 440)))) : 0
          log.decision = log.attack >= ATTACK_GAIN ? 'wrong' : 'ignored: nothing new played'
        }
      }

      if (log.decision === 'hit') {
        gesture.hit = true
        gesture.held = null
        actions.push({ type: 'judged', result })
      } else if (log.decision === 'wrong') {
        gesture.held = result
      }
      // Over, unless the onset that closed this window is still part of the gesture.
      const continues = window.closedBy === 'onset' && window.closedAt - gesture.first <= group
      if (!continues) actions.push(...settle())
      return { actions, log }
    },

    reset() {
      gesture = null
    },
  }
}
