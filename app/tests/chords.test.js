import { describe, expect, it } from 'vitest'
import { CHORDS, chordMidi, dotLabel, noteAt } from '../src/tabs/guitar/practice/chords.js'

const em = CHORDS.find((c) => c.id === 'Em')
const am = CHORDS.find((c) => c.id === 'Am')

describe('chord data', () => {
  it('every chord has six strings, sensible frets and matching fingers', () => {
    for (const chord of CHORDS) {
      expect(chord.frets).toHaveLength(6)
      expect(chord.fingers).toHaveLength(6)
      chord.frets.forEach((fret, i) => {
        expect(fret).toBeGreaterThanOrEqual(-1)
        expect(fret).toBeLessThanOrEqual(4)
        // a finger only where a fret is pressed, and a fret pressed only with a finger
        expect(chord.fingers[i] > 0).toBe(fret > 0)
      })
    }
  })

  it('E minor is 0-2-2-0-0-0 and spells E B E G B E', () => {
    expect(em.frets).toEqual([0, 2, 2, 0, 0, 0])
    expect(em.frets.map((fret, i) => noteAt(i, fret))).toEqual(['E', 'B', 'E', 'G', 'B', 'E'])
  })

  it('leaves muted strings out of the sound', () => {
    expect(noteAt(0, -1)).toBeNull()
    expect(chordMidi(am)).toEqual([45, 52, 57, 60, 64]) // A E A C E
  })
})

describe('dotLabel (F35 label toggle)', () => {
  it('shows fret numbers, note names or finger numbers', () => {
    expect(dotLabel(em, 1, 'fret')).toBe('2')
    expect(dotLabel(em, 1, 'note')).toBe('B')
    expect(dotLabel(em, 1, 'finger')).toBe('2')
    expect(dotLabel(em, 2, 'finger')).toBe('3')
  })
})
