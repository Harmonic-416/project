import { readFileSync } from 'node:fs'
import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { VOICE_PARTS, noteName, splitWarmup, voicePart, warmupShifts } from '../src/tabs/vocal/warmup/warmupLogic.js'

const midi = new Midi(readFileSync(new URL('../public/warmup/warmup.mid', import.meta.url)))
const { upper, lower } = splitWarmup(midi)

describe('warm-up file', () => {
  it('splits into two two-bar exercises', () => {
    expect(upper.length).toBeCloseTo(4)
    expect(lower.length).toBeCloseTo(4)
    expect(upper.notes[0]).toMatchObject({ midi: 60, time: 0 })
    expect(lower.notes[0]).toMatchObject({ midi: 67, time: 0 })
  })

  it('marks the last two notes, the move to the next key, as not sung', () => {
    expect(upper.notes.filter((n) => n.time >= upper.cueAt).map((n) => n.midi)).toEqual([67, 68])
    expect(lower.notes.filter((n) => n.time >= lower.cueAt).map((n) => n.midi)).toEqual([67, 66])
    expect(upper.notes.every((n) => n.time + n.duration <= upper.length + 1e-6)).toBe(true)
    expect(lower.notes.every((n) => n.time + n.duration <= lower.length + 1e-6)).toBe(true)
  })
})

describe('warm-up shifts', () => {
  it('climbs a half step at a time within every part’s range', () => {
    for (const part of VOICE_PARTS) {
      const shifts = warmupShifts(upper, part, 'upper')
      expect(upper.lowest + shifts[0]).toBe(part.upperStart)
      expect(shifts.slice(1).every((s, i) => s === shifts[i] + 1)).toBe(true)
      expect(upper.highest + shifts.at(-1)).toBe(part.high)
    }
  })

  it('drops a half step at a time within every part’s range', () => {
    for (const part of VOICE_PARTS) {
      const shifts = warmupShifts(lower, part, 'lower')
      expect(lower.highest + shifts[0]).toBe(part.lowerStart)
      expect(shifts.slice(1).every((s, i) => s === shifts[i] - 1)).toBe(true)
      expect(lower.lowest + shifts.at(-1)).toBe(part.low)
    }
  })

  it('names notes with sharps', () => {
    expect(noteName(60)).toBe('C4')
    expect(noteName(61)).toBe('C#4')
    expect(noteName(40)).toBe('E2')
    expect(voicePart('tenor').name).toBe('Tenor')
    expect(voicePart('nope')).toBe(null)
  })
})
