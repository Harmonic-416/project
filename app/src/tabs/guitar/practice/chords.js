/**
 * Chord shapes and the small bits of music maths the practice screen needs.
 * Pure data + functions (no React), unit-tested in app/tests/practice.test.js.
 *
 * Strings are listed low to high, the way a chord chart reads left to right:
 * index 0 = low E (6th string) … index 5 = high e (1st string).
 * Fret -1 = don't play the string (✕), 0 = open string (○).
 * Finger 1 = index … 4 = pinky, 0 = no finger.
 */

export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'E']

// Standard tuning as MIDI note numbers: E2 A2 D3 G3 B3 E4.
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64]

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const CHORDS = [
  { id: 'Em', name: 'E minor', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  { id: 'Am', name: 'A minor', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  { id: 'C', name: 'C major', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  { id: 'G', name: 'G major', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  { id: 'D', name: 'D major', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  { id: 'E', name: 'E major', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
]

/** Note name ("G", "F#") of a string at a fret, or null for a string that isn't played. */
export function noteAt(stringIndex, fret) {
  if (fret < 0) return null
  return NOTE_NAMES[(OPEN_STRING_MIDI[stringIndex] + fret) % 12]
}

/** MIDI notes the chord sounds, low to high (muted strings left out). Used by Hint. */
export function chordMidi(chord) {
  return chord.frets.flatMap((fret, i) => (fret < 0 ? [] : [OPEN_STRING_MIDI[i] + fret]))
}

export const LABEL_MODES = [
  { id: 'fret', label: 'Frets' },
  { id: 'note', label: 'Notes' },
  { id: 'finger', label: 'Fingers' },
]

/** What to write on a finger dot for the chosen label mode (F35). */
export function dotLabel(chord, stringIndex, mode) {
  const fret = chord.frets[stringIndex]
  if (mode === 'note') return noteAt(stringIndex, fret)
  if (mode === 'finger') return String(chord.fingers[stringIndex] || '')
  return String(fret)
}