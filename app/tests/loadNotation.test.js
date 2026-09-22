import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detectNotationFormat, loadNotation, titleFromFilename, NOTATION_ACCEPT } from '../src/tabs/vocal/notation/loadNotation.js'

const fixture = (rel) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../tests/fixtures/${rel}`, import.meta.url)))).buffer

describe('detectNotationFormat', () => {
  it('trusts the extension first', () => {
    expect(detectNotationFormat('song.mid', new ArrayBuffer(0))).toBe('midi')
    expect(detectNotationFormat('song.MIDI', new ArrayBuffer(0))).toBe('midi')
    expect(detectNotationFormat('song.mxl', new ArrayBuffer(0))).toBe('mxl')
    expect(detectNotationFormat('song.musicxml', new ArrayBuffer(0))).toBe('musicxml')
    expect(detectNotationFormat('song.xml', new ArrayBuffer(0))).toBe('musicxml')
  })

  it('falls back to sniffing the bytes for unknown extensions', () => {
    expect(detectNotationFormat('mystery', fixture('midi/twinkle.mid'))).toBe('midi')
    expect(detectNotationFormat('mystery.bin', fixture('musicxml/ode-to-joy.mxl'))).toBe('mxl')
    expect(detectNotationFormat('mystery.txt', fixture('musicxml/ode-to-joy.musicxml'))).toBe('musicxml')
  })

  it('advertises every supported extension to the file picker', () => {
    for (const ext of ['.mid', '.midi', '.musicxml', '.xml', '.mxl']) expect(NOTATION_ACCEPT).toContain(ext)
  })
})

describe('loadNotation', () => {
  it('converts MIDI into a MusicXML string and keeps the source bytes', async () => {
    const bytes = fixture('midi/twinkle.mid')
    const loaded = await loadNotation(bytes, 'twinkle.mid')
    expect(loaded.format).toBe('midi')
    expect(loaded.title).toBe('Twinkle')
    expect(loaded.content).toMatch(/<score-partwise[\s>]/)
    expect(loaded.sourceBytes).toBe(bytes)
  })

  it('passes MusicXML text through after validating the root element', async () => {
    const loaded = await loadNotation(fixture('musicxml/ode-to-joy.musicxml'), 'ode-to-joy.musicxml')
    expect(loaded.format).toBe('musicxml')
    expect(loaded.title).toBe('Ode To Joy')
    expect(loaded.content).toContain('<work-title>Ode to Joy</work-title>')
  })

  it('unzips compressed MXL into MusicXML text', async () => {
    const loaded = await loadNotation(fixture('musicxml/ode-to-joy.mxl'), 'ode-to-joy.mxl')
    expect(loaded.format).toBe('mxl')
    expect(loaded.content).toContain('<work-title>Ode to Joy</work-title>')
    expect(loaded.content.startsWith('PK')).toBe(false)
  })

  it('accepts a title override (cloud songs carry their own titles)', async () => {
    const loaded = await loadNotation(fixture('musicxml/ode-to-joy.musicxml'), 'x.musicxml', { title: 'From the cloud' })
    expect(loaded.title).toBe('From the cloud')
  })

  it('rejects text that is not MusicXML', async () => {
    await expect(loadNotation(new TextEncoder().encode('hello').buffer, 'notes.xml')).rejects.toThrow(/not MusicXML/)
  })

  it('rejects timewise MusicXML with a pointer to the fix', async () => {
    const xml = new TextEncoder().encode('<?xml version="1.0"?><score-timewise version="4.0"></score-timewise>').buffer
    await expect(loadNotation(xml, 'tw.musicxml')).rejects.toThrow(/partwise/)
  })

  it('derives readable titles from filenames', () => {
    expect(titleFromFilename('c-major-scale.mid')).toBe('C Major Scale')
    expect(titleFromFilename('paint_it-black.musicxml')).toBe('Paint It Black')
  })
})
