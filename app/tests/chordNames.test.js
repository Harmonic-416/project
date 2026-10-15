import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import {
  chordFor,
  chordNamesOf,
  chordsFor,
  loadSongChords,
  parseChordName,
  saveSongChords,
} from '../src/tabs/guitar/practice/chordNames.js'
import { CHORDS, chordMidi } from '../src/tabs/guitar/practice/chords.js'

const song = async (file) => {
  const buffer = readFileSync(new URL(`../public/guitar-songs/${file}`, import.meta.url))
  return (await loadGuitarNotation(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), file)).score
}
const pitchClasses = (chord) => [...new Set(chordMidi(chord).map((midi) => midi % 12))].sort((a, b) => a - b)

describe('chord names', () => {
  it('reads the usual spellings into one id per chord', () => {
    const ids = (names) => names.map((name) => parseChordName(name)?.id ?? null)
    expect(ids(['A', 'Amaj', 'AM'])).toEqual(['A', 'A', 'A'])
    expect(ids(['Am', 'Amin', 'A-'])).toEqual(['Am', 'Am', 'Am'])
    expect(ids(['A7', 'Amaj7', 'AM7', 'AΔ7', 'Am7', 'Amin7'])).toEqual(['A7', 'Amaj7', 'Amaj7', 'Amaj7', 'Am7', 'Am7'])
    expect(ids(['Asus', 'Asus4', 'Asus2', 'Bdim', 'C+', 'E5'])).toEqual(['Asus4', 'Asus4', 'Asus2', 'Bdim', 'Caug', 'E5'])
    expect(ids(['F#m', 'F♯m', 'Bb7', 'B♭7', 'D/F#'])).toEqual(['F#m', 'F#m', 'Bb7', 'Bb7', 'D'])
    expect(ids(['', 'N.C.', 'H7', 'Cadd9', null])).toEqual([null, null, null, null, null])
  })

  it('knows the pitch class of sharps and flats', () => {
    expect(parseChordName('F#m').pitchClass).toBe(6)
    expect(parseChordName('Bb').pitchClass).toBe(10)
    expect(parseChordName('Cb').pitchClass).toBe(11)
  })
})

describe('chords to play', () => {
  it('uses the open shape when there is one', () => {
    expect(chordFor('Am')).toBe(CHORDS.find((c) => c.id === 'Am'))
    expect(chordFor('Dsus')).toBe(CHORDS.find((c) => c.id === 'Dsus4'))
  })

  it('otherwise sounds the root low and the chord an octave up', () => {
    const fsm = chordFor('F#m')
    expect(fsm).toMatchObject({ id: 'F#m', name: 'F# minor', quality: 'minor' })
    expect(fsm.frets).toBeUndefined()
    expect(fsm.midis).toEqual([42, 54, 57, 61]) // F#2, then F#3 A3 C#4
    expect(pitchClasses(chordFor('Bb7'))).toEqual([2, 5, 8, 10]) // Bb D F Ab
    expect(chordFor('D#dim').midis[0]).toBe(51) // roots stay between E2 and D#3
  })

  it('lists each playable chord once, leaving out what it can’t sound', () => {
    expect(chordsFor(['Am', 'C', 'Am', 'F#m', 'N.C.', 'Amin']).map((c) => c.id)).toEqual(['Am', 'C', 'F#m'])
    expect(chordsFor(undefined)).toEqual([])
  })
})

describe('the chords a song uses', () => {
  afterEach(() => {
    delete globalThis.localStorage
  })

  it('reads them from the score, in order of first use', async () => {
    expect(chordNamesOf(await song('four-chord-strum.musicxml'))).toEqual(['Em', 'C', 'G', 'D'])
    expect(chordNamesOf(await song('house-of-the-rising-sun.musicxml'))).toEqual(['Am', 'C', 'D', 'F', 'E'])
    expect(chordNamesOf(await song('ode-to-joy.musicxml'))).toEqual([]) // a melody
  })

  it('remembers the last song opened that has chords', () => {
    const store = new Map()
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
    expect(loadSongChords()).toBeNull()
    saveSongChords('Four-Chord Strum', ['Em', 'C', 'G', 'D'])
    saveSongChords('Ode to Joy', []) // no chords: keeps the last one
    expect(loadSongChords()).toEqual({ title: 'Four-Chord Strum', chords: ['Em', 'C', 'G', 'D'] })
  })
})
