import { spotLabel, summarizeTake } from './takeSummary.js'
import { noteDistanceCents } from './practiceLogic.js'
import { median } from '../components/pitchReading.js'

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

/**
 * The whole judged line of a song's part — each note's time, length and pitch,
 * and where the bars start — remembered like the bar numbers above, so a past
 * attempt's saved pitch trace can be read against it without the score open:
 * which stretches were flat, sharp or not sung (takeFeedback below).
 */
const LINE_PREFIX = 'harmonic.songLine.'

export function rememberSongLine(song, line, bars) {
  if (!songKey(song) || !line?.length || !bars?.length) return
  try {
    const value = JSON.stringify({
      line: line.map((n) => [Math.round(n.time * 1000) / 1000, Math.round(n.duration * 1000) / 1000, n.midi]),
      bars: bars.map((b) => [Math.round(b.time * 1000) / 1000, b.number]),
    })
    store()?.setItem(`${LINE_PREFIX}${songKey(song)}|${partOf(song)}`, value)
    store()?.setItem(`${LINE_PREFIX}${songKey(song)}|`, value)
  } catch {
    // Full or blocked storage: lists fall back to the bars alone.
  }
}

export function loadSongLine(song, length) {
  for (const key of [`${LINE_PREFIX}${songKey(song)}|${partOf(song)}`, `${LINE_PREFIX}${songKey(song)}|`]) {
    try {
      const saved = JSON.parse(store()?.getItem(key) ?? 'null')
      if (saved?.line?.length === length && saved.bars?.length) {
        return {
          line: saved.line.map(([time, duration, midi]) => ({ time, duration, midi })),
          bars: saved.bars.map(([time, number]) => ({ time, number })),
        }
      }
    } catch {
      // unreadable entry: try the next
    }
  }
  return null
}

/**
 * The take summary (stars, headline, "Bars 9–12 · flat (about a half step
 * low)") for a saved attempt: its verdicts say which notes landed, its pitch
 * trace says which way the others were off. The same summarizeTake the card
 * after a take uses, so the two read the same. `trace`: [[seconds, midi], …].
 */
export function takeFeedback({ verdicts, trace, song }) {
  if (!Array.isArray(verdicts) || !song || song.line.length !== verdicts.length) return null
  const { line, bars } = song
  const heard = new Map()
  let from = 0
  for (const [time, midi] of trace ?? []) {
    // Notes are in time order and so is the trace: walk forward, never back.
    while (from < line.length && time >= line[from].time + line[from].duration) from += 1
    const note = line[from]
    if (!note || time < note.time + Math.min(0.1, note.duration / 2)) continue
    const list = heard.get(from) ?? []
    list.push(noteDistanceCents(midi, note.midi))
    heard.set(from, list)
  }
  const centsByNote = new Map([...heard].map(([i, list]) => [i, median(list)]))
  const hits = new Set(verdicts.flatMap((v, i) => (v === 'hit' ? [i] : [])))
  // Every spot, in score order: the row shows a few and opens the rest on request.
  return summarizeTake({ line, hits, centsByNote, bars, max: Infinity })
}
