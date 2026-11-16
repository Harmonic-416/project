import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { midiToMusicXml } from '../src/tabs/vocal/midi/midiToMusicXml.js'
import { extractPart } from '../src/tabs/vocal/notation/partFilter.js'
import {
  keyInterval,
  pitchToMidi,
  readKey,
  readPartNotes,
  songKey,
  spellMidi,
  spellPitchClass,
  transposeMusicXml,
  transposePitch,
} from '../src/tabs/vocal/transpose/transposeXml.js'

const note = (step, octave, { alter = 0, accidental = null, extra = '' } = {}) =>
  `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>` +
  `<duration>2</duration><type>quarter</type>${accidental ? `<accidental>${accidental}</accidental>` : ''}${extra}</note>`

function score({ fifths = 0, mode = null, body, clef = '<clef><sign>G</sign><line>2</line></clef>', second = null }) {
  const part = (id, inner) =>
    `<part id="${id}"><measure number="1"><attributes><divisions>2</divisions>` +
    `<key><fifths>${fifths}</fifths>${mode ? `<mode>${mode}</mode>` : ''}</key>` +
    `<time><beats>4</beats><beat-type>4</beat-type></time>${clef}</attributes>${inner}</measure></part>`
  return (
    '<?xml version="1.0"?><score-partwise version="4.0"><part-list>' +
    '<score-part id="P1"><part-name>Voice</part-name></score-part>' +
    (second ? '<score-part id="P2"><part-name>Piano</part-name></score-part>' : '') +
    `</part-list>${part('P1', body)}${second ? part('P2', second) : ''}</score-partwise>`
  )
}

const pitches = (xml) =>
  [...xml.matchAll(/<pitch>([\s\S]*?)<\/pitch>/g)].map((m) => {
    const step = m[1].match(/<step>(.)<\/step>/)[1]
    const alter = Number(m[1].match(/<alter>(-?\d+)<\/alter>/)?.[1] ?? 0)
    const octave = m[1].match(/<octave>(\d+)<\/octave>/)[1]
    return `${step}${alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter)}${octave}`
  })
const fifthsOf = (xml) => [...xml.matchAll(/<fifths>(-?\d+)<\/fifths>/g)].map((m) => Number(m[1]))

describe('spelling', () => {
  it('spells scale notes from the key and the rest by its side', () => {
    expect(spellPitchClass(10, -1)).toEqual({ step: 'B', alter: -1 }) // Bb in F
    expect(spellPitchClass(6, 1)).toEqual({ step: 'F', alter: 1 }) // F# in G
    expect(spellPitchClass(1, 0)).toEqual({ step: 'C', alter: 1 }) // C# in C
    expect(spellPitchClass(1, -1)).toEqual({ step: 'D', alter: -1 }) // Db in F
    expect(spellPitchClass(11, -1)).toEqual({ step: 'B', alter: 0 }) // B natural in F, not Cb
    expect(spellPitchClass(5, 1)).toEqual({ step: 'F', alter: 0 }) // F natural in G, not E#
    expect(spellPitchClass(11, -6)).toEqual({ step: 'C', alter: -1 }) // Cb belongs to Gb major
    expect(spellPitchClass(10, 0)).toEqual({ step: 'B', alter: -1 }) // C major borrows Bb…
    expect(spellPitchClass(6, 0)).toEqual({ step: 'F', alter: 1 }) // …and raises to F#
  })

  it('round-trips MIDI numbers, octave included', () => {
    for (const fifths of [-6, -3, 0, 2, 6]) {
      for (let midi = 36; midi <= 84; midi += 1) expect(pitchToMidi(spellMidi(midi, fifths))).toBe(midi)
    }
    expect(spellMidi(71, -6)).toEqual({ step: 'C', alter: -1, octave: 5 }) // Cb5 sounds as B4
  })
})

