import { describe, expect, it } from 'vitest'
import { CHORDS, chordMidi } from '../src/tabs/guitar/practice/chords.js'
import { dot, fft, templateFromMidi } from '../src/tabs/guitar/practice/chordDetect.js'

const chord = (id) => CHORDS.find((c) => c.id === id)

describe('fft', () => {
  it('puts a pure tone in its bin', () => {
    const n = 1024
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 37 * i) / n))
    const im = new Float64Array(n)
    fft(re, im)
    expect(Math.hypot(re[37], im[37])).toBeCloseTo(n / 2, 6)
    expect(Math.hypot(re[36], im[36])).toBeLessThan(1e-6)
  })

  it('rejects sizes that are not a power of two', () => {
    expect(() => fft(new Float64Array(1000), new Float64Array(1000))).toThrow()
  })
})

describe('chord templates', () => {
  const template = (id) => templateFromMidi(chordMidi(chord(id)))
  const topBins = (chroma, count) =>
    [...chroma.keys()]
      .sort((a, b) => chroma[b] - chroma[a])
      .slice(0, count)
      .sort((a, b) => a - b)

  it('weighs a chord’s own notes most: E, G and B for E minor', () => {
    expect(topBins(template('Em'), 3)).toEqual([4, 7, 11])
  })

  it('is unit length, so two templates compare by their dot product', () => {
    expect(dot(template('C'), template('C'))).toBeCloseTo(1, 6)
    expect(dot(template('C'), template('E'))).toBeLessThan(dot(template('C'), template('Am')))
  })
})
