import { expect, it } from 'vitest'
import { captureWallTime } from '../src/audio/capture/captureClock.js'

it.each([44100, 48000])('keeps queued capture events at their original time at %i Hz', (rate) => {
  const frame = 2 * rate
  expect(captureWallTime(frame, rate, 2.02, 1020)).toBeCloseTo(1000)
  expect(captureWallTime(frame, rate, 2.19, 1190)).toBeCloseTo(1000)
  expect(captureWallTime(frame + rate / 100, rate, 2.19, 1190)).toBeCloseTo(1010)
})
