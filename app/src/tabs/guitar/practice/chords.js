/**
 * Common open-chord shapes and the small bits of music maths around them:
 * ear training plays and draws them, and the note judge's tests strum them.
 * Pure data + functions (no React), unit-tested in app/tests/chords.test.js.
 *
 * Strings are listed low to high, the way a chord chart reads left to right:
 * index 0 = low E (6th string) … index 5 = high e (1st string).
 * Fret -1 = don't play the string (✕), 0 = open string (○).
 * Finger 1 = index … 4 = pinky, 0 = no finger.
 * Quality is the chord's kind, as ear training asks about it: 'major',
 * 'minor', '7', 'maj7', 'sus2' or 'sus4' (chordNames.js names the rest).
 * Chords made from a name alone (chordNames.js) have `midis` instead of frets.
 */

export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'E']

// Standard tuning as MIDI note numbers: E2 A2 D3 G3 B3 E4.
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64]

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const CHORDS = [
  { id: 'Em', name: 'E minor', quality: 'minor', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  { id: 'Am', name: 'A minor', quality: 'minor', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  { id: 'C', name: 'C major', quality: 'major', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  { id: 'G', name: 'G major', quality: 'major', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  { id: 'D', name: 'D major', quality: 'major', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  { id: 'E', name: 'E major', quality: 'major', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  { id: 'A', name: 'A major', quality: 'major', frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  { id: 'Dm', name: 'D minor', quality: 'minor', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  // The small F: the first finger lies across the B and high e strings.
  { id: 'F', name: 'F major', quality: 'major', frets: [-1, -1, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1] },
  { id: 'A7', name: 'A seventh', quality: '7', frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  { id: 'D7', name: 'D seventh', quality: '7', frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  { id: 'E7', name: 'E seventh', quality: '7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  { id: 'G7', name: 'G seventh', quality: '7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  { id: 'C7', name: 'C seventh', quality: '7', frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  { id: 'B7', name: 'B seventh', quality: '7', frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  { id: 'Asus2', name: 'A sus2', quality: 'sus2', frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0] },
  { id: 'Dsus2', name: 'D sus2', quality: 'sus2', frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0] },
  { id: 'Dsus4', name: 'D sus4', quality: 'sus4', frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] },
  { id: 'Cmaj7', name: 'C major 7', quality: 'maj7', frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  { id: 'Fmaj7', name: 'F major 7', quality: 'maj7', frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
]

/** Note name ("G", "F#") of a string at a fret, or null for a string that isn't played. */
export function noteAt(stringIndex, fret) {
  if (fret < 0) return null
  return NOTE_NAMES[(OPEN_STRING_MIDI[stringIndex] + fret) % 12]
}

/** MIDI notes the chord sounds, low to high (muted strings left out). Used by the chord sound and chord detection. */
export function chordMidi(chord) {
  if (!chord.frets) return chord.midis
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