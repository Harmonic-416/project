import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { midiToMusicXml, MidiConversionError } from '../../src/lib/midi'

// Task 3.3 (F10) — pure unit tests, no Supabase needed.
describe('MIDI → MusicXML best-effort transform (F10)', () => {
  function simpleMidi(): Uint8Array {
    const midi = new Midi()
    const track = midi.addTrack()
    // C4 D4 E4 quarter notes
    const ppq = midi.header.ppq
    track.addNote({ midi: 60, ticks: 0, durationTicks: ppq })
    track.addNote({ midi: 62, ticks: ppq, durationTicks: ppq })
    track.addNote({ midi: 64, ticks: ppq * 2, durationTicks: ppq })
    return new Uint8Array(midi.toArray())
  }

  it('converts a simple melody to renderable score-partwise MusicXML', () => {
    const xml = midiToMusicXml(simpleMidi(), 'Test Tune')
    expect(xml).toContain('<score-partwise')
    expect(xml).toContain('<work-title>Test Tune</work-title>')
    expect(xml).toContain('<step>C</step>')
    expect(xml).toContain('<step>D</step>')
    expect(xml).toContain('<step>E</step>')
    // must satisfy importMusicXml's validity sniff
    expect(/<(score-partwise|score-timewise)[\s>]/.test(xml)).toBe(true)
  })

  it('rejects a non-MIDI file with a clear error', () => {
    const garbage = new TextEncoder().encode('definitely not midi')
    expect(() => midiToMusicXml(garbage)).toThrow(MidiConversionError)
  })

  it('rejects a MIDI file with no notes', () => {
    const midi = new Midi()
    midi.addTrack()
    expect(() => midiToMusicXml(new Uint8Array(midi.toArray()))).toThrow(/no notes/i)
  })
})
