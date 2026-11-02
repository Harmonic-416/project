// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Midi } from '@tonejs/midi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import HarmonyTest from '../src/tabs/vocal/warmup/HarmonyTest.jsx'
import { splitHarmony } from '../src/tabs/vocal/warmup/pitchTestLogic.js'
import { voicePart } from '../src/tabs/vocal/warmup/warmupLogic.js'

// The harmony test against a fake clock and a fake microphone that "sings"
// whatever `singing(t)` returns, t in seconds from bar 1.

const played = vi.hoisted(() => [])
const mic = vi.hoisted(() => ({
  getTime: null,
  onSample: null,
  // stable, like the real hook's
  controls: { status: 'listening', error: null, current: null, start: async () => true, stop: async () => null },
}))
vi.mock('tone', () => {
  class PolySynth {
    volume = { value: 0, rampTo() {} }
    toDestination() {
      return this
    }
    triggerAttackRelease(frequency, duration, time) {
      played.push({ midi: frequency, time })
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
vi.mock('../src/tabs/vocal/audio/useMicPitch.js', () => ({
  useMicPitch: ({ getTime, onSample }) => {
    mic.getTime = getTime
    mic.onSample = onSample
    return mic.controls
  },
}))

const harmony = splitHarmony(new Midi(readFileSync(resolve(__dirname, '../public/pitch-tests/harmony.mid'))))
const tenor = voicePart('tenor')
const shift = 57 - 64

beforeEach(() => {
  vi.useFakeTimers({ now: 0 })
  played.length = 0
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Runs the whole test, singing `singing(t)` every 20 ms; returns the move cue seen every 50 ms as [t, text]. */
async function runTest(singing) {
  render(<HarmonyTest harmony={harmony} part={tenor} onExit={() => {}} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await vi.advanceTimersByTimeAsync(0)
  })
  const cues = []
  for (let ms = 0; ms < 20000; ms += 10) {
    const t = mic.getTime()
    if (t !== null && t >= 0) {
      const midi = singing(t)
      if (midi !== null && ms % 20 === 0) mic.onSample({ time: t, midi })
      if (ms % 50 === 0) {
        const move = document.querySelector('.pitch-test__move--on')
        cues.push([t, move ? move.textContent : null])
      }
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
  }
  return cues
}

const rightNote = (t) => {
  const m = harmony.measures.find((x) => t < x.end) ?? harmony.measures.at(-1)
  return m.target + shift
}

describe('Harmony test', () => {
  it('plays the outer notes moved to the part, never the middle one', async () => {
    await runTest(() => null)
    // count-in reference note, then the 18 backing notes
    expect(played[0].midi).toBe(57)
    const backing = played.slice(1)
    expect(backing).toHaveLength(18)
    expect(backing.filter((n) => n.time === backing[0].time).map((n) => n.midi).sort()).toEqual([53, 60])
  })

  it('shows the direction only on beat 4 of each bar', async () => {
    const cues = await runTest(rightNote)
    const { beat, measures } = harmony
    for (const [t, text] of cues) {
      const m = measures.find((x) => t < x.end - 0.06)
      if (!m || Math.abs(t - m.start - 3 * beat) < 0.06 || Math.abs(t - m.start) < 0.06) continue
      const inBeat4 = t >= m.start + 3 * beat
      if (!m.cueAt || !inBeat4) expect(text).toBe(null)
      else expect(text).toMatch(m.move > 0 ? /↑.*Half step up/ : /↓.*Half step down/)
    }
    expect(cues.some(([, text]) => text?.includes('up'))).toBe(true)
    expect(cues.some(([, text]) => text?.includes('down'))).toBe(true)
  })

  it('passes when every chord is sung in tune', async () => {
    await runTest(rightNote)
    expect(screen.getByText('Passed')).toBeTruthy()
  })

  it('fails when one chord is missed', async () => {
    const m = harmony.measures[3]
    await runTest((t) => (t >= m.start && t < m.end ? rightNote(0) : rightNote(t)))
    expect(screen.getByText('Not yet')).toBeTruthy()
    expect(screen.getByText(/In tune on 4 of 5 chords/)).toBeTruthy()
  })
})
