import { describe, expect, it } from 'vitest'
import {
  FRETS,
  TUNINGS,
  allPositions,
  explainMove,
  gapRule,
  matchGroups,
  matchingPositions,
  noteName,
  pitchName,
  stringName,
  tuningById,
  tuningLabel,
} from '../src/tabs/guitar/fretboard/fretboard.js'
import { OPEN_STRING_MIDI } from '../src/tabs/guitar/practice/chords.js'

const standard = tuningById('standard')
const at = (string, fret, tuning = standard) => ({ string, fret, midi: tuning.notes[string] + fret })

describe('fretboard', () => {
  it('standard tuning matches the rest of the guitar tab', () => {
    expect(standard.notes).toEqual(OPEN_STRING_MIDI)
  })

  it('labels the five tunings', () => {
    expect(TUNINGS.map(tuningLabel)).toEqual([
      'E A D G B E',
      'D A D G B E',
      'E♭ A♭ D♭ G♭ B♭ E♭',
      'D A D G A D',
      'D G D G B D',
    ])
  })

  it('names notes and pitches', () => {
    expect(noteName(62)).toBe('D')
    expect(noteName(66)).toBe('F♯')
    expect(noteName(66, true)).toBe('G♭')
    expect(pitchName(60)).toBe('C4')
    expect(pitchName(40)).toBe('E2')
  })

  it('names strings, telling the two E strings apart', () => {
    expect(stringName(standard, 0)).toBe('low E string')
    expect(stringName(standard, 5)).toBe('high E string')
    expect(stringName(standard, 1)).toBe('A string')
    expect(stringName(tuningById('dadgad'), 2)).toBe('high D string')
  })

  it('every spot is the open string plus one semitone per fret', () => {
    const all = allPositions(standard)
    expect(all).toHaveLength(6 * (FRETS + 1))
    expect(all.find((p) => p.string === 1 && p.fret === 5).midi).toBe(50) // A string 5th fret = D3
  })

  it('finds the same pitch: A on the low E 5th fret = open A', () => {
    const a2 = at(0, 5)
    expect(matchingPositions(standard, a2.midi).map((p) => [p.string, p.fret])).toEqual([
      [0, 5],
      [1, 0],
    ])
  })

  it('same pitch crosses G → B with a 4-fret move', () => {
    // B3 on the G string 4th fret = open B string
    expect(matchingPositions(standard, at(3, 4).midi).map((p) => [p.string, p.fret])).toContainEqual([4, 0])
  })

  it('all octaves finds every D on the neck', () => {
    const ds = matchingPositions(standard, 50, 'octaves')
    expect(ds.every((p) => p.midi % 12 === 2)).toBe(true)
    expect(ds.length).toBeGreaterThan(matchingPositions(standard, 50).length)
    // the fret-12 repeat is there and an octave up
    expect(ds).toContainEqual({ string: 2, fret: 12, midi: 62 })
  })

  it('changing the tuning moves the notes', () => {
    // fret 0 on string 6 is E in standard, D in drop D
    expect(noteName(tuningById('drop-d').notes[0])).toBe('D')
    expect(matchingPositions(tuningById('drop-d'), 38).map((p) => [p.string, p.fret])).toEqual([[0, 0]])
  })

  it('groups matches by pitch for the connecting lines', () => {
    const groups = matchGroups(matchingPositions(standard, 50, 'octaves'))
    expect(groups.map((g) => g.midi)).toEqual([...groups.map((g) => g.midi)].sort((a, b) => a - b))
    for (const g of groups) expect(g.positions.every((p) => p.midi === g.midi)).toBe(true)
  })

  it('explains moves between strings and along one string', () => {
    expect(explainMove(standard, at(0, 5), at(1, 0))).toBe(
      'The A string is tuned 5 semitones higher (thinner), so go 5 frets back.',
    )
    expect(explainMove(standard, at(3, 4), at(4, 0))).toBe(
      'The B string is tuned 4 semitones higher (thinner), so go 4 frets back.',
    )
    expect(explainMove(standard, at(2, 0), at(2, 12))).toBe(
      'Same string, 12 frets up: every 12 frets the notes repeat. That\'s an octave higher.',
    )
    expect(explainMove(standard, at(1, 0), at(0, 5))).toBe(
      'The low E string is tuned 5 semitones lower (thicker), so go 5 frets up.',
    )
  })

  it('states each tuning’s neighbour-string rule', () => {
    expect(gapRule(standard)).toBe('Same note one string thinner = 5 frets back (except G → B: 4).')
    expect(gapRule(tuningById('drop-d'))).toBe('Same note one string thinner = 5 frets back (except D → A: 7, G → B: 4).')
    expect(gapRule(tuningById('e-flat'))).toBe('Same note one string thinner = 5 frets back (except G♭ → B♭: 4).')
  })
})