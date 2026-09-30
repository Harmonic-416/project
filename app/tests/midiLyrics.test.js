import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { writeMidi } from 'midi-file'
import { parseMidiFile } from '../src/tabs/vocal/midi/parseMidi.js'
import { clefFor, midiToMusicXml } from '../src/tabs/vocal/midi/midiToMusicXml.js'
import { readLyricStreams, toSyllables } from '../src/tabs/vocal/midi/lyrics.js'

const fixture = (name) => {
  const buf = readFileSync(new URL(`../../tests/fixtures/midi/${name}`, import.meta.url))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

async function convert(arrayBuffer) {
  const midi = await parseMidiFile(arrayBuffer)
  return midiToMusicXml(midi, { lyricStreams: readLyricStreams(arrayBuffer) }).musicXml
}

/** One-track file whose lyric events are `text` or `lyrics` meta events. */
function oneTrack(syllables, { type = 'lyrics', extra = [] } = {}) {
  const events = [...extra.map((text) => ({ deltaTime: 0, type: 'text', text }))]
  syllables.forEach((text, i) => {
    events.push({ deltaTime: 0, type, text })
    events.push({ deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 60 + i, velocity: 80 })
    events.push({ deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: 60 + i, velocity: 0 })
  })
  events.push({ deltaTime: 0, type: 'endOfTrack' })
  const bytes = writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [events] })
  return new Uint8Array(bytes).buffer
}

const lyricsOf = (xml) => [...xml.matchAll(/<syllabic>(\w+)<\/syllabic>\s*<text>([^<]*)<\/text>/g)].map((m) => `${m[2]}:${m[1]}`)

describe('MIDI lyrics', () => {
  it('puts the soprano’s lyrics under the soprano, not the first track', async () => {
    const xml = await convert(fixture('synth_satb_lyrics.mid'))
    const parts = xml.split('<part id=')
    const soprano = parts.find((p) => p.startsWith('"P1"'))
    expect(lyricsOf(soprano)).toEqual([
      'Twin:begin', 'kle:end', 'twin:begin', 'kle:end', 'lit:begin', 'tle:end', 'star:single',
    ])
    for (const other of parts.filter((p) => /^"P[234]"/.test(p))) expect(other).not.toContain('<lyric')
  })

  it('names the voice parts and picks their clefs', async () => {
    const xml = await convert(fixture('synth_satb_lyrics.mid'))
    expect([...xml.matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((m) => m[1])).toEqual(['Soprano', 'Alto', 'Tenor', 'Bass'])
    const clefs = [...xml.matchAll(/<clef>(.*?)<\/clef>/g)].map((m) => m[1])
    expect(clefs).toEqual([
      '<sign>G</sign><line>2</line>',
      '<sign>G</sign><line>2</line>',
      '<sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change>',
      '<sign>F</sign><line>4</line>',
    ])
  })

  it('reads whole words without spacing conventions and decodes UTF-8', async () => {
    const xml = await convert(oneTrack(['Ave', 'Ma-', 'ri-', 'a', 'café']))
    expect(lyricsOf(xml)).toEqual(['Ave:single', 'Ma:begin', 'ri:middle', 'a:end', 'café:single'])
  })

  it('reads Soft Karaoke text events and skips @ headers', async () => {
    const xml = await convert(oneTrack(['\\Hap', 'py ', '/birth', 'day'], { type: 'text', extra: ['@KMIDI KARAOKE FILE', '@TSong'] }))
    expect(lyricsOf(xml)).toEqual(['Hap:begin', 'py:end', 'birth:begin', 'day:end'])
  })

  it('ignores plain text events in ordinary files', async () => {
    const xml = await convert(oneTrack(['Copyright 2026'], { type: 'text' }))
    expect(xml).not.toContain('<lyric')
  })

  it('escapes lyric text', async () => {
    const xml = await convert(oneTrack(['<you> & me']))
    expect(xml).toContain('<text>&lt;you&gt; &amp; me</text>')
  })

  it('joins unspaced syllables into words when the file uses spaces, including spacing-only events', () => {
    expect(toSyllables([
      { ticks: 0, text: 'Glo' }, { ticks: 1, text: 'ri' }, { ticks: 2, text: 'a' }, { ticks: 3, text: ' ' }, { ticks: 4, text: 'in' },
    ]).map((s) => s.syllabic)).toEqual(['begin', 'middle', 'end', 'single'])
    expect(toSyllables([
      { ticks: 0, text: 'Glo' }, { ticks: 1, text: 'ri' }, { ticks: 2, text: 'a ' }, { ticks: 4, text: 'in' },
    ]).map((s) => s.syllabic)).toEqual(['begin', 'middle', 'end', 'single'])
  })
})

describe('clefFor', () => {
  it('goes by the part name first, then by range', () => {
    expect(clefFor('Baritone', [70])).toBe('bass')
    expect(clefFor('Tenor 1', [55])).toBe('tenor')
    expect(clefFor('Alto', [50])).toBe('treble')
    expect(clefFor('Part 2', [43, 48, 50, 55, 60])).toBe('bass')
    expect(clefFor('Melody', [60, 64, 67])).toBe('treble')
  })
})
