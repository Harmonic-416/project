import { describe, expect, it } from 'vitest'
import { describeOption, keyOptions, notesOutside, optionName } from '../src/tabs/vocal/transpose/keyFit.js'
import { COMFORTABLE_RANGES } from '../src/tabs/vocal/transpose/voiceRange.js'

const line = (...midis) => midis.map((midi) => ({ midi, duration: 1 }))
// Amazing Grace's tune as written spans G4–G5.
const amazingGrace = line(67, 72, 76, 74, 72, 76, 74, 72, 69, 67, 67, 72, 76, 74, 79, 76, 79)
// Ode to Joy: C4–G4.
const odeToJoy = line(64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62)
// Paint It Black's tune: D3–Ab3.
const paintItBlack = line(62 - 12, 64 - 12, 65 - 12, 67 - 12, 68 - 12, 67 - 12, 65 - 12)

describe('keyOptions — what to offer a singer', () => {
  it('never moves a song that already fits the voice', () => {
    const { recommended, options } = keyOptions(odeToJoy, COMFORTABLE_RANGES.soprano)
    expect(recommended).toMatchObject({ shift: 0, kind: 'written', fits: true })
    expect(describeOption(options[0])).toBe('Fits your voice as written')
  })

  it('recommends the smallest move that brings every note into reach', () => {
    const { recommended, options } = keyOptions(amazingGrace, COMFORTABLE_RANGES.alto)
    expect(options[0]).toMatchObject({ kind: 'written', fits: false })
    expect(describeOption(options[0])).toMatch(/too high/)
    expect(recommended).toMatchObject({ shift: -4, kind: 'smallest', fits: true })
    // The centred fit stays on offer as an alternative.
    expect(options.map((o) => o.kind)).toContain('centred')
  })

  it('offers the same key an octave away when that fits', () => {
    const { options, recommended } = keyOptions(paintItBlack, COMFORTABLE_RANGES.soprano)
    expect(options.find((o) => o.kind === 'octave')).toMatchObject({ shift: 12, fits: true })
    expect(recommended.fits).toBe(true)
  })

  it('falls back to the centred fit when nothing fits fully', () => {
    const wide = line(40, 84) // E2–C6: no voice
    const { recommended } = keyOptions(wide, COMFORTABLE_RANGES.alto)
    expect(recommended.kind).toBe('centred')
    expect(recommended.fits).toBe(false)
  })

  it('counts notes out of reach, with a semitone of grace', () => {
    expect(notesOutside(line(74, 75, 76), COMFORTABLE_RANGES.alto)).toEqual({ above: 1, below: 0, fits: false })
    expect(notesOutside(line(54), COMFORTABLE_RANGES.alto).fits).toBe(true)
  })
})

describe('optionName', () => {
  it('names a move the way a singer says it', () => {
    expect(optionName(0)).toBe('As written')
    expect(optionName(-4)).toBe('Down 4')
    expect(optionName(12)).toBe('Up an octave')
  })
})
