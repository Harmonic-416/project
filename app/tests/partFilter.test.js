import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { midiToMusicXml } from '../src/tabs/vocal/midi/midiToMusicXml.js'
import { extractPart, listParts, partOnTop } from '../src/tabs/vocal/notation/partFilter.js'

function choirXml() {
  const midi = new Midi()
  midi.header.setTempo(90)
  const lines = {
    'Soprano 1': [72, 74],
    'Soprano 2': [67, 69],
    'Alto 1': [64, 65],
    'Alto 2': [60, 62],
  }
  for (const [name, notes] of Object.entries(lines)) {
    const track = midi.addTrack()
    track.name = name
    notes.forEach((n, i) => track.addNote({ midi: n, time: i, duration: 1 }))
  }
  return midiToMusicXml(new Midi(midi.toArray())).musicXml
}

const count = (xml, re) => (xml.match(re) ?? []).length

describe('listParts', () => {
  it('names parts as in the MIDI file', () => {
    expect(listParts(choirXml())).toEqual([
      { id: 'P1', name: 'Soprano 1' },
      { id: 'P2', name: 'Soprano 2' },
      { id: 'P3', name: 'Alto 1' },
      { id: 'P4', name: 'Alto 2' },
    ])
  })

  it('skips parts without notes, decodes names, and numbers blanks and repeats', () => {
    const xml = `<score-partwise><part-list>
      <score-part id="A"><part-name>Tenor &amp; Bass</part-name></score-part>
      <score-part id="B"><part-name>Piano</part-name></score-part>
      <score-part id="C"><part-name>Voice</part-name></score-part>
      <score-part id='D'><part-name>Voice</part-name></score-part>
      <score-part id="E"><part-name/></score-part>
    </part-list>
    <part id="A"><measure number="1"><note><pitch><step>C</step><octave>3</octave></pitch></note></measure></part>
    <part id="B"><measure number="1"><note><rest/></note></measure></part>
    <part id="C"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch></note></measure></part>
    <part id='D'><measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure></part>
    <part id="E"><measure number="1"><note><pitch><step>G</step><octave>4</octave></pitch></note></measure></part>
    </score-partwise>`
    expect(listParts(xml).map((p) => p.name)).toEqual(['Tenor & Bass', 'Voice 1', 'Voice 2', 'Part 4'])
  })
})

describe('extractPart', () => {
  it('keeps only the chosen part', () => {
    const alto = extractPart(choirXml(), 'P3')
    expect(count(alto, /<score-part\s/g)).toBe(1)
    expect(count(alto, /<part\s/g)).toBe(1)
    expect(alto).toContain('<part-name>Alto 1</part-name>')
    expect(alto).toContain('<part id="P3">')
    expect(alto).not.toContain('Soprano')
    expect(listParts(alto)).toEqual([{ id: 'P3', name: 'Alto 1' }])
  })

  it('carries the tempo over from the first part', () => {
    const xml = choirXml()
    expect(xml.match(/<part id="P3">[\s\S]*?<\/part>/)[0]).not.toContain('tempo=')
    const alto = extractPart(xml, 'P3')
    expect(alto).toContain('<sound tempo="90"/>')
    // …at the start of the first measure, before its notes.
    const firstMeasure = alto.match(/<measure number="1">[\s\S]*?<\/measure>/)[0]
    expect(firstMeasure.indexOf('tempo=')).toBeLessThan(firstMeasure.indexOf('<note>'))
    expect(count(alto, /tempo=/g)).toBe(1)
  })

  it("leaves the first part's own tempo alone", () => {
    expect(count(extractPart(choirXml(), 'P1'), /tempo=/g)).toBe(1)
  })

  it('drops part groups', () => {
    const xml = `<score-partwise><part-list><part-group type="start" number="1"><group-symbol>bracket</group-symbol></part-group>
      <score-part id="S"><part-name>S</part-name></score-part><score-part id="A"><part-name>A</part-name></score-part>
      <part-group type="stop" number="1"/></part-list>
      <part id="S"><measure number="1"/></part><part id="A"><measure number="1"/></part></score-partwise>`
    const out = extractPart(xml, 'A')
    expect(out).not.toContain('part-group')
    expect(out).toContain('<part id="A">')
  })

  it('rejects an unknown part', () => {
    expect(() => extractPart(choirXml(), 'P9')).toThrow()
  })
})

describe('partOnTop', () => {
  const order = (xml) => [...xml.matchAll(/<part id="(P\d)">/g)].map((m) => m[1])
  const listOrder = (xml) => [...xml.matchAll(/<score-part id="(P\d)">/g)].map((m) => m[1])

  it('moves the chosen part to the top and keeps the rest in order', () => {
    const xml = partOnTop(choirXml(), 'P3')
    expect(order(xml)).toEqual(['P3', 'P1', 'P2', 'P4'])
    expect(listOrder(xml)).toEqual(['P3', 'P1', 'P2', 'P4'])
    expect(listParts(xml).map((p) => p.name)).toEqual(['Alto 1', 'Soprano 1', 'Soprano 2', 'Alto 2'])
  })

  it('moves the tempo to the top part instead of duplicating it', () => {
    const xml = partOnTop(choirXml(), 'P3')
    expect(count(xml, /tempo=/g)).toBe(1)
    expect(xml.match(/<part id="P3">[\s\S]*?<\/part>/)[0]).toContain('<sound tempo="90"/>')
  })

  it('leaves a score whose first part is chosen as it was', () => {
    const xml = choirXml()
    expect(order(partOnTop(xml, 'P1'))).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(count(partOnTop(xml, 'P1'), /tempo=/g)).toBe(1)
  })
})
