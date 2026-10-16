import { describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { tidyMidiForTab } from '../src/tabs/guitar/notation/tidyMidi.js'
import { MAX_AT_ONCE, beatClock, cleanNotes, notesToMidi } from '../src/tabs/guitar/song/transcribe/beatWarp.js'
import { buildTimeline } from '../src/tabs/guitar/song/follow/songTimeline.js'
import { midiToMusicXml } from '../src/tabs/vocal/midi/midiToMusicXml.js'

/** Beats that speed up from `fromBpm` to `toBpm` over `count` beats, starting at `start` seconds. */
function driftingBeats(count, fromBpm, toBpm, start = 0.5) {
  const beats = [start]
  for (let i = 1; i < count; i += 1) beats.push(beats[i - 1] + 60 / (fromBpm + ((toBpm - fromBpm) * i) / count))
  return beats
}

/** A Basic Pitch-style note at a position in beats along `beats` (fractional), off by `jitter` seconds. */
function noteAt(beats, position, pitch, { length = 0.5, jitter = 0, amplitude = 0.6 } = {}) {
  const i = Math.floor(position)
  const at = (p) => beats[Math.floor(p)] + (beats[Math.floor(p) + 1] - beats[Math.floor(p)]) * (p - Math.floor(p))
  const start = at(position) + jitter
  return { startTimeSeconds: start, durationSeconds: at(Math.min(position + length, beats.length - 1.001)) - start, pitchMidi: pitch, amplitude, i }
}

const sixteenthsOf = (midi) => midi.tracks[0].notes.map((n) => Math.round(n.ticks / (midi.header.ppq / 4)))

describe('beatClock', () => {
  it('measures time in beats, between and beyond the detected beats', () => {
    const { toBeats, period } = beatClock([1, 1.5, 2.1, 2.6])
    expect(period).toBe(0.5)
    expect(toBeats(1.5)).toBe(1)
    expect(toBeats(1.8)).toBeCloseTo(1.5, 6) // halfway between 1.5 and 2.1
    expect(toBeats(0.5)).toBeCloseTo(-1, 6) // before the first beat, at the median length
    expect(toBeats(3.6)).toBeCloseTo(5, 6)
  })
})

describe('notes on the song’s beat', () => {
  it('puts notes on the right sixteenth even as the tempo drifts', () => {
    const beats = driftingBeats(40, 96, 126)
    const positions = [0, 1, 1.5, 2, 2.75, 3, 8, 8.25, 16, 23.5, 31, 38]
    const jitters = [0.012, -0.015, 0.008, -0.01, 0.014, 0, -0.012, 0.01, 0.015, -0.008, 0.011, -0.014]
    const notes = positions.map((p, i) => noteAt(beats, p, 52 + (i % 7), { jitter: jitters[i], length: 0.25 }))
    const { midi, beatsPerBar, bpm } = notesToMidi(notes, { beats, beatsPerBar: 4, firstDownbeat: 0 })
    expect(beatsPerBar).toBe(4)
    expect(bpm).toBeGreaterThan(96)
    expect(bpm).toBeLessThan(126)
    expect(sixteenthsOf(midi)).toEqual(positions.map((p) => Math.round(p * 4)))
  })

  it('adds a pickup bar for notes before the first downbeat, but not for a note a hair early', () => {
    const beats = Array.from({ length: 20 }, (_, i) => 0.5 + i * 0.5)
    const pickup = notesToMidi([noteAt(beats, 3, 60), noteAt(beats, 4, 62)], { beats, beatsPerBar: 4, firstDownbeat: 4 })
    expect(pickup.origin).toBe(0) // one whole bar in front
    expect(sixteenthsOf(pickup.midi)).toEqual([12, 16])
    const early = notesToMidi([noteAt(beats, 4, 60, { jitter: -0.01 }), noteAt(beats, 5, 62)], { beats, beatsPerBar: 4, firstDownbeat: 4 })
    expect(early.origin).toBe(4)
    expect(sixteenthsOf(early.midi)).toEqual([0, 4])
  })

  it('keeps a 3/4 song in bars of three', () => {
    const beats = Array.from({ length: 30 }, (_, i) => 0.3 + i * 0.6)
    const { midi } = notesToMidi([noteAt(beats, 0, 55)], { beats, beatsPerBar: 3, firstDownbeat: 0 })
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([3, 4])
    expect(midi.header.tempos[0].bpm).toBeCloseTo(100, 6)
  })
})

describe('ghost notes', () => {
  const beats = Array.from({ length: 10 }, (_, i) => i * 0.5)
  const { toBeats } = beatClock(beats)

  it('moves notes off the guitar’s range onto it by octaves (a bass line’s low notes)', () => {
    const notes = [30, 40, 64, 88, 96].map((pitch) => ({ startTimeSeconds: 1, durationSeconds: 0.4, pitchMidi: pitch, amplitude: 0.5 }))
    expect(cleanNotes(notes, toBeats).map((n) => n.pitchMidi)).toEqual([42, 40, 64, 88, 84])
  })

  it('keeps the six loudest of notes starting together', () => {
    const notes = Array.from({ length: 8 }, (_, i) => ({ startTimeSeconds: 1 + i * 0.004, durationSeconds: 0.4, pitchMidi: 45 + i * 3, amplitude: 0.1 * (i + 1) }))
    const kept = cleanNotes(notes, toBeats)
    expect(kept).toHaveLength(MAX_AT_ONCE)
    expect(kept.map((n) => n.amplitude)).not.toContain(0.1)
    expect(kept.map((n) => n.amplitude)).not.toContain(0.2)
  })
})

describe('into tab', () => {
  it('lands notes played on downbeats at the start of bars', async () => {
    const beats = driftingBeats(32, 100, 112)
    // A note on every downbeat (4/4), and one on beat 3 of each bar.
    const notes = []
    for (let bar = 0; bar < 7; bar += 1) {
      notes.push(noteAt(beats, bar * 4, 52, { length: 1.8, jitter: 0.01 }))
      notes.push(noteAt(beats, bar * 4 + 2, 55, { length: 1.8, jitter: -0.01 }))
    }
    const { midi } = notesToMidi(notes, { beats, beatsPerBar: 4, firstDownbeat: 0 })
    const xml = midiToMusicXml(tidyMidiForTab(midi)).musicXml
    const { score, hasTab } = await loadGuitarNotation(new TextEncoder().encode(xml).buffer, 'draft.musicxml')
    expect(hasTab).toBe(true)
    const { entries } = buildTimeline(score)
    const downbeats = entries.filter((e) => e.notes[0].midi === 52)
    expect(downbeats).toHaveLength(7)
    expect(downbeats.every((e) => e.tick === e.barStartTick)).toBe(true)
    expect(downbeats.map((e) => e.bar)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
