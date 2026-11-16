import { expect, it } from 'vitest'
import { hasClippedSamples } from '../src/tabs/guitar/song/follow/inputQuality.js'

it('recognizes both overload rails and ignores brief peaks and a full-scale low guitar tone', () => {
  expect(hasClippedSamples([0.5, 1, 1, 1, 1, 0.6])).toBe(true)
  expect(hasClippedSamples([-1, -1, -1, -1])).toBe(true)
  expect(hasClippedSamples([1, -1, 1, -1, 1, -1])).toBe(false)
  const lowE = Float32Array.from({ length: 4096 }, (_, i) => Math.sin(i * 2 * Math.PI * 82.41 / 48000))
  expect(hasClippedSamples(lowE)).toBe(false)
})
