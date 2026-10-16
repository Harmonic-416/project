import { describe, expect, it } from 'vitest'
import { beatChroma, recognizeChords } from '../src/tabs/guitar/song/transcribe/chords.js'

const FPS = 86
const frameTime = (f) => f / FPS

/**
 * Basic Pitch-style activations for a list of beats, each the MIDI notes
 * sounding on it (empty = silence): 0.85 on those pitches, a little noise
 * elsewhere. Beats are 0.5 s apart from 0.5 s.
 */
function activations(beatNotes) {
  const beats = beatNotes.map((_, i) => 0.5 + i * 0.5)
  const frames = []
  for (let f = 0; f < Math.ceil((0.5 + beatNotes.length * 0.5) * FPS); f += 1) {
    const t = frameTime(f)
    const beat = Math.floor((t - 0.5) / 0.5)
    const frame = new Float32Array(88).fill(0.02)
    for (const midi of beatNotes[beat] ?? []) frame[midi - 21] = 0.85
    frames.push(frame)
  }
  return { frames, beats }
}

const VOICINGS = {
  Em: [40, 47, 52, 55, 59, 64],
  C: [48, 52, 55, 60, 64],
  G: [43, 47, 50, 55, 59, 67],
  D: [50, 57, 62, 66],
  Am: [45, 52, 57, 60, 64],
  F: [53, 57, 60, 65],
  E7: [40, 47, 50, 56, 59, 64],
  Bm: [47, 54, 59, 62, 66],
  'F#m': [42, 49, 54, 57, 61, 66],
}

const ids = (chords) => chords.map((c) => c?.id ?? null)

describe('chords on every beat', () => {
  it('names a progression, a chord a bar', () => {
    const progression = ['Em', 'C', 'G', 'D', 'Am', 'F', 'E7', 'Bm', 'F#m']
    const { frames, beats } = activations(progression.flatMap((c) => Array(4).fill(VOICINGS[c])))
    const chords = recognizeChords(beatChroma(frames, frameTime, beats))
    expect(ids(chords)).toEqual(progression.flatMap((c) => Array(4).fill(c)))
  })

  it('holds the chord through a passing note', () => {
    const am = VOICINGS.Am
    const passing = [45, 52, 57, 59, 64] // the B for the C on beat 3
    const { frames, beats } = activations([am, am, passing, am, VOICINGS.F, VOICINGS.F, VOICINGS.F, VOICINGS.F])
    expect(ids(recognizeChords(beatChroma(frames, frameTime, beats)))).toEqual(['Am', 'Am', 'Am', 'Am', 'F', 'F', 'F', 'F'])
  })

  it('has no chord on silent beats', () => {
    const { frames, beats } = activations([VOICINGS.C, VOICINGS.C, [], [], VOICINGS.G, VOICINGS.G, VOICINGS.G, VOICINGS.G])
    const frameless = frames.map((frame) => (frame.every((a) => a <= 0.02) ? new Float32Array(88) : frame))
    expect(ids(recognizeChords(beatChroma(frameless, frameTime, beats)))).toEqual(['C', 'C', null, null, 'G', 'G', 'G', 'G'])
  })

  it('takes the root from the bass: A–C–E over A is Am, over C it’s C6-ish C', () => {
    const { frames, beats } = activations([...Array(4).fill([45, 52, 57, 60, 64]), ...Array(4).fill([48, 52, 55, 60, 64])])
    expect(ids(recognizeChords(beatChroma(frames, frameTime, beats)))).toEqual([...Array(4).fill('Am'), ...Array(4).fill('C')])
  })
})
