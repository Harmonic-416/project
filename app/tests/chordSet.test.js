import { describe, expect, it } from 'vitest'
import { EVERY_STRING, judgeWindow } from '../src/tabs/guitar/song/follow/noteJudge.js'
import { OPEN_STRINGS, listen, renderGuitar, strum, withRoomNoise } from './guitarSignals.js'

/**
 * Twenty common open chords, as songs use them, through the real listening
 * path, judged the way Wait for me judges them (EVERY_STRING). Many differ
 * by one note (A / A7 / Asus2, C / C7 / Cmaj7, D / D7 / Dsus2 / Dsus4 …),
 * and some hide the difference behind another string's octave, so this is
 * the check that none of them passes for another.
 */

// Frets low E → high e; -1 = not played.
const CHORDS = [
  { id: 'Em', frets: [0, 2, 2, 0, 0, 0] },
  { id: 'Am', frets: [-1, 0, 2, 2, 1, 0] },
  { id: 'C', frets: [-1, 3, 2, 0, 1, 0] },
  { id: 'G', frets: [3, 2, 0, 0, 0, 3] },
  { id: 'D', frets: [-1, -1, 0, 2, 3, 2] },
  { id: 'E', frets: [0, 2, 2, 1, 0, 0] },
  { id: 'A', frets: [-1, 0, 2, 2, 2, 0] },
  { id: 'Dm', frets: [-1, -1, 0, 2, 3, 1] },
  { id: 'F', frets: [-1, -1, 3, 2, 1, 1] }, // the small F
  { id: 'A7', frets: [-1, 0, 2, 0, 2, 0] },
  { id: 'D7', frets: [-1, -1, 0, 2, 1, 2] },
  { id: 'E7', frets: [0, 2, 0, 1, 0, 0] },
  { id: 'G7', frets: [3, 2, 0, 0, 0, 1] },
  { id: 'C7', frets: [-1, 3, 2, 3, 1, 0] },
  { id: 'B7', frets: [-1, 2, 1, 2, 0, 2] },
  { id: 'Asus2', frets: [-1, 0, 2, 2, 0, 0] },
  { id: 'Dsus2', frets: [-1, -1, 0, 2, 3, 0] },
  { id: 'Dsus4', frets: [-1, -1, 0, 2, 3, 3] },
  { id: 'Cmaj7', frets: [-1, 3, 2, 0, 0, 0] },
  { id: 'Fmaj7', frets: [-1, -1, 3, 2, 1, 0] },
]

const shapeOf = (chord) => Object.fromEntries(chord.frets.flatMap((fret, i) => (fret < 0 ? [] : [[6 - i, fret]])))
const entryOf = (chord) => ({
  kind: 'chord',
  technique: 'pick',
  notes: chord.frets.flatMap((fret, i) => (fret < 0 ? [] : [{ midi: OPEN_STRINGS[6 - i] + fret, string: 6 - i, fret }])),
})

// Two strums of every chord, each with its own string balance and detuning.
const heard = CHORDS.map((chord) => ({
  chord,
  windows: [3, 11].map((seed) => listen(withRoomNoise(renderGuitar(1.6, strum(0.4, shapeOf(chord), { seed }))))[0]),
}))

const verdict = (window, chord) => judgeWindow(window, entryOf(chord), EVERY_STRING).verdict

describe('20 common open chords', () => {
  it.each(CHORDS.map((c) => c.id))('%s is heard as itself', (id) => {
    const { chord, windows } = heard.find((h) => h.chord.id === id)
    for (const window of windows) expect(verdict(window, chord)).toBe('hit')
  })

  it('no chord passes for another', () => {
    const accepted = []
    for (const { chord: played, windows } of heard) {
      for (const expected of CHORDS) {
        if (expected === played) continue
        if (windows.some((w) => verdict(w, expected) === 'hit')) accepted.push(`${played.id} for ${expected.id}`)
      }
    }
    expect(accepted).toEqual([])
  })

  it('names the note that shouldn’t be there', () => {
    // A7 played while A is expected: A7's open G string (G3, MIDI 55) is the extra note.
    const a7 = heard.find((h) => h.chord.id === 'A7').windows[0]
    const result = judgeWindow(a7, entryOf(CHORDS.find((c) => c.id === 'A')), EVERY_STRING)
    expect(result.verdict).toBe('close')
    expect(result.extra).toContain(55)
  })
})