describe('keyInterval / transposePitch', () => {
  it('moves by the interval between the keys', () => {
    expect(keyInterval(0, -3)).toEqual({ newFifths: 3, steps: -2 }) // C → A: down a third
    expect(keyInterval(0, 2)).toEqual({ newFifths: 2, steps: 1 }) // C → D: up a second
    expect(keyInterval(0, 12)).toEqual({ newFifths: 0, steps: 7 }) // an octave
    expect(keyInterval(-1, -2)).toEqual({ newFifths: -3, steps: -1 }) // F → Eb
    expect(keyInterval(0, 1)).toEqual({ newFifths: -5, steps: 1 }) // C → Db: up a minor second
  })

  it('respells notes, accidentals included', () => {
    const { steps, newFifths } = keyInterval(0, -3)
    expect(transposePitch({ step: 'G', alter: 0, octave: 5 }, -3, steps, newFifths)).toEqual({ step: 'E', alter: 0, octave: 5 })
    expect(transposePitch({ step: 'F', alter: 1, octave: 4 }, -3, steps, newFifths)).toEqual({ step: 'D', alter: 1, octave: 4 })
    expect(transposePitch({ step: 'C', alter: 0, octave: 5 }, -3, steps, newFifths)).toEqual({ step: 'A', alter: 0, octave: 4 })
    expect(transposePitch({ step: 'B', alter: -1, octave: 4 }, -3, steps, newFifths)).toEqual({ step: 'G', alter: 0, octave: 4 })
  })
})

describe('transposeMusicXml', () => {
  const tune = score({ body: note('G', 4) + note('C', 5) + note('F', 5, { alter: 1, accidental: 'sharp' }) + note('G', 5) })

  it('returns the score untouched for no move', () => {
    expect(transposeMusicXml(tune, 0)).toBe(tune)
  })

  it('moves the key signature and spells the notes in the new key', () => {
    const down3 = transposeMusicXml(tune, -3)
    expect(fifthsOf(down3)).toEqual([3]) // A major
    expect(pitches(down3)).toEqual(['E4', 'A4', 'D#5', 'E5'])
    expect(down3).toContain('<accidental>sharp</accidental>')
  })

  it('goes to flat keys with flats', () => {
    const up1 = transposeMusicXml(tune, 1)
    expect(fifthsOf(up1)).toEqual([-5]) // Db major
    expect(pitches(up1)).toEqual(['Ab4', 'Db5', 'G5', 'Ab5'])
    // The printed sharp on F# is now a natural on G (Db major has Gb).
    expect(up1).toContain('<accidental>natural</accidental>')
  })

  it('moves the sounding pitch by exactly the shift, for every shift', () => {
    const before = readPartNotes(tune).map((n) => n.midi)
    for (let s = -12; s <= 12; s += 1) {
      expect(readPartNotes(transposeMusicXml(tune, s)).map((n) => n.midi)).toEqual(before.map((m) => m + s))
    }
  })

  it('keeps minor mode and everything that is not a pitch', () => {
    const minor = score({ fifths: -1, mode: 'minor', body: note('D', 5, { extra: '<lyric><text>la</text></lyric>' }) + '<note><rest/><duration>2</duration></note>' })
    const up2 = transposeMusicXml(minor, 2)
    expect(readKey(up2)).toEqual({ fifths: 1, mode: 'minor' }) // D minor → E minor
    expect(pitches(up2)).toEqual(['E5'])
    expect(up2).toContain('<lyric><text>la</text></lyric>')
    expect(up2).toContain('<rest/>')
  })

  it('follows a key change partway through a part', () => {
    const changing = score({
      body:
        note('C', 5) +
        '</measure><measure number="2"><attributes><key><fifths>-3</fifths></key></attributes>' +
        note('E', 5, { alter: -1 }),
    })
    const up2 = transposeMusicXml(changing, 2)
    expect(fifthsOf(up2)).toEqual([2, -1]) // C → D, Eb → F
    expect(pitches(up2)).toEqual(['D5', 'F5'])
  })

  it('moves chord symbols with the notes', () => {
    const chords = score({
      body:
        '<harmony><root><root-step>F</root-step></root><kind>major</kind><bass><bass-step>A</bass-step></bass></harmony>' +
        note('A', 4) +
        '<harmony><root><root-step>B</root-step><root-alter>-1</root-alter></root><kind>major</kind></harmony>' +
        note('B', 4, { alter: -1 }),
    })
    const down2 = transposeMusicXml(chords, -2)
    expect(down2).toContain('<root-step>E</root-step><root-alter>-1</root-alter>')
    expect(down2).toContain('<bass-step>G</bass-step>')
    expect(down2).toContain('<root-step>A</root-step><root-alter>-1</root-alter>')
  })

  it('moves every part, so the accompaniment follows the voice', () => {
    const duet = score({ body: note('E', 5), second: note('C', 4) })
    const down3 = transposeMusicXml(duet, -3)
    expect(pitches(down3)).toEqual(['C#5', 'A3'])
    expect(fifthsOf(down3)).toEqual([3, 3])
  })

  it('respells MIDI-born notes in the new key', () => {
    const midi = new Midi()
    midi.header.setTempo(100)
    const track = midi.addTrack()
    track.name = 'Voice'
    ;[60, 63, 65, 70].forEach((n, i) => track.addNote({ midi: n, time: i * 0.6, duration: 0.6 })) // C D# F A# as written
    const xml = midiToMusicXml(new Midi(midi.toArray())).musicXml
    expect(pitches(xml)).toEqual(['C4', 'D#4', 'F4', 'A#4'])
    const down2 = transposeMusicXml(xml, -2, { respell: true })
    expect(fifthsOf(down2)[0]).toBe(-2) // Bb major
    expect(pitches(down2)).toEqual(['Bb3', 'Db4', 'Eb4', 'Ab4'])
  })

  it('puts a treble line moved into a man’s range in the treble-8vb clef, and back', () => {
    const down = transposeMusicXml(tune, -12)
    expect(down).toContain('<clef-octave-change>-1</clef-octave-change>')
    expect(transposeMusicXml(down, 12)).not.toContain('<clef-octave-change>')
    // A small move leaves the clef alone.
    expect(transposeMusicXml(tune, -3)).not.toContain('<clef-octave-change>')
    // So does a bass-clef part.
    const bass = score({ clef: '<clef><sign>F</sign><line>4</line></clef>', body: note('C', 3) })
    expect(transposeMusicXml(bass, -5)).toContain('<sign>F</sign><line>4</line></clef>')
  })

  it('transposes a real score end to end and still extracts its part', () => {
    const grace = readFileSync(new URL('../public/midi-files/amazing-grace.musicxml', import.meta.url), 'utf8')
    const before = readPartNotes(grace)
    const down3 = transposeMusicXml(grace, -3)
    expect(readKey(down3).fifths).toBe(3)
    expect(readPartNotes(down3).map((n) => n.midi)).toEqual(before.map((n) => n.midi - 3))
    expect(readPartNotes(down3).map((n) => n.duration)).toEqual(before.map((n) => n.duration))
    const id = grace.match(/<score-part id="([^"]+)"/)[1]
    expect(readPartNotes(extractPart(down3, id))).toHaveLength(before.length)
  })
})

