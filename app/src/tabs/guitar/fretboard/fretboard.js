/**
 * Fretboard math (Guitar → Fretboard). Every spot on the neck is its open
 * string's note plus one semitone per fret, so a note can be found anywhere
 * by arithmetic on MIDI numbers: the same pitch where open + fret is equal,
 * the same note name in any octave where it's equal modulo 12. Pure, so it
 * runs in Node (app/tests/fretboard.test.js).
 *
 * Strings are listed thickest first (index 0 = string 6, low E in standard),
 * like OPEN_STRING_MIDI in practice/chords.js.
 */

/** Frets shown: 0 (open) to 20, the neck of a typical acoustic. */
export const FRETS = 20

/** Dots on a real neck; 12 (and 24) get two. */
export const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19]

export const TUNINGS = [
  { id: 'standard', name: 'Standard', notes: [40, 45, 50, 55, 59, 64], about: 'Most music.' },
  { id: 'drop-d', name: 'Drop D', notes: [38, 45, 50, 55, 59, 64], about: 'Low string down a whole step. Rock and metal riffs.' },
  { id: 'e-flat', name: 'Half-step down (E♭)', notes: [39, 44, 49, 54, 58, 63], flats: true, about: 'Every string a semitone lower. Hendrix, Nirvana.' },
  { id: 'dadgad', name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62], about: 'Folk and Celtic. Open strings ring as a chord.' },
  { id: 'open-g', name: 'Open G', notes: [38, 43, 50, 55, 59, 62], about: 'The open strings make a G chord. Blues and slide.' },
]

export const MATCH_MODES = [
  { id: 'exact', label: 'Same pitch', hint: 'The exact same sound' },
  { id: 'octaves', label: 'All octaves', hint: 'That note name anywhere' },
]

const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

export function tuningById(id) {
  return TUNINGS.find((t) => t.id === id) ?? TUNINGS[0]
}

/** "D", "F♯" (or "G♭" with flats). */
export function noteName(midi, flats = false) {
  return (flats ? FLATS : SHARPS)[((midi % 12) + 12) % 12]
}

/** "D3": the name plus its octave (middle C is C4). */
export function pitchName(midi, flats = false) {
  return `${noteName(midi, flats)}${Math.floor(midi / 12) - 1}`
}

/** "D A D G B E" for a tuning, thickest string first. */
export function tuningLabel(tuning) {
  return tuning.notes.map((m) => noteName(m, tuning.flats)).join(' ')
}

/** Tab numbering: string index 0 (thickest) is string 6. */
export const stringNumber = (index) => 6 - index

/** "low E string", "A string", "high e string"... for a tuning. */
export function stringName(tuning, index) {
  const name = noteName(tuning.notes[index], tuning.flats)
  const count = tuning.notes.filter((m) => noteName(m) === noteName(tuning.notes[index])).length
  if (count > 1) {
    const lowest = tuning.notes.findIndex((m) => noteName(m) === noteName(tuning.notes[index]))
    return `${index === lowest ? 'low' : 'high'} ${name} string`
  }
  return `${name} string`
}

/** Every spot on the neck: [{ string, fret, midi }]. */
export function allPositions(tuning, frets = FRETS) {
  const positions = []
  tuning.notes.forEach((open, string) => {
    for (let fret = 0; fret <= frets; fret++) positions.push({ string, fret, midi: open + fret })
  })
  return positions
}

/** The spots that match `midi`: the same pitch, or (mode 'octaves') the same note name. */
export function matchingPositions(tuning, midi, mode = 'exact', frets = FRETS) {
  return allPositions(tuning, frets).filter((p) =>
    mode === 'octaves' ? (p.midi - midi) % 12 === 0 : p.midi === midi,
  )
}

/**
 * Groups of matches to join with lines: one group per pitch (each sorted
 * thickest string first), lowest pitch first.
 */
export function matchGroups(positions) {
  const byPitch = new Map()
  for (const p of positions) {
    if (!byPitch.has(p.midi)) byPitch.set(p.midi, [])
    byPitch.get(p.midi).push(p)
  }
  return [...byPitch.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([midi, list]) => ({ midi, positions: list.sort((a, b) => a.string - b.string) }))
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Why `to` plays the same note as `from`, in a sentence: the open strings'
 * gap, then how far to move along the neck.
 */
export function explainMove(tuning, from, to) {
  const octaves = (to.midi - from.midi) / 12
  const octaveNote =
    octaves === 0 ? '' : ` That's ${Math.abs(octaves) === 1 ? 'an octave' : `${Math.abs(octaves)} octaves`} ${octaves > 0 ? 'higher' : 'lower'}.`
  if (to.string === from.string) {
    return `Same string, ${plural(Math.abs(to.fret - from.fret), 'fret')} ${to.fret > from.fret ? 'up' : 'down'}: every 12 frets the notes repeat.${octaveNote}`
  }
  const gap = tuning.notes[to.string] - tuning.notes[from.string] // semitones between the open strings
  const move = to.fret - from.fret
  const toName = stringName(tuning, to.string)
  const direction = to.string > from.string ? 'thinner' : 'thicker'
  const gapText =
    gap === 0
      ? `The ${toName} is tuned to the same note`
      : `The ${toName} is tuned ${plural(Math.abs(gap), 'semitone')} ${gap > 0 ? 'higher' : 'lower'}`
  const moveText = move === 0 ? 'so stay on the same fret' : `so go ${plural(Math.abs(move), 'fret')} ${move > 0 ? 'up' : 'back'}`
  return `${gapText} (${direction}), ${moveText}.${octaveNote}`
}

/**
 * The neighbour-string rule of a tuning, e.g. standard: "one string thinner
 * = 5 frets back, except G → B: 4". Returns [{ from, to, gap }] per pair of
 * neighbouring strings, thickest first.
 */
export function stringGaps(tuning) {
  return tuning.notes.slice(1).map((note, i) => ({ from: i, to: i + 1, gap: note - tuning.notes[i] }))
}

/** One-line summary of stringGaps, for the info panel. */
export function gapRule(tuning) {
  const gaps = stringGaps(tuning)
  const counts = new Map()
  for (const { gap } of gaps) counts.set(gap, (counts.get(gap) ?? 0) + 1)
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const exceptions = gaps
    .filter((g) => g.gap !== usual)
    .map((g) => `${noteName(tuning.notes[g.from], tuning.flats)} → ${noteName(tuning.notes[g.to], tuning.flats)}: ${g.gap}`)
  return `Same note one string thinner = ${usual} frets back${exceptions.length ? ` (except ${exceptions.join(', ')})` : ''}.`
}