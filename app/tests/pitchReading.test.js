import { describe, expect, it } from 'vitest'
import { classifyCents } from '../src/tabs/vocal/audio/pitchDetector.js'
import { foldOctave, METER_RANGE_CENTS, readPitch } from '../src/tabs/vocal/components/pitchReading.js'

const read = (cents) => readPitch({ sung: true, hasTarget: true, cents, verdict: classifyCents(cents) })

describe('readPitch — what the live meter says', () => {
  it('says rest when there is no note to sing, and waits for a voice otherwise', () => {
    expect(readPitch({ sung: true, hasTarget: false, cents: null, verdict: 'rest' }).state).toBe('rest')
    expect(readPitch({ sung: false, hasTarget: true, cents: null, verdict: 'rest' })).toMatchObject({
      state: 'idle',
      words: 'Sing this note',
    })
  })

  it('agrees with the detector: inside its tolerance is on pitch', () => {
    expect(read(0)).toMatchObject({ state: 'in-tune', words: 'On pitch' })
    expect(read(-49).state).toBe('in-tune')
  })

  it('tells a sharp singer to come down and a flat one to go up', () => {
    expect(read(70)).toMatchObject({ state: 'close', words: 'A bit lower', arrow: '↓' })
    expect(read(-70)).toMatchObject({ state: 'close', words: 'A bit higher', arrow: '↑' })
    expect(read(250)).toMatchObject({ state: 'wrong', words: 'Go lower' })
    expect(read(-250)).toMatchObject({ state: 'wrong', words: 'Go higher' })
  })

  it('places the ball proportionally and pins it to the lane edges', () => {
    expect(read(METER_RANGE_CENTS / 2).offset).toBeCloseTo(0.5)
    expect(read(-900).offset).toBe(-1)
    expect(read(500).offset).toBe(1)
  })

  it('reads an octave slip as the right note, drawn near the centre', () => {
    const r = read(1210)
    expect(r.state).toBe('octave')
    expect(r.offset).toBeCloseTo(10 / METER_RANGE_CENTS)
    expect(foldOctave(-1190)).toBeCloseTo(10)
  })
})
