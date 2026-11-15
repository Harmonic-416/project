import { describe, expect, it } from 'vitest'
import {
  bestCombinedShift,
  candidateShifts,
  explainShift,
  fitKey,
  keyName,
  noteLabel,
  pitchName,
  scoreShift,
  transposeFifths,
} from '../src/tabs/vocal/transpose/keyFit.js'

const notes = (pairs) => pairs.map(([midi, duration = 1]) => ({ midi, duration }))
const SOPRANO = { low: 60, high: 79 } // C4–G5
const ALTO = { low: 55, high: 74 }
const BARITONE = { low: 45, high: 64 }

// Amazing Grace as written in C: G4 up to E5, living around C5–E5.
const AMAZING_GRACE = notes([
  [67, 1], [72, 2], [76, 0.5], [72, 0.5], [76, 2], [74, 1], [72, 2], [69, 1], [67, 2],
  [67, 1], [72, 2], [76, 0.5], [72, 0.5], [76, 2], [74, 1], [79, 3],
])

describe('transposeFifths', () => {
  it('moves the key signature by the circle of fifths, fewest accidentals', () => {
    expect(transposeFifths(0, -3)).toBe(3) // C → A
    expect(transposeFifths(0, 2)).toBe(2) // C → D
    expect(transposeFifths(0, 1)).toBe(-5) // C → Db, not C#
    expect(transposeFifths(-2, -2)).toBe(-4) // Bb → Ab
    expect(transposeFifths(3, 12)).toBe(3) // an octave keeps the key
  })

  it('keeps the side the key was on at six accidentals', () => {
    expect(transposeFifths(1, -1)).toBe(6) // G → F#
    expect(transposeFifths(-1, 1)).toBe(-6) // F → Gb
  })
})

describe('names', () => {
  it('names keys and notes', () => {
    expect(keyName(-2)).toBe('Bb')
    expect(keyName(3)).toBe('A')
    expect(keyName(-2, 'minor')).toBe('G minor')
    expect(keyName(0, 'minor')).toBe('A minor')
    expect(pitchName(70, -2)).toBe('Bb')
    expect(pitchName(70, 2)).toBe('A#')
    expect(noteLabel(67)).toBe('G4')
    expect(noteLabel(60)).toBe('C4')
  })
})

describe('scoreShift', () => {
  it('costs nothing beyond the move when the part sits in the middle of the range', () => {
    const s = scoreShift(notes([[69], [70], [71]]), SOPRANO, 0)
    expect(s.tessitura).toBe(0)
    expect(s.outside).toBe(0)
    expect(s.peak).toBe(0)
    expect(s.cost).toBeCloseTo(s.move)
  })

  it('weights by time: a long note out of range costs more than a short one', () => {
    const shortHigh = scoreShift(notes([[70, 4], [82, 0.25]]), SOPRANO, 0)
    const longHigh = scoreShift(notes([[70, 0.25], [82, 4]]), SOPRANO, 0)
    expect(longHigh.outside).toBeGreaterThan(shortHigh.outside)
    expect(longHigh.cost).toBeGreaterThan(shortHigh.cost)
    // …but the short one still counts as a peak to reach.
    expect(shortHigh.peak).toBe(3)
  })

  it('is soft at the edge and steep beyond the margin', () => {
    const one = scoreShift(notes([[80]]), SOPRANO, 0).outside
    const two = scoreShift(notes([[81]]), SOPRANO, 0).outside
    const three = scoreShift(notes([[82]]), SOPRANO, 0).outside
    expect(two - one).toBeGreaterThan(one) // past the margin, each semitone costs more
    expect(three - two).toBeCloseTo(two - one)
  })

  it('charges the move: key distance, distance and the new key signature', () => {
    const part = notes([[69]])
    expect(scoreShift(part, SOPRANO, 0).move).toBe(0)
    expect(scoreShift(part, SOPRANO, -12).move).toBeLessThan(scoreShift(part, SOPRANO, -10).move) // same key beats a new one
    // The same move from D lands in E (four sharps), from Bb in C (none).
    expect(scoreShift(part, SOPRANO, 2, { fifths: 2 }).move).toBeGreaterThan(scoreShift(part, SOPRANO, 2, { fifths: -2 }).move)
  })
})

describe('candidateShifts', () => {
  it('covers −12…12, or octaves only', () => {
    expect(candidateShifts()).toHaveLength(25)
    expect(candidateShifts({ octavesOnly: true })).toEqual([-12, 0, 12])
  })
})

