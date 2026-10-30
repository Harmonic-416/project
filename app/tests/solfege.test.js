import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { addSolfege, doName, scoreKey, solfegeSyllable } from '../src/tabs/vocal/notation/solfege.js'
import { midiToMusicXml } from '../src/tabs/vocal/midi/midiToMusicXml.js'
import { extractPart } from '../src/tabs/vocal/notation/partFilter.js'

const library = (name) => readFileSync(new URL(`../public/midi-files/${name}`, import.meta.url), 'utf8')
const solfegeOf = (xml) => [...xml.matchAll(/<lyric number="\d+" name="solfege">[\s\S]*?<text>(\w+)<\/text>/g)].map((m) => m[1])

function score(fifths, notes, { mode = 'major' } = {}) {
  const body = notes
    .map((n) => (typeof n === 'string' ? `<note>${n}<duration>1</duration></note>` : n))
    .join('')
  return `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>S</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key></attributes>${body}</measure></part></score-partwise>`
}
const pitch = (step, alter = 0) => `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>4</octave></pitch>`

describe('doName', () => {
  it('names do for a key signature', () => {
    expect([0, 1, 2, -1, -3, 6, -6, 7].map(doName)).toEqual(['C', 'G', 'D', 'F', 'Eb', 'F#', 'Gb', 'C#'])
  })
})

