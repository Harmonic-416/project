import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMidiFile } from '../src/tabs/vocal/midi/parseMidi.js'
import { midiToMusicXml } from '../src/tabs/vocal/midi/midiToMusicXml.js'
import { quantizeTicksToGrid, ticksToDivisions } from '../src/tabs/vocal/midi/quantize.js'

/**
 * True when, after the converter's own 16th-note quantization, a note starts
 * while an earlier note of the same track is still sounding (chords — same
 * onset — don't count). midiToMusicXml documents that it does not separate
 * such notes into voices; today they are dropped from the notation.
 */
function hasIntraTrackOverlap(midi) {
  const ppq = midi.header.ppq
  return midi.tracks.some((track) => {
    let groupStart = -1
    let groupEnd = -1
    const notes = track.notes
      .map((n) => {
        const start = ticksToDivisions(quantizeTicksToGrid(n.ticks, ppq), ppq)
        const end = Math.max(start + 1, ticksToDivisions(quantizeTicksToGrid(n.ticks + n.durationTicks, ppq), ppq))
        return { start, end }
      })
      .sort((a, b) => a.start - b.start)
    for (const n of notes) {
      if (n.start === groupStart) groupEnd = Math.max(groupEnd, n.end)
      else if (n.start < groupEnd) return true
      else { groupStart = n.start; groupEnd = n.end }
    }
    return false
  })
}

const fixtureDir = fileURLToPath(new URL('../../tests/fixtures/midi/', import.meta.url))
const fixtures = readdirSync(fixtureDir).filter((f) => /\.(mid|midi)$/i.test(f)).sort()

describe('midiToMusicXml over the shared MIDI corpus', () => {
  it.each(fixtures)('%s converts to score-partwise MusicXML with a consistent schedule', async (file) => {
    const midi = await parseMidiFile(new Uint8Array(readFileSync(join(fixtureDir, file))))
    const { musicXml, playbackSchedule, cursorTimestamps } = midiToMusicXml(midi)

    expect(musicXml).toMatch(/<score-partwise[\s>]/)
    expect((musicXml.match(/<measure /g) ?? []).length).toBeGreaterThan(0)
    expect(playbackSchedule.length).toBeGreaterThan(0)

    expect(cursorTimestamps[0]).toBe(0)
    for (let i = 1; i < cursorTimestamps.length; i += 1) {
      expect(cursorTimestamps[i]).toBeGreaterThan(cursorTimestamps[i - 1])
    }
    // Every scheduled onset is a cursor stop — unless the file has overlapping
    // notes inside one track, where the converter drops the later note from
    // the notation but keeps it in its schedule. The app plays from the
    // rendered score (notation/scoreModel.js) precisely so that can't be heard.
    const stops = new Set(cursorTimestamps.map((t) => t.toFixed(6)))
    const orphaned = playbackSchedule.filter((event) => !stops.has(event.time.toFixed(6)))
    if (!hasIntraTrackOverlap(midi)) expect(orphaned).toHaveLength(0)
  })

  it('flags the fixtures that exercise the overlapping-notes simplification', async () => {
    const overlapping = []
    for (const file of fixtures) {
      const midi = await parseMidiFile(new Uint8Array(readFileSync(join(fixtureDir, file))))
      if (hasIntraTrackOverlap(midi)) overlapping.push(file)
    }
    expect(overlapping).toContain('synth_overlapping_polyphony.mid')
  })

  it('rejects files without notes', async () => {
    const { Midi } = await import('@tonejs/midi')
    const empty = new Midi()
    empty.addTrack()
    await expect(parseMidiFile(new Uint8Array(empty.toArray()))).rejects.toThrow(/no notes/i)
  })

  it('rejects non-MIDI bytes', async () => {
    await expect(parseMidiFile(new TextEncoder().encode('not a midi file'))).rejects.toThrow()
  })
})
