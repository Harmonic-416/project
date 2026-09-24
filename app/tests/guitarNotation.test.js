import { readFileSync } from 'node:fs'
import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { guitarMidiBytes, guitarProBytes } from '../src/tabs/guitar/notation/exportGuitarNotation.js'
import { detectGuitarFormat, loadGuitarNotation, scoreNotes } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { houseOfTheRisingSunNotes } from '../../tests/fixtures/guitar/generate.mjs'

const bytesOf = (relativePath) => {
  const buffer = readFileSync(new URL(relativePath, import.meta.url))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}
const encode = (text) => new TextEncoder().encode(text).buffer

const SONG = '../public/guitar-songs/house-of-the-rising-sun.musicxml'
const EXPECTED = houseOfTheRisingSunNotes()
const STANDARD_TUNING = [40, 45, 50, 55, 59, 64]

describe('detectGuitarFormat', () => {
  it('uses the extension first, then the bytes', () => {
    expect(detectGuitarFormat('song.gp5', new ArrayBuffer(4))).toBe('guitar-pro')
    expect(detectGuitarFormat('song.alphatex', new ArrayBuffer(4))).toBe('alphatex')
    expect(detectGuitarFormat('song.mxl', new ArrayBuffer(4))).toBe('mxl')
    expect(detectGuitarFormat('song', encode('MThd....'))).toBe('midi')
    expect(detectGuitarFormat('song', encode('<?xml version="1.0"?>'))).toBe('musicxml')
  })
})

describe('built-in song: House of the Rising Sun', () => {
  it('loads with six-string standard tuning and string/fret on every note', async () => {
    const notation = await loadGuitarNotation(bytesOf(SONG), 'house-of-the-rising-sun.musicxml')
    expect(notation.format).toBe('musicxml')
    expect(notation.title).toBe('House of the Rising Sun')
    expect(notation.hasTab).toBe(true)
    const staff = notation.score.tracks[0].staves[0]
    expect([...staff.stringTuning.tunings].sort((a, b) => a - b)).toEqual(STANDARD_TUNING)
    expect(staff.showTablature && staff.showStandardNotation).toBe(true) // F5: side by side
    const notes = scoreNotes(notation.score)
    expect(notes).toHaveLength(96)
    // The parsed score is the source of expected notes: pitches come from string + fret.
    expect(notes.map((n) => n.realValue)).toEqual(EXPECTED.map((n) => n.midi))
  })

  it('exports MIDI with the same pitches, eighth-note onsets and one tempo', async () => {
    const notation = await loadGuitarNotation(bytesOf(SONG), 'house-of-the-rising-sun.musicxml')
    const midi = new Midi(guitarMidiBytes(notation))
    const track = midi.tracks.find((t) => t.notes.length > 0)
    expect(track.notes.map((n) => n.midi)).toEqual(EXPECTED.map((n) => n.midi))
    const eighth = midi.header.ppq / 2
    track.notes.forEach((note, i) => expect(note.ticks).toBe(i * eighth))
    expect(midi.header.tempos.map((t) => Math.round(t.bpm))).toEqual([90])
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([6, 8])
    expect(midi.duration).toBeCloseTo(32, 1) // 16 bars of 6/8 at quarter = 90
  })

  it('round-trips through Guitar Pro 7 with the tab intact', async () => {
    const notation = await loadGuitarNotation(bytesOf(SONG), 'house-of-the-rising-sun.musicxml')
    const reloaded = await loadGuitarNotation(guitarProBytes(notation).buffer, 'house-of-the-rising-sun.gp')
    expect(reloaded.format).toBe('guitar-pro')
    expect(reloaded.hasTab).toBe(true)
    const notes = scoreNotes(reloaded.score)
    expect(notes.map((n) => [n.realValue, n.fret])).toEqual(EXPECTED.map((n) => [n.midi, n.fret]))
  })
})

describe('other sources', () => {
  it('opens a MIDI file as notation without tab and exports its original bytes', async () => {
    const source = bytesOf('../../tests/fixtures/midi/twinkle.mid')
    const notation = await loadGuitarNotation(source, 'twinkle.mid')
    expect(notation.format).toBe('midi')
    expect(notation.hasTab).toBe(false)
    expect(scoreNotes(notation.score).length).toBeGreaterThan(0)
    expect(guitarMidiBytes(notation)).toEqual(new Uint8Array(source))
  })

  it('unzips MXL before loading', async () => {
    const notation = await loadGuitarNotation(bytesOf('../../tests/fixtures/musicxml/ode-to-joy.mxl'), 'ode-to-joy.mxl')
    expect(notation.format).toBe('mxl')
    expect(scoreNotes(notation.score).length).toBeGreaterThan(0)
  })

  it('reads alphaTex with its frets', async () => {
    const tex = '\\title "E minor" . (0.6 2.5 2.4 0.3 0.2 0.1).1'
    const notation = await loadGuitarNotation(encode(tex), 'e-minor.alphatex')
    expect(notation.title).toBe('E minor')
    expect(notation.hasTab).toBe(true)
    const notes = scoreNotes(notation.score)
    expect(notes.map((n) => n.realValue).sort((a, b) => a - b)).toEqual([40, 47, 52, 55, 59, 64])
  })

  it('reports a file it cannot read', async () => {
    await expect(loadGuitarNotation(encode('not a score'), 'broken.gp')).rejects.toThrow(/guitar notation/)
  })
})
