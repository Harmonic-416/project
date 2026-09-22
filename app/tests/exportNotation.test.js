import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { midiExport, musicXmlExport, safeFilename, scoreModelToMidi } from '../src/tabs/vocal/notation/exportNotation.js'

const model = {
  bpm: 90,
  notes: [
    { partIndex: 0, partName: 'Voice', midi: 60, time: 0, duration: 0.5 },
    { partIndex: 0, partName: 'Voice', midi: 64, time: 0.5, duration: 1 },
    { partIndex: 1, partName: 'Bass', midi: 48, time: 0, duration: 1.5 },
  ],
}

describe('scoreModelToMidi', () => {
  it('writes one track per part with the model tempo and note timing', () => {
    const parsed = new Midi(scoreModelToMidi(model, { title: 'Test' }))
    expect(parsed.header.tempos[0].bpm).toBeCloseTo(90, 3)
    expect(parsed.header.name).toBe('Test')
    expect(parsed.tracks.map((t) => t.name)).toEqual(['Voice', 'Bass'])
    const voice = parsed.tracks[0].notes
    expect(voice.map((n) => n.midi)).toEqual([60, 64])
    expect(voice[1].time).toBeCloseTo(0.5, 3)
    expect(voice[1].duration).toBeCloseTo(1, 3)
    expect(parsed.tracks[1].notes[0].duration).toBeCloseTo(1.5, 3)
  })
})

describe('export payloads', () => {
  const xml = '<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>'

  it('exports a MIDI source untouched and everything else from the model', async () => {
    const source = new Uint8Array([1, 2, 3]).buffer
    const fromMidi = midiExport({ format: 'midi', title: 'A', content: xml, sourceBytes: source }, model)
    expect(fromMidi.filename).toBe('A.mid')
    expect(new Uint8Array(await fromMidi.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    const fromXml = midiExport({ format: 'musicxml', title: 'B', content: xml, sourceBytes: new ArrayBuffer(0) }, model)
    expect(new Midi(new Uint8Array(await fromXml.blob.arrayBuffer())).tracks).toHaveLength(2)
  })

  it('exports MusicXML text, or the original MXL bytes for compressed sources', async () => {
    const asXml = musicXmlExport({ format: 'midi', title: 'C', content: xml, sourceBytes: new ArrayBuffer(0) })
    expect(asXml.filename).toBe('C.musicxml')
    expect(await asXml.blob.text()).toBe(xml)

    const zipped = new Uint8Array([0x50, 0x4b, 3, 4]).buffer
    const asMxl = musicXmlExport({ format: 'mxl', title: 'D', content: 'PK..', sourceBytes: zipped })
    expect(asMxl.filename).toBe('D.mxl')
    expect(new Uint8Array(await asMxl.blob.arrayBuffer())[0]).toBe(0x50)
  })

  it('builds safe filenames', () => {
    expect(safeFilename('Ode To Joy!')).toBe('Ode-To-Joy')
    expect(safeFilename('***')).toBe('score')
  })
})
