import { describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { draftScore } from '../src/tabs/guitar/song/transcribe/pipeline.js'
import { resampleTo } from './bandSongs.js'
import { renderGuitar, strum, withRoomNoise } from './guitarSignals.js'
import { onsetsOf } from './realSongs.js'

const RATE = 22050
const BEAT = 0.48
const G = { 6: 3, 5: 2, 4: 0, 3: 0, 2: 0, 1: 3 } // G2 B2 D3 G3 B3 G4
const G_PITCHES = [43, 47, 50, 55, 59, 67]
const frameTime = (f) => (f * 256) / RATE

describe('a strummed part, written as chords', () => {
  it('writes every strum of a ringing chord with all its strings, as the shape played', async () => {
    // Two bars of quarter-note strums of G — what Basic Pitch's note tracker turns into a note or two.
    const times = Array.from({ length: 8 }, (_, i) => 0.5 + i * BEAT)
    const samples = resampleTo(withRoomNoise(renderGuitar(5, times.flatMap((t, i) => strum(t, G, { seed: 21 + i })))), RATE)
    // Basic Pitch-like output: G's pitches sounding from the first strum, and starting at each strum.
    const count = Math.ceil((samples.length / RATE) * (RATE / 256))
    const frames = Array.from({ length: count }, (_, f) => {
      const row = new Array(88).fill(0)
      if (frameTime(f) >= times[0]) for (const m of G_PITCHES) row[m - 21] = 0.6
      return row
    })
    const onsets = Array.from({ length: count }, () => new Array(88).fill(0))
    for (const t of times) for (let d = 0; d <= 2; d += 1) for (const m of G_PITCHES) onsets[Math.round(t / (256 / RATE)) + d][m - 21] = 0.35
    const bars = { beats: Array.from({ length: 10 }, (_, i) => 0.5 + i * BEAT), downbeats: [0.5, 0.5 + 4 * BEAT], beatsPerBar: 4, firstDownbeat: 0 }

    const draft = draftScore({ notes: [], frames, onsets, bars, samples }, { frameTime })
    expect(draft.strums).toHaveLength(times.length)
    const notation = await loadGuitarNotation(new TextEncoder().encode(draft.musicXml).buffer, 'draft.musicxml')
    expect(notation.hasTab).toBe(true)
    const written = onsetsOf(notation.score)
    expect(written.map((o) => o.beat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    for (const o of written) {
      expect(o.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual(G_PITCHES)
      expect(o.notes.map((n) => `${n.string}:${n.fret}`).sort()).toEqual(['1:3', '2:0', '3:0', '4:0', '5:2', '6:3'])
    }
  }, 60000)
})
