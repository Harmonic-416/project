import { describe, expect, it } from 'vitest'
import { loadGuitarNotation, scoreNotes } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { buildTimeline } from '../src/tabs/guitar/song/follow/songTimeline.js'
import { partXml, scoreXml } from '../src/tabs/guitar/song/transcribe/scoreXml.js'

const load = (xml) => loadGuitarNotation(new TextEncoder().encode(xml).buffer, 'draft.musicxml')

describe('the drafts’ score writer', () => {
  it('writes a melody over a ringing bass, with the frets and a capo kept', async () => {
    // Capo 2: the open A string sounds B2, string 1 fret 3 sounds A4.
    const events = [
      { start: 0, end: 4, midi: 69, string: 1, fret: 3, voice: 1 },
      { start: 4, end: 8, midi: 71, string: 1, fret: 5, voice: 1 },
      { start: 0, end: 8, midi: 47, string: 5, fret: 0, voice: 2 },
      { start: 8, end: 16, midi: 54, string: 4, fret: 2, voice: 2 },
    ]
    const xml = scoreXml([{ id: 'P1', name: 'Guitar', xml: partXml(events, { id: 'P1', beatsPerBar: 4, measures: 1, tab: true, capo: 2, tempo: 90 }) }])
    const notation = await load(xml)
    expect(notation.tab.parts.map((p) => p.status)).toEqual(['kept'])
    const staff = notation.score.tracks[0].staves[0]
    expect(staff.capo).toBe(2)
    expect(staff.bars[0].voices.filter((v) => v.beats.some((b) => !b.isEmpty && b.notes.length))).toHaveLength(2)
    // What sounds is the capo plus the string plus the fret.
    expect(scoreNotes(notation.score).map((n) => n.realValue).sort((a, b) => a - b)).toEqual([47, 54, 69, 71])

    // The practice modes see the melody and the bass starting together as one moment.
    const timeline = buildTimeline(notation.score, { trackIndex: 0 })
    expect(timeline.entries.map((e) => e.notes.map((n) => n.midi).sort((a, b) => a - b))).toEqual([[47, 69], [71], [54]])
  })

  it('ties a note held over the bar line instead of cutting it', async () => {
    const events = [
      { start: 0, end: 12, midi: 60 },
      { start: 12, end: 20, midi: 64 }, // a half note from beat 4: ties into bar 2
      { start: 20, end: 32, midi: 67 },
    ]
    const xml = scoreXml([{ id: 'P1', name: 'All notes heard', xml: partXml(events, { id: 'P1', beatsPerBar: 4, measures: 2 }) }])
    expect(xml).toContain('<tie type="start"/>')
    const notation = await load(xml)
    expect(notation.tab.parts.map((p) => p.status)).toEqual(['tabbed'])
    const beats = notation.score.tracks[0].staves[0].bars.flatMap((bar) => bar.voices[0].beats)
    expect(beats.filter((b) => b.isRest)).toHaveLength(0)
    const tied = scoreNotes(notation.score).filter((n) => n.isTieDestination)
    expect(tied.map((n) => n.realValue)).toEqual([64])
    // Struck three times, not four.
    expect(buildTimeline(notation.score, { trackIndex: 0 }).entries).toHaveLength(3)
  })

  it('puts chord names on the accompaniment', async () => {
    const events = [
      { start: 0, end: 16, midi: 64, string: 1, fret: 0, voice: 1 },
      { start: 0, end: 8, midi: 48, string: 5, fret: 3, voice: 2 },
      { start: 8, end: 16, midi: 43, string: 6, fret: 3, voice: 2 },
    ]
    const harmonies = [
      { slot: 0, xml: '<harmony><root><root-step>C</root-step></root><kind text="">major</kind></harmony>' },
      { slot: 8, xml: '<harmony><root><root-step>G</root-step></root><kind text="">major</kind></harmony>' },
    ]
    const notation = await load(scoreXml([{ id: 'P1', name: 'Guitar', xml: partXml(events, { id: 'P1', beatsPerBar: 4, measures: 1, tab: true, harmonies }) }]))
    const names = notation.score.tracks[0].staves[0].bars[0].voices.flatMap((v) => v.beats.map((b) => b.chord?.name ?? null)).filter(Boolean)
    expect(names).toEqual(['C', 'G'])
  })
})
