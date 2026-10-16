import { describe, expect, it } from 'vitest'
import { dropGhostNotes } from '../src/tabs/guitar/song/transcribe/ghostNotes.js'
import { RATE, pick, renderGuitar, strum } from './guitarSignals.js'

const note = (pitchMidi, start, end, amplitude = 0.7) => ({ pitchMidi, startTimeSeconds: start, durationSeconds: end - start, amplitude })
const kept = (notes) => notes.map((n) => [n.pitchMidi, +n.startTimeSeconds.toFixed(2), +(n.startTimeSeconds + n.durationSeconds).toFixed(2)])

describe('ghost notes', () => {
  it('joins a ringing string’s fresh start back onto its note', () => {
    // A2 rings on string 5 while C4 is picked on string 2; the model restarts the A2.
    const audio = renderGuitar(3, [pick(0.5, 5, 0), pick(1.5, 2, 1)])
    const heard = [note(45, 0.5, 1.5), note(45, 1.5, 2.8, 0.5), note(60, 1.5, 2.8)]
    expect(kept(dropGhostNotes(heard, audio, { sampleRate: RATE }))).toEqual([
      [45, 0.5, 2.8],
      [60, 1.5, 2.8],
    ])
  })

  it('keeps a real re-pick of the same note', () => {
    const audio = renderGuitar(3, [pick(0.5, 5, 0), pick(1.5, 5, 0)])
    const heard = [note(45, 0.5, 1.5), note(45, 1.5, 2.8)]
    expect(kept(dropGhostNotes(heard, audio, { sampleRate: RATE }))).toEqual([
      [45, 0.5, 1.5],
      [45, 1.5, 2.8],
    ])
  })

  it('drops an overtone heard as a note, but keeps an octave really played', () => {
    // E3 alone: its second harmonic (E4) heard briefly.
    const alone = renderGuitar(2, [pick(0.5, 4, 2)])
    expect(kept(dropGhostNotes([note(52, 0.5, 1.8), note(64, 0.5, 0.62, 0.45)], alone, { sampleRate: RATE }))).toEqual([[52, 0.5, 1.8]])

    // E2 and E3 strummed together: both ring as long.
    const octave = renderGuitar(2, strum(0.5, { 6: 0, 4: 2 }, { spread: 0.01 }))
    expect(kept(dropGhostNotes([note(40, 0.5, 1.8), note(52, 0.51, 1.8)], octave, { sampleRate: RATE }))).toEqual([
      [40, 0.5, 1.8],
      [52, 0.51, 1.8],
    ])
  })
})
