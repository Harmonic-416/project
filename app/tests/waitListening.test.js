import { describe, expect, it } from 'vitest'
import { createWaitAttempts, soundsLikeANote } from '../src/tabs/guitar/song/follow/waitListening.js'
import { initialWait, waitReducer } from '../src/tabs/guitar/song/follow/waitState.js'
import { OPEN_STRINGS, listen, mix, pick, renderGuitar, strum, typing, withRoomNoise } from './guitarSignals.js'

const EM = { 6: 0, 5: 2, 4: 2, 3: 0, 2: 0, 1: 0 }
const C = { 5: 3, 4: 2, 3: 0, 2: 1, 1: 0 }
// Ode to Joy in open position, as [string, fret]: E4 = string 1 open, F4 = 1/1, G4 = 1/3, D4 = 2/3.
const ODE = { E: [1, 0], F: [1, 1], G: [1, 3], D: [2, 3] }

const chordEntry = (index, shape) => ({
  index,
  kind: 'chord',
  technique: 'pick',
  notes: Object.entries(shape)
    .map(([string, fret]) => ({ midi: OPEN_STRINGS[string] + fret, string: Number(string), fret }))
    .sort((a, b) => a.midi - b.midi),
})
const noteEntry = (index, [string, fret]) => ({ index, kind: 'single', technique: 'pick', notes: [{ midi: OPEN_STRINGS[string] + fret, string, fret }] })

// The built-in songs' openings: Four-Chord Strum strums each chord on four beats; Ode to Joy opens E E F G.
const STRUM_SONG = [EM, EM, EM, EM, C, C, C, C].map((shape, i) => chordEntry(i, shape))
const ODE_SONG = ['E', 'E', 'F', 'G', 'G', 'F'].map((name, i) => noteEntry(i, ODE[name]))

/** Wait for me over `signal`, wired the way GuitarWaitMode wires it. */
function waitFor(entries, signal) {
  const reduce = waitReducer(entries)
  const attempts = createWaitAttempts()
  let state = initialWait(entries)
  let wrong = 0
  for (const window of listen(signal)) {
    const entry = entries[state.index]
    if (!entry) break
    for (const action of attempts.consider(window, entry).actions) {
      if (action.result.verdict !== 'hit') wrong += 1
      state = reduce(state, action)
    }
  }
  return { moved: state.index, marks: state.results.slice(0, state.index), wrong }
}

const hits = (n) => Array(n).fill('hit')

describe('wait for me: noise is not a note', () => {
  it('ignores typing near the microphone, soft or loud', () => {
    expect(waitFor(STRUM_SONG, withRoomNoise(typing(6.5, 0.5, 6, { amp: 0.05, seed: 3 })))).toEqual({ moved: 0, marks: [], wrong: 0 })
    expect(waitFor(ODE_SONG, withRoomNoise(typing(6.5, 0.5, 6, { amp: 0.15, seed: 5 })))).toEqual({ moved: 0, marks: [], wrong: 0 })
  })

  it('tells a pick from a keystroke', () => {
    const [note] = listen(withRoomNoise(renderGuitar(1.5, [pick(0.5, 1, 0)])))
    const [key] = listen(withRoomNoise(typing(1.5, 0.5, 0.55, { amp: 0.1, seed: 2 })))
    expect(soundsLikeANote(note).ok).toBe(true)
    expect(soundsLikeANote(key).ok).toBe(false)
  })

  it('still hears a soft strum in a noisy room, and nothing of the typing over it', () => {
    const signal = mix(renderGuitar(4, strum(0.8, EM, { amp: 0.05 })), typing(4, 1.4, 3.6, { amp: 0.03, seed: 11 }))
    expect(waitFor(STRUM_SONG, withRoomNoise(signal, 0.003))).toEqual({ moved: 1, marks: ['hit'], wrong: 0 })
  })
})

describe('wait for me: one strum, one judgement', () => {
  it('counts a strum once however long it rings, and whatever is heard while it does', () => {
    expect(waitFor(STRUM_SONG, withRoomNoise(renderGuitar(4.5, strum(0.5, EM))))).toEqual({ moved: 1, marks: ['hit'], wrong: 0 })
    const typedOver = mix(renderGuitar(4.5, strum(0.5, EM)), typing(4.5, 1.2, 4, { seed: 9 }))
    expect(waitFor(STRUM_SONG, withRoomNoise(typedOver))).toEqual({ moved: 1, marks: ['hit'], wrong: 0 })
    // A ringing E4 with a weak fundamental, while the song waits on a second E4.
    const ringing = renderGuitar(3.5, [pick(0.5, 1, 0, { weights: [0.35, 1, 0.6, 0.45, 0.3, 0.2] })])
    expect(waitFor(ODE_SONG, withRoomNoise(ringing))).toEqual({ moved: 1, marks: ['hit'], wrong: 0 })
  })

  it('judges a strum caught in two goes once, without calling its first half wrong', () => {
    const signal = renderGuitar(3, strum(0.5, EM, { gap: 0.13, second: 1.6 }))
    expect(waitFor(STRUM_SONG, withRoomNoise(signal))).toEqual({ moved: 1, marks: ['hit'], wrong: 0 })
  })

  it('hears every strum and pick of correct playing', () => {
    const fourEm = [0, 1, 2, 3].flatMap((i) => strum(0.5 + i * 0.6, EM, { seed: 20 + i }))
    expect(waitFor(STRUM_SONG, withRoomNoise(renderGuitar(3.6, fourEm)))).toEqual({ moved: 4, marks: hits(4), wrong: 0 })
    const emThenC = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => strum(0.5 + i * 0.5, i < 4 ? EM : C, { seed: 30 + i }))
    expect(waitFor(STRUM_SONG, withRoomNoise(renderGuitar(5, emThenC)))).toEqual({ moved: 8, marks: hits(8), wrong: 0 })
    for (const gap of [0.6, 0.35]) {
      const picks = ['E', 'E', 'F', 'G'].map((name, i) => pick(0.5 + i * gap, ...ODE[name]))
      expect(waitFor(ODE_SONG, withRoomNoise(renderGuitar(0.9 + 4 * gap, picks)))).toEqual({ moved: 4, marks: hits(4), wrong: 0 })
    }
  })
})

describe('wait for me: wrong notes', () => {
  it('stays on the chord while a different one is strummed', () => {
    const threeC = [0, 1, 2].flatMap((i) => strum(0.5 + i, C, { seed: 60 + i }))
    expect(waitFor(STRUM_SONG, withRoomNoise(renderGuitar(3.6, threeC)))).toEqual({ moved: 0, marks: [], wrong: 3 })
  })

  it('moves on once the right note comes, marked as taking more than one try', () => {
    const picks = ['F', 'D', 'E'].map((name, i) => pick(0.5 + i * 0.8, ...ODE[name]))
    expect(waitFor(ODE_SONG, withRoomNoise(renderGuitar(3, picks)))).toEqual({ moved: 1, marks: ['close'], wrong: 2 })
  })
})