describe('fitKey', () => {
  it('leaves a song that already fits where it is', () => {
    const fit = fitKey(AMAZING_GRACE.slice(0, 9), SOPRANO)
    expect(fit.shift).toBe(0)
    expect(fit.fits).toBe(true)
    expect(fit.reason).toBe('Already sits well in your range.')
    expect(fit.key).toBe('C')
  })

  it('moves a song down for a lower voice and says why', () => {
    const fit = fitKey(AMAZING_GRACE, ALTO)
    expect(fit.shift).toBeLessThan(0)
    expect(fit.highest).toBeLessThanOrEqual(ALTO.high)
    expect(fit.lowest).toBeGreaterThanOrEqual(ALTO.low)
    expect(fit.reason).toMatch(/^Moves the song down \d+ so the high G becomes [A-G][b#]?\.$/)
  })

  it('moves a soprano line an octave down for a baritone rather than to a far key', () => {
    const fit = fitKey(AMAZING_GRACE.slice(0, 9), BARITONE)
    expect(fit.shift).toBe(-12)
    expect(fit.key).toBe('C')
    expect(fit.reason).toBe('Moves the song down an octave so the high E5 becomes E4.')
  })

  it('moves a low song up and names the low note', () => {
    // G3–D5: too wide to go up an octave, so up a fourth puts it on C4–G5.
    const low = notes([[55, 2], [57, 2], [59, 1], [62, 2], [67, 2], [71, 2], [74, 1], [62, 2]])
    const fit = fitKey(low, SOPRANO)
    expect(fit.shift).toBe(5)
    expect(fit.reason).toBe('Moves the song up 5 so the low G becomes C.')
    expect(fit.lowest).toBe(SOPRANO.low)
    expect(fit.fits).toBe(true)
  })

  it('moves a low tune up an octave when the whole of it fits there', () => {
    const fit = fitKey(notes([[55, 2], [57, 2], [60, 2]]), SOPRANO)
    expect(fit.shift).toBe(12)
    expect(fit.reason).toBe('Moves the song up an octave so the low G3 becomes G4.')
  })

  it('goes by where the song lives, not just its extremes', () => {
    // One brief low D among a tune that lives high: the time-weighted fit
    // moves it down a little; an extremes-only fit would centre D…G.
    const high = notes([[62, 0.25], [76, 3], [77, 3], [79, 3], [77, 3], [76, 3]])
    const fit = fitKey(high, SOPRANO)
    expect(fit.shift).toBeLessThan(0)
    expect(fit.lowest).toBeGreaterThanOrEqual(SOPRANO.low - 1) // the short D may stretch the margin
  })

  it('prefers the smaller move and the friendlier key between equal fits', () => {
    // A single held A4 fits a soprano anywhere from C4 to G5 equally: no move wins.
    expect(fitKey(notes([[69, 4]]), SOPRANO).shift).toBe(0)
    // Up 2 and up 3 both put a C4 in the sweet spot. From C, up 2 (D, two
    // sharps) is the smaller move; from D, up 3 lands in F (one flat) where
    // up 2 would be E (four sharps), and the friendlier key tips it.
    const range = { low: 58, high: 78 }
    expect(fitKey(notes([[60, 4]]), range, { fifths: 0 }).shift).toBe(2)
    expect(fitKey(notes([[60, 4]]), range, { fifths: 2 }).shift).toBe(3)
    expect(fitKey(notes([[60, 4]]), range, { fifths: 2 }).key).toBe('F')
  })

  it('says when a part spans more than the range', () => {
    const wide = notes([[48, 1], [84, 1], [66, 4]])
    const fit = fitKey(wide, SOPRANO)
    expect(fit.fits).toBe(false)
    expect(fit.reason).toMatch(/spans more than your range|still sit/)
  })

  it('spells in the new key', () => {
    // Written in F (one flat), moved down 2 to Eb: the high Bb becomes Ab.
    const tune = notes([[65, 2], [70, 2], [82, 2], [77, 2]])
    const fit = fitKey(tune, { low: 60, high: 80 }, { fifths: -1 })
    expect(fit.shift).toBe(-2)
    expect(fit.key).toBe('Eb')
    expect(fit.reason).toBe('Moves the song down 2 so the high Bb becomes Ab.')
  })

  it('does nothing without notes', () => {
    const fit = fitKey([], SOPRANO, { fifths: 2 })
    expect(fit.shift).toBe(0)
    expect(fit.key).toBe('D')
  })

  it('honours a narrower search', () => {
    expect(fitKey(AMAZING_GRACE.slice(0, 9), BARITONE, { octavesOnly: true }).shift).toBe(-12)
    expect(fitKey(AMAZING_GRACE.slice(0, 9), BARITONE, { minShift: -5, maxShift: 5 }).shift).toBe(-5)
  })
})

describe('bestCombinedShift', () => {
  it('weights the parts: the heavier part decides a conflict', () => {
    const high = { notes: notes([[76, 4]]), range: { low: 60, high: 72 } } // wants down
    const low = { notes: notes([[56, 4]]), range: { low: 50, high: 62 } } // happy where it is
    expect(bestCombinedShift([{ ...high, weight: 3 }, { ...low, weight: 1 }]).shift).toBeLessThan(0)
    expect(bestCombinedShift([{ ...high, weight: 0.01 }, { ...low, weight: 3 }]).shift).toBe(0)
  })

  it('returns every candidate, best first', () => {
    const { candidates } = bestCombinedShift([{ notes: notes([[69]]), range: SOPRANO }])
    expect(candidates).toHaveLength(25)
    expect(candidates[0].cost).toBeLessThanOrEqual(candidates[1].cost)
  })

  it('ignores silent parts', () => {
    expect(bestCombinedShift([{ notes: [], range: SOPRANO }])).toEqual({ shift: 0, candidates: [] })
  })
})

describe('explainShift', () => {
  it('reads like the example', () => {
    expect(explainShift({ shift: -3, lowest: 60, highest: 79, range: { low: 55, high: 76 } })).toBe(
      'Moves the song down 3 so the high G becomes E.',
    )
  })

  it('owns up to notes still out of reach', () => {
    expect(explainShift({ shift: -3, lowest: 60, highest: 82, range: { low: 55, high: 76 } })).toMatch(/still sit above/)
    expect(explainShift({ shift: 0, lowest: 50, highest: 70, range: { low: 55, high: 76 } })).toMatch(/^Best as written\. A few notes still sit below/)
  })
})
