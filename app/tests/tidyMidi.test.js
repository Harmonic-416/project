import { readFileSync } from 'node:fs'
import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { tidyMidiForTab } from '../src/tabs/guitar/notation/tidyMidi.js'
import { buildTimeline } from '../src/tabs/guitar/song/follow/songTimeline.js'

/** A one-track MIDI file at 120 BPM (a quarter = 0.5 s) from [midi, startSeconds, lengthSeconds]. */
function midiOf(notes) {
  const midi = new Midi()
  midi.header.setTempo(120)
  const track = midi.addTrack()
  for (const [pitch, time, duration] of notes) track.addNote({ midi: pitch, time, duration })
  return midi
}

const bytesOf = (midi) => {
  const bytes = midi.toArray()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/** What the Guitar tab plays: [pitch, onset seconds] for every note of every beat, in time order. */
async function heard(notes) {
  const { score } = await loadGuitarNotation(bytesOf(midiOf(notes)), 'played.mid')
  return buildTimeline(score)
    .entries.flatMap((entry) => entry.notes.map((n) => [n.midi, Math.round(entry.time * 1000) / 1000]))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
}

const played = (notes) => notes.map(([pitch, time]) => [pitch, time]).sort((a, b) => a[1] - b[1] || a[0] - b[0])

describe('MIDI from a recording, in the Guitar tab', () => {
  it.each([
    [
      'an arpeggio left ringing',
      [
        [48, 0, 2],
        [52, 0.5, 1.5],
        [55, 1, 1],
        [60, 1.5, 0.5],
        [48, 2, 2],
        [52, 2.5, 1.5],
        [55, 3, 1],
        [60, 3.5, 0.5],
      ],
    ],
    [
      'a bass held under a melody',
      [
        [40, 0, 4],
        [64, 0, 0.5],
        [66, 0.5, 0.5],
        [67, 1, 0.5],
        [69, 1.5, 0.5],
        [71, 2, 0.5],
        [69, 2.5, 0.5],
        [67, 3, 1],
      ],
    ],
    [
      'short notes inside a long one',
      [
        [60, 0, 2],
        [64, 0.5, 0.25],
        [67, 1, 0.25],
        [72, 2, 0.5],
      ],
    ],
    [
      'notes slightly off the beat, as played',
      [
        [64, 0.02, 0.47],
        [66, 0.49, 0.55],
        [67, 1.03, 0.4],
        [69, 1.51, 0.6],
      ],
    ],
  ])('%s: every note, on its beat, none dropped or late', async (_, notes) => {
    const expected = played(notes).map(([pitch, time]) => [pitch, Math.round(time / 0.125) * 0.125]) // the sixteenth-note grid
    expect(await heard(notes)).toEqual(expected)
  })

  it('holds a note of an odd length as one note, not struck twice', async () => {
    expect(await heard([[64, 0, 0.625]])).toEqual([[64, 0]]) // five sixteenths
    expect(await heard([[64, 0, 0.875]])).toEqual([[64, 0]]) // seven sixteenths
  })
})

describe('tidyMidiForTab', () => {
  it('shortens notes to the next onset, the barline and a single written length; never moves one', () => {
    const midi = midiOf([
      [60, 0, 2], // rings past the next onset (0.5 s)
      [64, 0.5, 0.625], // five sixteenths: a quarter
      [67, 1.5, 1], // crosses the barline at 2 s
    ])
    const before = midi.tracks[0].notes.map((n) => n.ticks)
    tidyMidiForTab(midi)
    const [a, b, c] = midi.tracks[0].notes
    expect(midi.tracks[0].notes.map((n) => n.ticks)).toEqual(before)
    expect([a.duration, b.duration, c.duration]).toEqual([0.5, 0.5, 0.5])
  })

  it('keeps notes that start together as a chord, each as long as the room allows', () => {
    const midi = tidyMidiForTab(
      midiOf([
        [52, 0, 1],
        [55, 0, 0.25],
        [59, 0, 1],
        [64, 1, 1],
      ]),
    )
    expect(midi.tracks[0].notes.map((n) => n.duration)).toEqual([1, 0.25, 1, 1])
  })

  it('leaves a tidy file’s notes as they were', () => {
    const buffer = readFileSync(new URL('../../tests/fixtures/midi/twinkle.mid', import.meta.url))
    const midi = new Midi(buffer)
    const lengths = midi.tracks.flatMap((t) => t.notes.map((n) => n.durationTicks))
    tidyMidiForTab(midi)
    const ppq = midi.header.ppq
    midi.tracks
      .flatMap((t) => t.notes.map((n) => n.durationTicks))
      .forEach((length, i) => expect(Math.abs(length - lengths[i])).toBeLessThanOrEqual(ppq / 8)) // within half a sixteenth
  })
})
