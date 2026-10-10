import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addGuitarTab, assignFrets, STANDARD_TUNING } from '../src/tabs/guitar/notation/fretAssign.js'
import { loadGuitarNotation, scoreNotes } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { midiToMusicXml } from '../src/tabs/vocal/midi/midiToMusicXml.js'
import { parseMidiFile } from '../src/tabs/vocal/midi/parseMidi.js'

const bytesOf = (relativePath) => {
  const buffer = readFileSync(new URL(relativePath, import.meta.url))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

const pitchAt = ({ string, fret }) => STANDARD_TUNING[string - 1] + fret

describe('assignFrets', () => {
  it('puts every note where it sounds right', () => {
    const groups = [[60], [62], [64], [65], [67], [69], [71], [72]]
    const shapes = assignFrets(groups)
    shapes.forEach((shape, i) => expect(pitchAt(shape[0])).toBe(groups[i][0]))
  })

  it('plays a C major scale in open position', () => {
    const shapes = assignFrets([[48], [50], [52], [53], [55], [57], [59], [60]])
    for (const [{ fret }] of shapes) expect(fret).toBeLessThanOrEqual(3)
  })

  it('finds the open E minor shape', () => {
    const [shape] = assignFrets([[40, 47, 52, 55, 59, 64]])
    expect(shape.map(({ string, fret }) => [string, fret])).toEqual([
      [6, 0],
      [5, 2],
      [4, 2],
      [3, 0],
      [2, 0],
      [1, 0],
    ])
  })

  it('keeps chords within a four-fret stretch on separate strings', () => {
    const [shape] = assignFrets([[45, 52, 57, 61, 64]]) // A major
    expect(new Set(shape.map((p) => p.string)).size).toBe(5)
    const fretted = shape.filter((p) => p.fret > 0).map((p) => p.fret)
    expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4)
  })

  it('stays in one place on the neck rather than jumping around', () => {
    // A high phrase: once up at the 7th position, it should stay there.
    const shapes = assignFrets([[71], [72], [74], [76], [74], [72], [71]])
    const hands = shapes.map(([{ fret }]) => fret)
    expect(Math.max(...hands) - Math.min(...hands)).toBeLessThanOrEqual(5)
  })

  it('gives up on notes the guitar cannot play, and carries on after them', () => {
    const shapes = assignFrets([[60], [30], [64], [40, 41, 42, 43, 44, 45, 46]])
    expect(shapes[0]).not.toBeNull()
    expect(shapes[1]).toBeNull()
    expect(pitchAt(shapes[2][0])).toBe(64)
    expect(shapes[3]).toBeNull() // seven notes, six strings
  })
})

describe('addGuitarTab', () => {
  it('adds strings, frets, a six-string tuning and the guitar clef to converted MIDI', async () => {
    const midi = await parseMidiFile(bytesOf('../../tests/fixtures/midi/twinkle.mid'))
    const { musicXml, tabbedParts } = addGuitarTab(midiToMusicXml(midi).musicXml)
    expect(tabbedParts).toBe(1)
    expect(musicXml).toContain('<staff-lines>6</staff-lines>')
    expect(musicXml).toContain('<clef-octave-change>-1</clef-octave-change>')
    const notes = (musicXml.match(/<note>[\s\S]*?<\/note>/g) ?? []).filter((n) => !n.includes('<rest'))
    expect(notes.every((n) => /<technical><string>\d<\/string><fret>\d+<\/fret><\/technical>/.test(n))).toBe(true)
  })

  it('leaves a part with unplayable notes as notation only', async () => {
    const midi = await parseMidiFile(bytesOf('../../tests/fixtures/midi/synth_extreme_pitch_zero_dur.mid'))
    const source = midiToMusicXml(midi).musicXml
    const { musicXml, tabbedParts } = addGuitarTab(source)
    expect(tabbedParts).toBe(0)
    expect(musicXml).toBe(source)
  })
})

describe('MIDI songs in the Guitar tab', () => {
  it('open with tab, every note at its own pitch', async () => {
    const notation = await loadGuitarNotation(bytesOf('../../tests/fixtures/midi/twinkle.mid'), 'twinkle.mid')
    expect(notation.hasTab).toBe(true)
    const midi = await parseMidiFile(bytesOf('../../tests/fixtures/midi/twinkle.mid'))
    const expected = midi.tracks.flatMap((t) => t.notes.map((n) => n.midi))
    expect(scoreNotes(notation.score).map((n) => n.realValue)).toEqual(expected)
  })
})