describe('readPartNotes / readKey', () => {
  it('reads pitches and lengths in quarter notes, skipping rests', () => {
    const xml = score({ body: note('A', 4) + '<note><rest/><duration>2</duration></note>' + note('C', 5, { alter: 1 }) })
    expect(readPartNotes(xml)).toEqual([
      { midi: 69, duration: 1 },
      { midi: 73, duration: 1 },
    ])
    expect(readPartNotes(xml, 'P9')).toEqual([])
    expect(readPartNotes(null)).toEqual([])
  })

  it('reads the second part by id', () => {
    const duet = score({ body: note('E', 5), second: note('C', 4) })
    expect(readPartNotes(duet, 'P2')).toEqual([{ midi: 60, duration: 1 }])
  })

  it('names a MIDI file by its notes when its key signature is wrong', () => {
    // E major notes under a written Eb signature, as a MIDI file can have them.
    const body = [['E', 4], ['F', 4, 1], ['G', 4, 1], ['A', 4], ['B', 4], ['C', 5, 1], ['D', 5, 1], ['E', 5], ['B', 4], ['E', 4]]
      .map(([step, octave, alter = 0]) => note(step, octave, { alter }))
      .join('')
    const xml = score({ fifths: -3, body })
    expect(songKey(xml)).toEqual({ fifths: -3, mode: 'major' }) // spelling trusted: as written
    expect(songKey(xml, { trustSpelling: false })).toEqual({ fifths: 4, mode: 'major' })
    // Transposed from the key the notes are in: E down 3 is C# … spelled as Db (fewest accidentals).
    const down3 = transposeMusicXml(xml, -3, { respell: true, keyFifths: 4 })
    expect(fifthsOf(down3)).toEqual([-5])
    expect(pitches(down3).slice(0, 3)).toEqual(['Db4', 'Eb4', 'F4'])
  })

  it('defaults to C major', () => {
    expect(readKey('<score-partwise/>')).toEqual({ fifths: 0, mode: 'major' })
  })
})
