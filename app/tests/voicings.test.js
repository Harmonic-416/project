import { describe, expect, it } from 'vitest'
import { changeCost, voiceStrums, voicingsOf } from '../src/tabs/guitar/song/transcribe/voicings.js'

/** Basic Pitch-like evidence: `midis` sounding at `level`. */
const heard = (midis, level = 0.6) => {
  const evidence = new Float32Array(128)
  for (const m of midis) evidence[m] = level
  return evidence
}
const shapes = (voicings) => voicings.map((v) => v?.frets.join(',') ?? null)

const DM = { root: 2, kind: 'minor' }
const F = { root: 5, kind: 'major' }
const C = { root: 0, kind: 'major' }

describe('every playable voicing of a chord', () => {
  it('includes the open chords, barres and top-string triads', () => {
    const has = (voicings, frets) => voicings.some((v) => v.frets.join(',') === frets.join(','))
    expect(has(voicingsOf(2, [0, 3, 7]), [-1, -1, 0, 2, 3, 1])).toBe(true) // open Dm
    expect(has(voicingsOf(2, [0, 3, 7]), [-1, 5, 7, 7, 6, 5])).toBe(true) // A-shape barre
    expect(has(voicingsOf(5, [0, 4, 7]), [1, 3, 3, 2, 1, 1])).toBe(true) // E-shape barre F
    expect(has(voicingsOf(5, [0, 4, 7]), [-1, -1, 3, 2, 1, 1])).toBe(true) // the small F
    expect(has(voicingsOf(5, [0, 4, 7]), [-1, -1, -1, 2, 1, 1])).toBe(true) // F triad on the top strings
    expect(has(voicingsOf(7, [0, 4, 7]), [3, 2, 0, 0, 0, 3])).toBe(true) // open G
    expect(has(voicingsOf(0, [0, 4, 7, 10]), [-1, 3, 2, 3, 1, 0])).toBe(true) // open C7
    expect(has(voicingsOf(4, [0, 7]), [0, 2, 2, -1, -1, -1])).toBe(true) // E5 power chord
  })

  it('only gives shapes a hand can hold: four frets, four fingers (a barre is one), the root in the bass', () => {
    for (const [root, intervals] of [[2, [0, 3, 7]], [5, [0, 4, 7]], [7, [0, 4, 7, 10]], [9, [0, 3, 7, 10]]]) {
      for (const { frets, midis } of voicingsOf(root, intervals)) {
        const fretted = frets.filter((f) => f > 0)
        if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3)
        const bar = Math.min(...fretted)
        const fingers = fretted.length > 4 ? 1 + fretted.filter((f) => f > bar).length : fretted.length
        expect(fingers).toBeLessThanOrEqual(4)
        if (frets[0] >= 0 || frets[1] >= 0) expect(midis[0] % 12).toBe(root)
      }
    }
  })
})

describe('a shape for each strum', () => {
  it('picks the shape that matches what’s heard: the open Dm, the full F barre, an F on the top strings', () => {
    const chosen = voiceStrums([
      { time: 0, evidence: heard([50, 57, 62, 65]), chord: DM }, // D3 A3 D4 F4
      { time: 5, evidence: heard([41, 48, 53, 57, 60, 65]), chord: F }, // all six strings
      { time: 10, evidence: heard([57, 60, 65]), chord: F }, // A3 C4 F4 only
    ])
    expect(shapes(chosen)).toEqual(['-1,-1,0,2,3,1', '1,3,3,2,1,1', '-1,-1,-1,2,1,1'])
  })

  it('keeps the hand in place: Dm and C a beat apart stay open chords', () => {
    const dm = heard([50, 57, 62, 65])
    const c = heard([48, 52, 55, 60, 64]) // C3 E3 G3 C4 E4
    const strums = [dm, dm, c, c, dm, dm].map((evidence, i) => ({ time: i * 0.48, evidence, chord: i === 2 || i === 3 ? C : DM }))
    expect(shapes(voiceStrums(strums))).toEqual(['-1,-1,0,2,3,1', '-1,-1,0,2,3,1', '-1,3,2,0,1,0', '-1,3,2,0,1,0', '-1,-1,0,2,3,1', '-1,-1,0,2,3,1'])
  })

  it('writes an up-strum that only catches the top strings as those strings of the same shape', () => {
    const chosen = voiceStrums([
      { time: 0, evidence: heard([50, 57, 62, 65]), chord: DM },
      { time: 0.24, evidence: heard([57, 62, 65]), chord: DM }, // G, B and e strings only
    ])
    expect(shapes(chosen)).toEqual(['-1,-1,0,2,3,1', '-1,-1,-1,2,3,1'])
    expect(changeCost(chosen[0], chosen[1])).toBe(0)
  })

  it('makes a chord of the heard notes when no chord was recognised, and leaves picked notes alone', () => {
    const chosen = voiceStrums([
      { time: 0, evidence: heard([45, 52, 57, 60, 64]), chord: null }, // A2 E3 A3 C4 E4: an open Am
      { time: 1, evidence: heard([62, 65]), chord: DM }, // two notes: picked, not strummed
    ])
    expect(shapes(chosen)).toEqual(['-1,0,2,2,1,0', null])
  })
})
