import { CHORDS } from './chords.js'

/**
 * Chord names, as songs write them ("F#m", "Bb7", "Cmaj7", "D/F#"), turned
 * into chords the app can play: a shape from CHORDS when there is one, or
 * else the chord's notes, the root low with the chord an octave above, which
 * is enough to hear it by. Also reads the chord names a song uses (alphaTab
 * keeps them on its beats), so ear training can quiz the chords of the song
 * being learned. Pure apart from the storage helpers; unit-tested in
 * app/tests/chordNames.test.js.
 *
 *   chord: { id, name, quality, frets, fingers } or { id, name, quality, midis }
 */

const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ACCIDENTALS = { '': 0, '#': 1, b: -1 }

// Each kind with the ways songs spell it after the root. Case matters: M is major, m minor.
const KINDS = [
  { quality: 'major', suffix: '', word: 'major', intervals: [0, 4, 7], spellings: ['', 'maj', 'M', 'major'] },
  { quality: 'minor', suffix: 'm', word: 'minor', intervals: [0, 3, 7], spellings: ['m', 'min', 'mi', '-', 'minor'] },
  { quality: '7', suffix: '7', word: 'seventh', intervals: [0, 4, 7, 10], spellings: ['7', 'dom7'] },
  { quality: 'maj7', suffix: 'maj7', word: 'major 7', intervals: [0, 4, 7, 11], spellings: ['maj7', 'M7', 'ma7', 'Δ7', 'Δ'] },
  { quality: 'm7', suffix: 'm7', word: 'minor 7', intervals: [0, 3, 7, 10], spellings: ['m7', 'min7', 'mi7', '-7'] },
  { quality: 'sus2', suffix: 'sus2', word: 'sus2', intervals: [0, 2, 7], spellings: ['sus2'] },
  { quality: 'sus4', suffix: 'sus4', word: 'sus4', intervals: [0, 5, 7], spellings: ['sus4', 'sus'] },
  { quality: 'dim', suffix: 'dim', word: 'diminished', intervals: [0, 3, 6], spellings: ['dim', '°', 'o'] },
  { quality: 'aug', suffix: 'aug', word: 'augmented', intervals: [0, 4, 8], spellings: ['aug', '+'] },
  { quality: '5', suffix: '5', word: 'power chord', intervals: [0, 7], spellings: ['5'] },
]

const LOWEST_ROOT = 40 // E2, the low E string: roots go from here up to D#3

/**
 * { id, rootName, pitchClass, quality, word, intervals } for a chord name,
 * or null when it isn't one the app knows how to sound. A bass note after a
 * slash ("D/F#") is left out; the id uses the kind's usual suffix ("Am7").
 */
export function parseChordName(name) {
  const text = String(name ?? '')
    .trim()
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/\/[A-G][#b]?$/, '')
  const match = text.match(/^([A-G])([#b]?)(.*)$/)
  if (!match) return null
  const [, letter, accidental, rest] = match
  const kind = KINDS.find((k) => k.spellings.includes(rest.trim()))
  if (!kind) return null
  const rootName = letter + accidental
  return {
    id: rootName + kind.suffix,
    rootName,
    pitchClass: (ROOTS[letter] + ACCIDENTALS[accidental] + 12) % 12,
    quality: kind.quality,
    word: kind.word,
    intervals: kind.intervals,
  }
}

/** A playable chord for a name: the CHORDS shape if there is one, or its notes; null if unknown. */
export function chordFor(name) {
  const parsed = parseChordName(name)
  if (!parsed) return null
  const shape = CHORDS.find((c) => c.id === parsed.id)
  if (shape) return shape
  const root = LOWEST_ROOT + ((parsed.pitchClass - (LOWEST_ROOT % 12) + 12) % 12)
  return {
    id: parsed.id,
    name: `${parsed.rootName} ${parsed.word}`,
    quality: parsed.quality,
    midis: [root, ...parsed.intervals.map((interval) => root + 12 + interval)],
  }
}

/** The playable chords for a list of names, each once, in order; names the app can't sound are left out. */
export function chordsFor(names) {
  const chords = []
  for (const name of names ?? []) {
    const chord = chordFor(name)
    if (chord && !chords.some((c) => c.id === chord.id)) chords.push(chord)
  }
  return chords
}

/** The chord names an alphaTab score marks, in order of first use. */
export function chordNamesOf(score) {
  const names = []
  for (const track of score?.tracks ?? []) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            const name = beat.chord?.name?.trim()
            if (name && !names.includes(name)) names.push(name)
          }
        }
      }
    }
  }
  return names
}

// ── The last song opened that has chord names, for "Chords from my song" ──

const SONG_KEY = 'harmonic.guitar.earSongChords'

/** { title, chords: [name] } of the last song opened with chord names, or null. */
export function loadSongChords() {
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(SONG_KEY) ?? 'null')
    return saved && Array.isArray(saved.chords) ? saved : null
  } catch {
    return null
  }
}

/** Remember a song's chord names; a song without any leaves the last one in place. */
export function saveSongChords(title, names) {
  if (!names?.length) return
  try {
    globalThis.localStorage.setItem(SONG_KEY, JSON.stringify({ title, chords: names }))
  } catch {
    // Private window or blocked storage: ear training just won't offer the song.
  }
}
