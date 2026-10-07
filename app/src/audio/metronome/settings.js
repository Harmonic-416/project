/**
 * Metronome preferences (F40), shared by the Vocal and Guitar tabs and saved
 * in this browser only — a per-device convenience, not progress.
 */

const STORAGE_KEY = 'harmonic.metronome'

export const DEFAULT_METRONOME = Object.freeze({ on: false, volume: 0.7, countIn: true })

function normalize(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULT_METRONOME }
  const volume = Number(saved.volume)
  return {
    on: typeof saved.on === 'boolean' ? saved.on : DEFAULT_METRONOME.on,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_METRONOME.volume,
    countIn: typeof saved.countIn === 'boolean' ? saved.countIn : DEFAULT_METRONOME.countIn,
  }
}

/** Saved settings, or the defaults when storage is empty, blocked or unreadable. */
export function loadMetronomeSettings() {
  try {
    return normalize(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_METRONOME }
  }
}

export function saveMetronomeSettings(settings) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(settings)))
  } catch {
    // Private window or blocked storage: settings last until reload.
  }
}
