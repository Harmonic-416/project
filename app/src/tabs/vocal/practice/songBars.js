import { spotLabel } from './takeSummary.js'

/**
 * Which bars an attempt missed, for places that list attempts without the
 * score open (This session, Practice sessions). An attempt stores a verdict
 * per note but not where those notes sit, so when a song is opened its
 * line's bar numbers are remembered on the device (one small array per song
 * and part); a later list reads them back to say "Bars 9–12" the way the
 * take summary does. No bars remembered (another device, a song not opened
 * here yet) → no line, never a wrong one: the lengths must match.
 */

const PREFIX = 'harmonic.songBars.'
const MAX_SPOTS = 4

const songKey = (song) => song.song_id ?? song.songId ?? song.song_fingerprint ?? song.fingerprint ?? song.song_title ?? song.title ?? ''
const partOf = (song) => song.part_name ?? song.partName ?? ''

function store() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Remember the printed bar number of each judged note of this song's part. */
export function rememberSongBars(song, barNumbers) {
  if (!songKey(song) || !barNumbers?.length) return
  try {
    const value = JSON.stringify(barNumbers)
    store()?.setItem(`${PREFIX}${songKey(song)}|${partOf(song)}`, value)
    store()?.setItem(`${PREFIX}${songKey(song)}|`, value)
  } catch {
    // Full or blocked storage: the lists simply don't show bars.
  }
}

export function loadSongBars(song, length) {
  for (const key of [`${PREFIX}${songKey(song)}|${partOf(song)}`, `${PREFIX}${songKey(song)}|`]) {
    try {
      const bars = JSON.parse(store()?.getItem(key) ?? 'null')
      if (Array.isArray(bars) && bars.length === length) return bars
    } catch {
      // unreadable entry: try the next
    }
  }
  return null
}

/**
 * Labels for the stretches of missed notes, misses in touching bars joined:
 * { labels: ['Pickup–bar 5', 'Bar 9'], more: 2 }. `verdicts`: 'hit' | 'miss' |
 * null per note; `barNumbers`: the printed bar of each note.
 */
export function missedBars(verdicts, barNumbers, max = MAX_SPOTS) {
  if (!Array.isArray(verdicts) || !barNumbers || verdicts.length !== barNumbers.length) return null
  const runs = []
  verdicts.forEach((verdict, i) => {
    if (verdict !== 'miss') return
    const bar = barNumbers[i]
    const last = runs[runs.length - 1]
    if (last && bar - last.to <= 1) last.to = Math.max(last.to, bar)
    else runs.push({ from: bar, to: bar })
  })
  return { labels: runs.slice(0, max).map((r) => spotLabel(r.from, r.to)), more: Math.max(0, runs.length - max) }
}
