import { readFileSync } from 'node:fs'
import { importer, midi, Settings } from '@coderline/alphatab'
import { expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { buildTimeline } from '../src/tabs/guitar/song/follow/songTimeline.js'
import { judgeWindow } from '../src/tabs/guitar/song/follow/noteJudge.js'
import { guitarShiftLimits, transposeGuitarScore } from '../src/tabs/guitar/song/transposeGuitarScore.js'

function playbackNotes(score) {
  const file = new midi.MidiFile()
  const generator = new midi.MidiFileGenerator(score, new Settings(), new midi.AlphaSynthMidiFileHandler(file))
  generator.generate()
  return file.events.filter((event) => event instanceof midi.NoteOnEvent)
    .map(({ tick, noteKey, channel }) => ({ tick, noteKey, channel }))
}

async function loadFixture() {
  const bytes = readFileSync(new URL('../public/guitar-songs/four-chord-strum.musicxml', import.meta.url))
  return (await loadGuitarNotation(Uint8Array.from(bytes).buffer, 'four-chord-strum.musicxml')).score
}

it('keeps string, fret, timing and scoring positions aligned with the regenerated MIDI and shifted notation', async () => {
  const original = await loadFixture()
  const base = buildTimeline(original)
  const baseMidi = playbackNotes(original)
  const shifted = transposeGuitarScore(original, -1)
  const next = buildTimeline(shifted)

  expect(shifted.tracks[0].staves[0].tuning).toEqual(original.tracks[0].staves[0].tuning.map((pitch) => pitch - 1))
  expect(next.entries.map(({ tick, endTick }) => [tick, endTick])).toEqual(base.entries.map(({ tick, endTick }) => [tick, endTick]))
  expect(next.entries.flatMap(({ notes }) => notes.map(({ midi, string, fret, note }) => [midi, string, fret, note.displayValue])))
    .toEqual(base.entries.flatMap(({ notes }) => notes.map(({ midi, string, fret, note }) => [midi - 1, string, fret, note.displayValue - 1])))
  expect(playbackNotes(shifted)).toEqual(baseMidi.map((note) => ({ ...note, noteKey: note.channel === 9 ? note.noteKey : note.noteKey - 1 })))
  expect(playbackNotes(original)).toEqual(baseMidi)
  expect(transposeGuitarScore(original, 0)).toBe(original)
})

it('rejects a shift that would go below a string’s playable MIDI range', async () => {
  const score = await loadFixture()
  score.tracks[0].staves[0].stringTuning.tunings[0] = 2
  expect(guitarShiftLimits(score).min).toBe(-2)
  expect(() => transposeGuitarScore(score, -3)).toThrow(/outside the supported range/)
  expect(score.tracks[0].staves[0].tuning[0]).toBe(2)
})

it('shifts pitched accompaniment and preserves a percussion staff', () => {
  const score = importer.ScoreLoader.loadAlphaTex(String.raw`\track "Guitar"
\staff {tabs score}
\tuning (E4 B3 G3 D3 A2 E2)
0.6.4 1.6.4 |
\track "Piano"
\staff {score}
\instrument 0
C4.4 D4.4 |
\track "Kit"
\staff {score}
G2.4 D2.4 |`)
  const kit = score.tracks[2]
  kit.playbackInfo.primaryChannel = 9
  kit.playbackInfo.secondaryChannel = 9
  kit.staves[0].isPercussion = true
  const beats = kit.staves[0].bars[0].voices[0].beats
  beats[0].notes[0].percussionArticulation = 35
  beats[1].notes[0].percussionArticulation = 38
  const original = playbackNotes(score)
  expect(original.some(({ channel }) => channel === 9)).toBe(true)
  const shifted = transposeGuitarScore(score, -1)
  expect(playbackNotes(shifted)).toEqual(
    original.map((note) => ({ ...note, noteKey: note.channel === 9 ? note.noteKey : note.noteKey - 1 })),
  )

  const sampleRate = 48000
  const frequency = 440 * 2 ** ((39 - 69) / 12)
  const frame = Float32Array.from({ length: 8192 }, (_, index) => {
    const phase = 2 * Math.PI * frequency * index / sampleRate
    return 0.4 * Math.sin(phase) + 0.2 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase)
  })
  const window = { frames: [frame], pitches: [39, 39], sampleRate }
  expect(judgeWindow(window, buildTimeline(shifted).entries[0]).verdict).toBe('hit')
  expect(judgeWindow(window, buildTimeline(score).entries[0]).verdict).not.toBe('hit')
})
