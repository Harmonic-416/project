/**
 * A song's Easy version (F45), for any song: only the first note or strum
 * of each bar, and every change to a new chord, is scored; the rest stay on
 * the tab, shown grey, and are passed over (songTimeline.isScored). Four-
 * Chord Strum becomes one strum per chord, an arpeggio its bass notes.
 * Remembered per song, like the tempo. Pure, unit-tested in
 * app/tests/easyMode.test.js.
 */

/** Indexes of the entries Easy scores: the first of each bar (each time it's played) and each change of chord. */
export function easyEntries(entries) {
  const kept = new Set()
  let previous = null
  for (const entry of entries) {
    const shape = entry.notes.map((n) => n.midi).join(',')
    const newBar = !previous || entry.barStartTick !== previous.barStartTick
    const newChord = entry.kind === 'chord' && previous?.kind === 'chord' && shape !== previous.shape
    if (newBar || newChord) kept.add(entry.index)
    previous = { barStartTick: entry.barStartTick, kind: entry.kind, shape }
  }
  return kept
}

/** The timeline with everything Easy leaves out marked `optional` — or as it is, when `easy` is off. */
export function withEasy(timeline, easy) {
  if (!easy || !timeline) return timeline
  const kept = easyEntries(timeline.entries)
  return { ...timeline, entries: timeline.entries.map((entry) => (kept.has(entry.index) ? entry : { ...entry, optional: true })) }
}

const EASY_KEY = 'harmonic.guitar.easySongs'

/** Whether the song with this fingerprint was last played in its Easy version. */
export function loadEasy(fingerprint) {
  if (!fingerprint) return false
  try {
    return Boolean(JSON.parse(globalThis.localStorage.getItem(EASY_KEY) ?? '{}')[fingerprint])
  } catch {
    return false
  }
}

export function saveEasy(fingerprint, easy) {
  if (!fingerprint) return
  try {
    const all = JSON.parse(globalThis.localStorage.getItem(EASY_KEY) ?? '{}')
    if (easy) all[fingerprint] = true
    else delete all[fingerprint]
    globalThis.localStorage.setItem(EASY_KEY, JSON.stringify(all))
  } catch {
    // Private window or blocked storage: the choice lasts until the song closes.
  }
}
