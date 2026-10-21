import { STRING_NAMES } from './chords.js'

/**
 * How each finger gets from one chord shape to another — the thing a video
 * would show, worked out from the shapes so it can be drawn and said
 * instead (ChordTransition.jsx). Pure, unit-tested in app/tests/changes.test.js.
 *
 *   kind: 'anchor' – same string, same fret: leave it down
 *         'slide'  – same string, another fret: slide along it
 *         'move'   – to another string: lift and place
 *         'lift'   – only in the first chord
 *         'place'  – only in the second chord
 */

/** Where each finger presses: finger → { string, fret } (a barre's first string). */
function fingerSpots(chord) {
  const spots = new Map()
  chord.fingers.forEach((finger, string) => {
    if (finger > 0 && !spots.has(finger)) spots.set(finger, { string, fret: chord.frets[string] })
  })
  return spots
}

/** [{ finger, from, to, kind }] for fingers 1 … 4 that either chord uses. */
export function chordTransition(from, to) {
  const a = fingerSpots(from)
  const b = fingerSpots(to)
  const moves = []
  for (let finger = 1; finger <= 4; finger += 1) {
    const start = a.get(finger) ?? null
    const end = b.get(finger) ?? null
    if (!start && !end) continue
    let kind
    if (!end) kind = 'lift'
    else if (!start) kind = 'place'
    else if (start.string === end.string) kind = start.fret === end.fret ? 'anchor' : 'slide'
    else kind = 'move'
    moves.push({ finger, from: start, to: end, kind })
  }
  return moves
}

const FINGER = ['', '1st', '2nd', '3rd', '4th']
const stringName = (index) => (index === 5 ? 'high e' : index === 0 ? 'low E' : STRING_NAMES[index])

/** One line of advice for the change, e.g. "Keep your 2nd finger down on the A string — it doesn't move." */
export function transitionTip(from, to) {
  const moves = chordTransition(from, to)
  const anchors = moves.filter((m) => m.kind === 'anchor')
  if (anchors.length) {
    const names = anchors.map((m) => `${FINGER[m.finger]} finger`).join(' and ')
    return `Keep your ${names} down — ${anchors.length > 1 ? 'they don’t' : 'it doesn’t'} move between ${from.id} and ${to.id}.`
  }
  const slide = moves.find((m) => m.kind === 'slide')
  if (slide) {
    return `Slide your ${FINGER[slide.finger]} finger along the ${stringName(slide.to.string)} string instead of lifting it.`
  }
  return `Every finger moves: lift them together and land the whole ${to.id} shape at once.`
}
