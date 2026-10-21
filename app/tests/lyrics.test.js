import { describe, expect, it } from 'vitest'
import { alignLyrics, placeLyrics, syllables } from '../src/tabs/vocal/arrange/lyrics.js'

describe('syllables for singing', () => {
  it('splits words by their vowel sounds', () => {
    const cases = {
      love: ['love'],
      dreams: ['dreams'],
      threw: ['threw'],
      time: ['time'],
      over: ['o', 'ver'],
      baby: ['ba', 'by'],
      little: ['lit', 'tle'],
      twinkle: ['twin', 'kle'],
      table: ['ta', 'ble'],
      singing: ['sing', 'ing'],
      nothing: ['no', 'thing'],
      dreamed: ['dreamed'],
      wanted: ['wan', 'ted'],
      yesterday: ['yes', 'ter', 'day'],
      "don't": ["don't"],
      "love's": ["love's"],
      "lover's": ['lo', "ver's"],
      "couldn't": ["couldn't"],
      "nothing's,": ['no', "thing's,"],
      together: ['to', 'ge', 'ther'],
      a: ['a'],
    }
    for (const [word, parts] of Object.entries(cases)) expect(syllables(word), word).toEqual(parts)
  })

  it('keeps the word’s own letters and case', () => {
    expect(syllables('Over').join('')).toBe('Over')
    expect(syllables('Yesterday,').join('')).toBe('Yesterday,')
  })
})

describe('lining Whisper up with the published lyrics', () => {
  const heard = [
    { text: 'I', start: 10, end: 10.2 },
    { text: 'just', start: 10.2, end: 10.5 },
    { text: 'through', start: 10.5, end: 10.9 }, // misheard "threw"
    { text: 'out', start: 10.9, end: 11.2 },
    { text: 'the', start: 11.2, end: 11.3 },
    // "love" not heard
    { text: 'of', start: 11.8, end: 12 },
    { text: 'my', start: 12, end: 12.2 },
    { text: 'dreams', start: 12.2, end: 13 },
    { text: 'uh', start: 13.5, end: 13.6 }, // not in the lyrics
  ]
  const text = '[Verse 1]\nI just threw out the love of my dreams\n\nInto the trash heap'

  it('takes the published words, timed by what was heard', () => {
    const { words, source } = alignLyrics(heard, { text, synced: null })
    expect(source).toBe('official')
    expect(words.map((w) => w.text)).toEqual(['I', 'just', 'threw', 'out', 'the', 'love', 'of', 'my', 'dreams'])
    // "threw" is too far from "through" to match: it goes between "just" and "out".
    expect(words[2].start).toBeGreaterThanOrEqual(10.5)
    expect(words[2].start).toBeLessThan(10.9)
    expect(words[3]).toMatchObject({ text: 'out', start: 10.9 })
    expect(words[5].start).toBeGreaterThan(11.3) // love, between "the" and "of"
    expect(words[5].start).toBeLessThan(11.8)
  })

  it('keeps a repeated chorus in its own line when the lines are timed', () => {
    const chorus = 'He is in my eyes'
    const synced = [
      { time: 10, line: chorus },
      { time: 20, line: 'I breathe love' },
      { time: 30, line: chorus },
    ]
    // Whisper heard only the second chorus.
    const later = ['He', 'is', 'in', 'my', 'eyes'].map((text, i) => ({ text, start: 30.5 + i * 0.4, end: 30.8 + i * 0.4 }))
    const { words } = alignLyrics([{ text: '[Music]', start: 0, end: 9 }, ...later], { text: [chorus, 'I breathe love', chorus].join('\n'), synced })
    expect(words.map((w) => w.text).join(' ')).toBe('He is in my eyes I breathe love He is in my eyes')
    expect(words.slice(0, 5).every((w) => w.start >= 10 && w.start < 20)).toBe(true) // the first chorus where it's sung
    expect(words[5].start).toBe(20)
    expect(words.slice(8).map((w) => w.start)).toEqual([30.5, 30.9, 31.3, 31.7, 32.1]) // the second, as heard
    for (let i = 1; i < words.length; i += 1) expect(words[i].start).toBeGreaterThan(words[i - 1].start)
  })

  it('places a line Whisper missed by its synced time', () => {
    const synced = [
      { time: 10, line: 'I just threw out the love of my dreams' },
      { time: 15, line: 'Into the trash heap' },
    ]
    const later = [...heard.slice(0, 8), { text: 'heap', start: 16.5, end: 17 }]
    const { words } = alignLyrics(later, { text, synced })
    expect(words.map((w) => w.text).slice(-4)).toEqual(['Into', 'the', 'trash', 'heap'])
    expect(words.find((w) => w.text === 'Into').start).toBe(15)
  })

  it('uses the heard words when there are no lyrics', () => {
    expect(alignLyrics(heard, null)).toEqual({ words: heard, source: 'heard' })
    expect(alignLyrics([{ text: '♪', start: 0, end: 1 }, ...heard], null).words).toEqual(heard)
  })
})

describe('lyrics under the notes', () => {
  const toSlot = (seconds) => Math.round(seconds * 4) // a beat a second
  const melody = [0, 4, 8, 10, 12, 16, 20].map((start, i, all) => ({ start, end: all[i + 1] ?? 24, midi: 60 + i }))

  it('puts one syllable on each note, holds a syllable over extra notes, and runs syllables together on too few', () => {
    const words = [
      { text: 'Love', start: 0, end: 0.9 },
      { text: 'over', start: 1, end: 2.4 }, // three notes, two syllables: the last held
      { text: 'me', start: 3, end: 4.9 }, // two notes, one syllable: held
      { text: 'yesterday', start: 5, end: 5.8 }, // one note, three syllables
    ]
    const sung = placeLyrics(melody, words, toSlot)
    expect(sung.map((e) => e.lyric ?? null)).toEqual([
      { text: 'Love', syllabic: 'single' },
      { text: 'o', syllabic: 'begin' },
      { text: 'ver', syllabic: 'end' },
      null,
      { text: 'me', syllabic: 'single' },
      null,
      { text: 'yesterday', syllabic: 'single' },
    ])
  })

  it('leaves out a word with no note of its own', () => {
    const sung = placeLyrics(melody.slice(0, 1), [{ text: 'lost', start: 9, end: 9.5 }], toSlot)
    expect(sung[0].lyric).toBeUndefined()
  })
})
