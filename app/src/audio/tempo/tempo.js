/**
 * Tempo control (F37): a percentage of the written tempo, 50–100% in 5%
 * steps, remembered per song in this browser. Songs are keyed by their file
 * fingerprint, so built-in, uploaded and catalog songs all work, signed in
 * or not. Only slowed-down songs are stored; 100% is the default.
 */

export const TEMPO_MIN = 50
export const TEMPO_MAX = 100
export const TEMPO_STEP = 5

const STORAGE_KEY = 'harmonic.tempo'

/** Nearest allowed step within 50–100%; anything unreadable is 100%. */
export function clampTempo(pct) {
  const value = Number(pct)
  if (!Number.isFinite(value)) return TEMPO_MAX
  const stepped = Math.round(value / TEMPO_STEP) * TEMPO_STEP
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, stepped))
}

/** The BPM actually heard at `pct` of a written `bpm`, rounded as a tempo mark prints it. */
export function effectiveBpm(bpm, pct) {
  return Math.round((bpm * pct) / 100)
}

function readAll() {
  const saved = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? '{}')
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
}

/** The saved tempo for a song, or 100% when there is none (or storage is blocked or unreadable). */
export function loadSongTempo(songKey) {
  if (!songKey) return TEMPO_MAX
  try {
    const saved = readAll()[songKey]
    return saved === undefined ? TEMPO_MAX : clampTempo(saved)
  } catch {
    return TEMPO_MAX
  }
}

export function saveSongTempo(songKey, pct) {
  if (!songKey) return
  try {
    let all
    try {
      all = readAll()
    } catch {
      all = {} // unreadable: start over rather than never saving again
    }
    const tempo = clampTempo(pct)
    if (tempo === TEMPO_MAX) delete all[songKey]
    else all[songKey] = tempo
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Private window or blocked storage: the tempo lasts until the song closes.
  }
}
