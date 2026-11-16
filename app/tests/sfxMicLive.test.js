import { describe, expect, it, vi } from 'vitest'

const played = vi.fn()
vi.mock('tone', () => {
  class Voice {
    toDestination() {
      return this
    }
    triggerAttackRelease(...args) {
      played(...args)
    }
  }
  return { start: async () => {}, now: () => 0, PolySynth: Voice, Synth: Voice }
})

describe('sound effects while the microphone listens', () => {
  it('stay silent while the mic is live, so they never land in a take', async () => {
    const { sfx, setMicLive } = await import('../src/tabs/vocal/feedback/sfx.js')
    setMicLive(true)
    await sfx.complete()
    await sfx.wrong()
    expect(played).not.toHaveBeenCalled()

    setMicLive(false)
    await sfx.complete()
    expect(played).toHaveBeenCalled()
  })
})
