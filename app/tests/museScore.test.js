// @vitest-environment jsdom
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { museScoreToXml } from '../src/tabs/guitar/notation/museScore.js'
import { loadGuitarNotation, scoreNotes } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { guitarMidiBytes, guitarProBytes } from '../src/tabs/guitar/notation/exportGuitarNotation.js'

const encode = (text) => new TextEncoder().encode(text).buffer
const chord = (pitch, type = 'quarter', extra = '') => `<Chord><durationType>${type}</durationType>${extra}<Note><pitch>${pitch}</pitch></Note></Chord>`
const source = (voice, title = 'First &amp; second') => `<museScore version="4.0"><Score><metaTag name="workTitle">${title}</metaTag><Part><Staff id="1"/><trackName>Guitar</trackName></Part><Staff id="1"><Measure><voice><TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig><Tempo><tempo>2</tempo></Tempo>${voice}</voice></Measure></Staff></Score></museScore>`

describe('best-effort native MuseScore import', () => {
  it('imports pitches, rests, dotted rhythm and tempo, and exports both playable formats', async () => {
    const notation = await loadGuitarNotation(encode(source(`${chord(52, 'quarter', '<dots>1</dots>')}<Rest><durationType>eighth</durationType></Rest>${chord(55, 'half')}`)), 'song.mscx')
    expect(notation.format).toBe('musescore')
    expect(notation.title).toBe('First & second')
    expect(scoreNotes(notation.score).map((n) => n.realValue)).toEqual([52, 55])
    expect(notation.hasTab).toBe(true)
    const midi = new Midi(guitarMidiBytes(notation))
    const notes = midi.tracks.flatMap((track) => track.notes)
    expect(notes.map((n) => n.midi)).toEqual([52, 55])
    expect(notes[0].duration).toBeCloseTo(.75, 1)
    expect(notes[1].time).toBeCloseTo(1, 1)
    expect(guitarProBytes(notation).byteLength).toBeGreaterThan(100)
  })
  it('opens compressed MuseScore files without sending them anywhere', async () => {
    const zip = new JSZip()
    zip.file('score.mscx', source(chord(64)))
    const notation = await loadGuitarNotation(await zip.generateAsync({ type: 'arraybuffer' }), 'song.mscz')
    expect(scoreNotes(notation.score).map((n) => n.realValue)).toEqual([64])
  })
  it('keeps simultaneous notes as a chord', () => {
    const xml = museScoreToXml(source('<Chord><durationType>whole</durationType><Note><pitch>52</pitch></Note><Note><pitch>55</pitch></Note></Chord>'))
    expect(xml).toContain('<chord/>')
    expect(xml.match(/<duration>1920<\/duration>/g)).toHaveLength(2)
  })
  it.each(['<Tuplet/>', '<Spanner type="Tie"/>', '<startRepeat/>', '<grace8/>', '<location/>'])('rejects unsupported timing instead of silently changing it: %s', (unsupported) => {
    expect(() => museScoreToXml(source(chord(64) + unsupported))).toThrow('export it as MusicXML')
  })
  it('rejects malformed input, overfull bars and multiple voices', () => {
    expect(() => museScoreToXml('<museScore>')).toThrow('not a readable')
    expect(() => museScoreToXml(source(chord(64, 'whole') + chord(65)))).toThrow('export it as MusicXML')
    expect(() => museScoreToXml(source(chord(64)).replace('</voice>', '</voice><voice/>'))).toThrow('export it as MusicXML')
  })
})