describe('solfegeSyllable', () => {
  it('sings the major scale of the key', () => {
    expect(['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((s) => solfegeSyllable(s, 0, 0))).toEqual(['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'])
    // D major: D E F# G A B C#
    expect([['D', 0], ['E', 0], ['F', 1], ['G', 0], ['A', 0], ['B', 0], ['C', 1]].map(([s, a]) => solfegeSyllable(s, a, 2))).toEqual(['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'])
    // Eb major: Eb F G Ab Bb C D
    expect([['E', -1], ['F', 0], ['G', 0], ['A', -1], ['B', -1], ['C', 0], ['D', 0]].map(([s, a]) => solfegeSyllable(s, a, -3))).toEqual(['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'])
  })

  it('names chromatic notes raised or lowered as spelled', () => {
    expect(solfegeSyllable('F', 1, 0)).toBe('fi')
    expect(solfegeSyllable('G', -1, 0)).toBe('se')
    expect(solfegeSyllable('C', 1, 0)).toBe('di')
    expect(solfegeSyllable('B', -1, 0)).toBe('te')
    expect(solfegeSyllable('E', -1, 0)).toBe('me')
    expect(solfegeSyllable('A', -1, 0)).toBe('le')
    expect(solfegeSyllable('G', 1, 0)).toBe('si')
    // In G major, F natural is ti lowered: te.
    expect(solfegeSyllable('F', 0, 1)).toBe('te')
    // E# is fa in C: mi raised.
    expect(solfegeSyllable('E', 1, 0)).toBe('fa')
    // In F major, B natural is fa raised: fi.
    expect(solfegeSyllable('B', 0, -1)).toBe('fi')
    // An enharmonic spelling still lands on the right degree: A# in F major sounds as Bb, fa.
    expect(solfegeSyllable('A', 1, -1)).toBe('fa')
  })

  it('reads a minor key la-based, from its relative major', () => {
    // A minor (no sharps): A is la, G# (the leading note) is si.
    expect(solfegeSyllable('A', 0, 0)).toBe('la')
    expect(solfegeSyllable('G', 1, 0)).toBe('si')
    // E minor (one sharp): E is la.
    expect(solfegeSyllable('E', 0, 1)).toBe('la')
  })

  it('names double sharps and flats by the note they sound', () => {
    expect(solfegeSyllable('F', 2, 0)).toBe('sol')
    expect(solfegeSyllable('B', -2, 0)).toBe('la')
  })

  it('names unspelled chromatic notes the usual way', () => {
    expect(['C#', 'D#', 'F#', 'G#', 'A#'].map((n) => solfegeSyllable(n[0], 1, 0, false))).toEqual(['di', 'me', 'fi', 'si', 'te'])
  })
})

// A one-track MIDI file with no key signature, converted as the app does.
function midiScore(notes) {
  const midi = new Midi()
  midi.header.setTempo(100)
  const track = midi.addTrack()
  track.name = 'Voice'
  notes.forEach((n, i) => track.addNote({ midi: n, time: i * 0.6, duration: 0.6 }))
  return midiToMusicXml(new Midi(midi.toArray())).musicXml
}

describe('scoreKey', () => {
  it('trusts a signature the notes fit', () => {
    expect(scoreKey(library('ode-to-joy.musicxml'))).toEqual({ fifths: 0, inferred: false })
    // A minor with its raised leading note still reads in C (la-based).
    expect(scoreKey(score(0, ['A', 'B', 'C', 'D', 'E', 'G#', 'A', 'E', 'C', 'A'].map((n) => pitch(n[0], n[1] === '#' ? 1 : 0))))).toEqual({ fifths: 0, inferred: false })
  })

  it('works out the key of a MIDI file that has no signature', () => {
    // D major: D E F# G A B C# D, and back down.
    const xml = midiScore([62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62])
    expect(scoreKey(xml)).toEqual({ fifths: 2, inferred: true })
    expect(solfegeOf(addSolfege(xml)).slice(0, 8)).toEqual(['do', 're', 'mi', 'fa', 'sol', 'la', 'ti', 'do'])
  })

  it('names flat keys with flats', () => {
    // Bb major: Bb C D Eb F G A Bb.
    expect(scoreKey(midiScore([58, 60, 62, 63, 65, 67, 69, 70]))).toEqual({ fifths: -2, inferred: true })
  })

  it('settles a tie between keys on the home chord', () => {
    // Eb F Gb Ab Gb F Eb D Eb F: in Db and in Gb, but it centres on Eb minor (la in Gb).
    const xml = midiScore([63, 65, 66, 68, 66, 65, 63, 62, 63, 65])
    expect(scoreKey(xml)).toEqual({ fifths: 6, inferred: true })
    // Its D (spelled whatever way the MIDI conversion chose) is the raised sol of the minor key: si.
    expect(solfegeOf(addSolfege(xml))).toEqual(['la', 'ti', 'do', 're', 'do', 'ti', 'la', 'si', 'la', 'ti'])
  })

  it('follows a score that changes key as written', () => {
    const xml = `<score-partwise><part id="P1">
<measure number="1"><attributes><key><fifths>0</fifths></key></attributes><note>${pitch('G')}</note></measure>
<measure number="2"><attributes><key><fifths>1</fifths></key></attributes><note>${pitch('G')}</note></measure>
</part></score-partwise>`
    expect(scoreKey(xml)).toBeNull()
  })
})

describe('addSolfege', () => {
  it('labels Ode to Joy in C and leaves the words on their own line', () => {
    const xml = library('ode-to-joy.musicxml')
    const labelled = addSolfege(xml)
    const syllables = solfegeOf(labelled)
    expect(syllables.slice(0, 7)).toEqual(['mi', 'mi', 'fa', 'sol', 'sol', 'fa', 'mi'])
    // Every original lyric is still there, untouched.
    expect(labelled.match(/<lyric>[\s\S]*?<\/lyric>/g)).toEqual(xml.match(/<lyric>[\s\S]*?<\/lyric>/g))
    // The solfège goes on line 2, under the words.
    expect(labelled).toContain('<lyric number="2" name="solfege">')
  })

  it('puts the label after the note’s lyrics and before <play>', () => {
    const xml = score(0, [`${pitch('C')}<lyric number="1"><text>la</text></lyric><play/>`])
    const note = addSolfege(xml).match(/<note>[\s\S]*?<\/note>/)[0]
    expect(note.indexOf('name="solfege"')).toBeGreaterThan(note.indexOf('<text>la</text>'))
    expect(note.indexOf('name="solfege"')).toBeLessThan(note.indexOf('<play/>'))
  })

  it('skips rests, chord notes, grace notes and tied-over notes', () => {
    const xml = score(0, [
      pitch('C'),
      '<rest/>',
      `<chord/>${pitch('E')}`,
      `<grace/>${pitch('B')}`,
      `${pitch('D')}<tie type="start"/>`,
      `${pitch('D')}<tie type="stop"/>`,
      `${pitch('E')}<tie type="stop"/><tie type="start"/>`,
    ])
    expect(solfegeOf(addSolfege(xml))).toEqual(['do', 're', 'mi'])
  })

  it('moves do at a key change', () => {
    const xml = `<score-partwise><part id="P1">
<measure number="1"><attributes><key><fifths>0</fifths></key></attributes><note>${pitch('G')}</note></measure>
<measure number="2"><attributes><key><fifths>1</fifths></key></attributes><note>${pitch('G')}</note></measure>
</part></score-partwise>`
    expect(solfegeOf(addSolfege(xml))).toEqual(['sol', 'do'])
  })

  it('treats a score without a key signature as C', () => {
    const xml = `<score-partwise><part id="P1"><measure number="1"><note>${pitch('D')}</note></measure></part></score-partwise>`
    expect(solfegeOf(addSolfege(xml))).toEqual(['re'])
  })

  it('labels every part, each from its own key', () => {
    const xml = `<score-partwise>
<part id="P1"><measure number="1"><attributes><key><fifths>-1</fifths></key></attributes><note>${pitch('F')}</note></measure></part>
<part id="P2"><measure number="1"><attributes><key><fifths>-1</fifths></key></attributes><note>${pitch('B', -1)}</note></measure></part>
</score-partwise>`
    expect(solfegeOf(addSolfege(xml))).toEqual(['do', 'fa'])
  })

  it('works on a part pulled out of a choir score', () => {
    const xml = library('amazing-grace.musicxml')
    const firstPart = xml.match(/<part\s[^>]*id="([^"]+)"/)[1]
    const labelled = addSolfege(extractPart(xml, firstPart))
    expect(solfegeOf(labelled).slice(0, 4)).toEqual(['sol', 'do', 'mi', 'do'])
  })

  it('reads one part in the key of the whole score', () => {
    // A bass line alone (D A D A) could be D or A major; the score is in D.
    const part = score(0, ['D', 'A', 'D', 'A'].map((n) => pitch(n)))
    expect(solfegeOf(addSolfege(part, { fifths: 2, inferred: true }))).toEqual(['do', 'sol', 'do', 'sol'])
  })

  it('returns empty input as is', () => {
    expect(addSolfege('')).toBe('')
    expect(addSolfege(undefined)).toBe(undefined)
  })
})
