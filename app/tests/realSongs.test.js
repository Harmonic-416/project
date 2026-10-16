import { describe, expect, it } from 'vitest'
import { compare, guitarTracks } from './realSongs.js'

// The scorer for real songs (realSongs.js) is the measuring stick for every
// change to the transcription, so it's checked on cases with a known answer.

const G = [
  { midi: 43, string: 6, fret: 3 },
  { midi: 47, string: 5, fret: 2 },
  { midi: 50, string: 4, fret: 0 },
  { midi: 55, string: 3, fret: 0 },
  { midi: 59, string: 2, fret: 0 },
  { midi: 67, string: 1, fret: 3 },
]
/** Eight bars of quarter-note G strums with eighth-note up-strums on the top strings. */
const reference = Array.from({ length: 64 }, (_, i) => ({
  beat: i / 2,
  notes: i % 2 ? G.slice(3) : G,
  muted: 0,
  chord: 'G',
}))

describe('scoring a draft against a reference tab', () => {
  it('gives a perfect score to the reference itself', () => {
    const { offset, scale, overall } = compare(reference, reference)
    expect({ offset, scale }).toEqual({ offset: 0, scale: 1 })
    for (const key of ['onsetRecall', 'onsetPrecision', 'noteF1', 'pitchF1', 'tabF1', 'chords']) expect(overall[key]).toBe(1)
  })

  it('lines the draft up when its bar 1 is elsewhere, or its beat counts halves', () => {
    const shifted = reference.map((o) => ({ ...o, beat: o.beat + 8 })) // two bars of pickup in front
    expect(compare(reference, shifted)).toMatchObject({ offset: 8, scale: 1, overall: { onsetRecall: 1, noteF1: 1 } })
    const halved = reference.map((o) => ({ ...o, beat: o.beat / 2 })) // the beat tracker heard half notes as beats
    expect(compare(reference, halved)).toMatchObject({ scale: 2, overall: { onsetRecall: 1, noteF1: 1 } })
  })

  it('counts what a draft of single notes misses: every strum found, but one string each', () => {
    const topOnly = reference.map((o) => ({ ...o, notes: o.notes.slice(-1) }))
    const { overall } = compare(reference, topOnly)
    expect(overall.onsetRecall).toBe(1)
    expect(overall.ourStrings).toBe(1)
    expect(overall.refStrings).toBe(4.5)
    expect(overall.noteF1).toBeCloseTo((2 * 64) / (288 + 64), 5)
  })

  it('counts missed strums, and wrong frets for the right pitches', () => {
    const everyOther = reference.filter((_, i) => i % 2 === 0)
    expect(compare(reference, everyOther).overall).toMatchObject({ onsetRecall: 0.5, onsetPrecision: 1 })
    const upTheNeck = reference.map((o) => ({ ...o, notes: o.notes.map((n) => (n.string === 3 ? { ...n, string: 4, fret: 5 } : n)) }))
    const { overall } = compare(reference, upTheNeck)
    expect(overall.pitchF1).toBe(1)
    expect(overall.tabF1).toBeLessThan(1)
  })
})

describe('the reference’s guitar tracks', () => {
  const staff = (tuning) => ({ isStringed: true, isPercussion: false, tuning })
  const track = (index, name, program, tuning) => ({ index, name, playbackInfo: { program }, staves: [staff(tuning)] })
  it('leaves out the bass, the vocals and the drums of a full-band file', () => {
    const score = {
      tracks: [
        track(0, 'Vocals', 54, [64, 59, 55, 50, 45, 40]),
        track(1, 'Electric Guitar (clean)', 27, [64, 59, 55, 50, 45, 40]),
        track(2, 'Flea', 33, [43, 38, 33, 28]), // a bass, by its tuning and program
        { index: 3, name: 'Drums', playbackInfo: { program: 0 }, staves: [{ isStringed: false, isPercussion: true, tuning: [] }] },
        track(4, 'Rhythm Guitar', 29, [62, 57, 53, 48, 43, 38]), // a guitar tuned down a whole step
      ],
    }
    expect(guitarTracks(score)).toEqual([1, 4])
  })
})
