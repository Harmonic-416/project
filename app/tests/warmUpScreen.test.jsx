// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import WarmUp from '../src/tabs/vocal/warmup/WarmUp.jsx'

// The Warm up screen against a fake clock: when the Sing / Listen cue shows,
// next to when each note sounds. Tone's clock is the fake timers' clock.

const played = vi.hoisted(() => [])
vi.mock('tone', () => {
  class PolySynth {
    volume = { value: 0, rampTo() {} }
    toDestination() {
      return this
    }
    triggerAttackRelease(frequency, duration, time) {
      played.push({ frequency, time })
    }
    dispose() {}
  }
  return {
    start: async () => {},
    now: () => Date.now() / 1000,
    PolySynth,
    Synth: class {},
    Frequency: (midi) => ({ toFrequency: () => midi }),
  }
})

const bytes = readFileSync(resolve(__dirname, '../public/warmup/warmup.mid'))

beforeEach(() => {
  vi.useFakeTimers({ now: 0 })
  played.length = 0
  localStorage.clear()
  vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(bytes) }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** The cue on screen every 50 ms through the first `seconds` of the upper warm-up, as [start, end, cue] runs. */
async function cueRuns(seconds) {
  render(<WarmUp />)
  fireEvent.click(screen.getByRole('radio', { name: 'Tenor' }))
  const upper = screen.getByRole('button', { name: /Warm up upper range/ })
  for (let i = 0; upper.disabled && i < 50; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Warm up upper range/ }))
    await vi.advanceTimersByTimeAsync(0)
  })
  const runs = []
  for (let ms = 0; ms <= seconds * 1000; ms += 50) {
    const cue = document.querySelector('.warm-up__cue').textContent
    if (runs.at(-1)?.[2] === cue) runs.at(-1)[1] = ms / 1000
    else runs.push([ms / 1000, ms / 1000, cue])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
  }
  return runs
}

describe('Warm up cues', () => {
  it('says Listen for the last two notes of each round (three beats)', async () => {
    const runs = await cueRuns(8)
    // Rounds start 0.15 s in and last 4 s (8 beats at ♩ = 120); the last two notes are beats 6–8.
    const firstNote = played[0].time
    const cueNotes = played.filter((n) => n.time < firstNote + 4).slice(-2)
    expect(cueNotes[0].time - firstNote).toBeCloseTo(2.5)
    const listen = runs.find((r) => r[2] === 'Listen')
    expect(listen[0]).toBeCloseTo(firstNote + 2.5, 1)
    expect(listen[1] - listen[0]).toBeGreaterThan(1.4)
  })
})
