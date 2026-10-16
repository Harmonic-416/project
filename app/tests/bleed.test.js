import { describe, expect, it } from 'vitest'
import { dropBleed } from '../src/tabs/guitar/song/transcribe/bleed.js'

const RATE = 22050
const tone = (midi, amp, seconds = 1) => {
  const f = 440 * 2 ** ((midi - 69) / 12)
  return Float32Array.from({ length: seconds * RATE }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / RATE))
}
const add = (...signals) => signals[0].map((_, i) => signals.reduce((sum, s) => sum + s[i], 0))
const note = (pitchMidi) => ({ startTimeSeconds: 0.1, durationSeconds: 0.5, pitchMidi, amplitude: 0.6 })

describe('what bled into the separated guitar', () => {
  // The song: a guitar's A3 and a piano's E5. The separator kept the A3 and let a little of the E5 through.
  const guitar = tone(57, 0.3)
  const piano = tone(76, 0.3)
  const song = add(guitar, piano)
  const stem = add(guitar, tone(76, 0.03))

  it('keeps the guitar’s notes and drops the piano that leaked in', () => {
    expect(dropBleed([note(57), note(76)], stem, song).map((n) => n.pitchMidi)).toEqual([57])
  })

  it('keeps a guitar note doubled by another instrument', () => {
    // A unison with the piano: the stem still holds a good share of that pitch.
    const doubled = add(guitar, tone(57, 0.3))
    expect(dropBleed([note(57)], guitar, doubled).map((n) => n.pitchMidi)).toEqual([57])
  })
})
