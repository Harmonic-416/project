import { starsFor } from '../feedback/stars.js'
import { median } from '../components/pitchReading.js'

/**
 * What a finished take says, in words a singer can act on: how many notes
 * landed (the same verdicts the staff shows), stars from that share, and the
 * few places worth going back to — "Bars 9–12: flat" — each with the time
 * to play it from. Pure: the verdicts come from judgeNotes, the direction
 * from the median of what was sung in each missed note.
 */

const MAX_SPOTS = 3

/** Number printed on the bar that contains `time` (bars ascending by time). */
export function barAt(bars, time) {
  let found = bars[0] ?? null
  for (const bar of bars) {
    if (bar.time > time + 1e-6) break
    found = bar
  }
  return found
}

/** "Bar 9", "Bars 9–12"; a pickup is bar 0 on the score but reads as "Pickup" in words. */
export function spotLabel(fromBar, toBar) {
  if (fromBar === null) return 'Start'
  if (fromBar === 0) return toBar === 0 ? 'Pickup' : `Pickup–bar ${toBar}`
  return fromBar === toBar ? `Bar ${fromBar}` : `Bars ${fromBar}–${toBar}`
}

function headline(ratio) {
  if (ratio >= 1) return 'Every note!'
  if (ratio >= 0.9) return 'Great take'
  if (ratio >= 0.7) return 'Nice — a few to fix'
  if (ratio >= 0.4) return 'Getting there'
  return 'Keep at it'
}

/** A distance in words a singer uses: cents only while it's under a half step. */
export function howFar(cents) {
  if (cents < 90) return `about ${Math.round(cents)}¢`
  if (cents < 150) return 'about a half step'
  if (cents < 250) return 'about a whole step'
  return 'more than a whole step'
}

function describe(centsList) {
  const heard = centsList.filter((c) => c !== null && c !== undefined)
  if (!heard.length) return { direction: 'silent', words: 'not heard', glyph: '·' }
  const flat = heard.filter((c) => c < 0).length
  const sharp = heard.length - flat
  if (flat && sharp && Math.min(flat, sharp) / heard.length >= 0.34) return { direction: 'mixed', words: 'unsteady', glyph: '↕' }
  // How far, from the notes that went the majority's way (one stray sharp note doesn't shrink "flat").
  const side = heard.filter((c) => (flat >= sharp ? c < 0 : c >= 0))
  const size = howFar(Math.abs(median(side)))
  return flat >= sharp
    ? { direction: 'flat', words: `flat (${size} low)`, glyph: '↑' }
    : { direction: 'sharp', words: `sharp (${size} high)`, glyph: '↓' }
}

/**
 * @param {{ line: Array<{time:number}>, hits: Set<number>, centsByNote: Map<number, number|null>, bars: Array<{time:number, number:number}> }} input
 *   line: the judged melody; hits / centsByNote are keyed by position in `line`.
 */
export function summarizeTake({ line, hits, centsByNote, bars }) {
  const total = line.length
  const hit = line.filter((_, i) => hits.has(i)).length
  const ratio = total ? hit / total : 0

  // Missed notes, grouped into runs whose bars touch (bar 9 and bar 10 are one spot).
  const runs = []
  line.forEach((note, i) => {
    if (hits.has(i)) return
    const bar = barAt(bars, note.time)
    const number = bar?.number ?? null
    const last = runs[runs.length - 1]
    if (last && number !== null && last.toBar !== null && number - last.toBar <= 1) {
      last.toBar = number
      last.cents.push(centsByNote.get(i) ?? null)
      last.count += 1
    } else {
      runs.push({ fromBar: number, toBar: number, time: bar?.time ?? note.time, cents: [centsByNote.get(i) ?? null], count: 1 })
    }
  })
  const spots = runs
    .map((run) => ({ ...run, ...describe(run.cents) }))
    .sort((a, b) => b.count - a.count || a.time - b.time)
    .slice(0, MAX_SPOTS)
    .sort((a, b) => a.time - b.time)
    .map(({ cents: _cents, ...spot }) => ({
      ...spot,
      label: spotLabel(spot.fromBar, spot.toBar),
      // Where the passage ends (the next bar's start), for looping it; null = the end of the song.
      endTime: bars.find((bar) => spot.toBar !== null && bar.number === spot.toBar + 1)?.time ?? null,
    }))

  return { hit, total, ratio, stars: starsFor(ratio), title: headline(ratio), spots, moreSpots: Math.max(0, runs.length - spots.length) }
}
