// MIDI pitch <-> MusicXML pitch helpers.

// Chromatic step/alter using sharps (flat-key spelling is a later improvement).
const CHROMATIC = [
  { step: 'C', alter: 0 },
  { step: 'C', alter: 1 },
  { step: 'D', alter: 0 },
  { step: 'D', alter: 1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'F', alter: 1 },
  { step: 'G', alter: 0 },
  { step: 'G', alter: 1 },
  { step: 'A', alter: 0 },
  { step: 'A', alter: 1 },
  { step: 'B', alter: 0 },
]

/** MIDI note number -> { step, alter, octave } for MusicXML <pitch>. */
export function midiNoteToPitch(midiNumber) {
  const { step, alter } = CHROMATIC[midiNumber % 12]
  const octave = Math.floor(midiNumber / 12) - 1
  return { step, alter, octave }
}

// Fifths (circle-of-fifths position) for major/minor key roots, as reported
// by @tonejs/midi's header.keySignatures ({ key: 'G', scale: 'major' }).
const MAJOR_FIFTHS = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
}
const MINOR_FIFTHS = {
  A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6,
  D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7,
}

/** { key, scale } from @tonejs/midi -> MusicXML <fifths> count. Defaults to 0 (C major). */
export function keySignatureToFifths(keySignature) {
  if (!keySignature) return 0
  const table = keySignature.scale === 'minor' ? MINOR_FIFTHS : MAJOR_FIFTHS
  return table[keySignature.key] ?? 0
}
