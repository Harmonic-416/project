/**
 * Scores for the Vocal tab's practice modes (pure, no DOM), 0–100:
 *
 *  - "Wait for me" asks whether you know the melody: each note scores by how
 *    long you took to land on it once it was highlighted (listening time
 *    only; paused time doesn't count). Full marks within REACTION_FULL_MS,
 *    nothing from REACTION_ZERO_MS, a straight line in between; the run
 *    scores the average.
 *  - "Trouble spots" asks whether you can sing it in time: a note sung on
 *    pitch is worth 1, a note sung a half step off ½, anything else 0
 *    (further off, unsteady, or not sung).
 */

/**
 * What counts as correct, stricter than the shared defaults in
 * practiceLogic.js (which shared attempts and the record panel keep):
 *  - Wait for me: within 35 cents of the note, held steady for 300 ms.
 *  - Trouble spots: within 50 cents (the nearest semitone, not either
 *    neighbour), at least 4 frames, and on pitch for at least 60% of what
 *    was sung during the note. Sung the same way but 50–150 cents off (a
 *    half step, give or take a quarter tone) is "close": half a point.
 * Any octave still counts, so every voice range can sing every melody.
 */
export const STRICT_HOLD = { toleranceCents: 35, holdMs: 300 }
export const STRICT_TROUBLE = { toleranceCents: 50, minFrames: 4, minOnPitchShare: 0.6, closeCents: 150 }

/** The live pitch readout's colour, on the same scale: in tune, close (up to a semitone), or wrong. */
export function liveVerdict(cents, toleranceCents) {
  const abs = Math.abs(cents)
  if (abs <= toleranceCents) return 'in-tune'
  if (abs <= 100) return 'close'
  return 'wrong'
}

export const REACTION_FULL_MS = 1000
export const REACTION_ZERO_MS = 6000
/** Notes slower than this are called out after a wait-mode run. */
export const SLOW_NOTE_MS = 3000

/** 1 for a quick find, 0 for a very slow one. */
export function reactionPoints(ms) {
  if (ms <= REACTION_FULL_MS) return 1
  if (ms >= REACTION_ZERO_MS) return 0
  return 1 - (ms - REACTION_FULL_MS) / (REACTION_ZERO_MS - REACTION_FULL_MS)
}

/**
 * A wait-mode run: `results` is one { index, position, midi, ms } per note
 * sung, in order (`position`: 0-based place in the melody; defaults to the
 * place in `results`). Returns { score, averageMs, notes, slow } where `slow`
 * is the slowest notes over SLOW_NOTE_MS (at most `maxSlow`, slowest first).
 */
export function summarizeWaitRun(results, { maxSlow = 3 } = {}) {
  if (!results.length) return { score: 0, averageMs: 0, notes: 0, slow: [], slowNotes: 0 }
  const points = results.reduce((sum, r) => sum + reactionPoints(r.ms), 0)
  const averageMs = results.reduce((sum, r) => sum + r.ms, 0) / results.length
  const slow = results
    .map((r, i) => ({ position: i, ...r }))
    .filter((r) => r.ms > SLOW_NOTE_MS)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, maxSlow)
  const slowNotes = results.filter((r) => r.ms > SLOW_NOTE_MS).length
  return { score: Math.round((points / results.length) * 100), averageMs, notes: results.length, slow, slowNotes }
}

/** A trouble-spots run from its counts: right = 1, close (a half step off) = ½, missed = 0. */
export function summarizeTroubleRun({ right, close, missed }) {
  const total = right + close + missed
  const score = total ? Math.round(((right + close / 2) / total) * 100) : 0
  return { score, right, close, missed, total }
}

/** How a session's runs ({ score }) have gone: first, best and latest score, and the change since the first. */
export function sessionTrend(runs) {
  if (!runs.length) return null
  const first = runs[0].score
  const latest = runs[runs.length - 1].score
  return { runs: runs.length, first, latest, best: Math.max(...runs.map((r) => r.score)), change: latest - first }
}

/** "1.2 s", "0.4 s". */
export function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)} s`
}

/**
 * A stopwatch that only runs while listening: restart() when a new note is
 * highlighted, pause()/resume() as the mic stops and starts, and at(ms) for
 * the listening time from the restart up to a moment (the note's onset).
 */
export function createListeningClock() {
  let elapsed = 0
  let since = null // when the current listening stretch began, or null while paused
  return {
    restart(nowMs, running) {
      elapsed = 0
      since = running ? nowMs : null
    },
    pause(nowMs) {
      if (since === null) return
      elapsed += Math.max(0, nowMs - since)
      since = null
    },
    resume(nowMs) {
      if (since === null) since = nowMs
    },
    /** Listening time up to `atMs` (a moment in the current stretch, or now). */
    at(atMs) {
      if (since === null) return elapsed
      return elapsed + Math.max(0, atMs - since)
    },
  }
}
