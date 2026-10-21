// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The Vocal tab's practice scores end to end, with a fake microphone (each
// pitch frame fed by the test), a controllable clock and no audio.

const mic = vi.hoisted(() => ({ onSample: null }))
const clock = vi.hoisted(() => ({ ms: 0, seconds: 0 }))

vi.mock('../src/tabs/vocal/audio/useMicPitch.js', async () => {
  const { useCallback, useState } = await import('react')
  return {
    useMicPitch: ({ onSample }) => {
      mic.onSample = onSample
      const [status, setStatus] = useState('idle')
      const start = useCallback(async () => {
        setStatus('listening')
        return true
      }, [])
      const stop = useCallback(() => setStatus('idle'), [])
      return { status, error: null, current: null, start, stop, getSamples: () => [] }
    },
  }
})
vi.mock('tone', () => {
  class Instrument {
    toDestination() {
      return this
    }
    triggerAttack() {}
    triggerAttackRelease() {}
    releaseAll() {}
    dispose() {}
  }
  return { start: async () => {}, Synth: Instrument, PolySynth: Instrument, Transport: { state: 'started' } }
})
vi.mock('../src/tabs/vocal/playback/scoreClock.js', () => ({ getScoreSeconds: () => clock.seconds }))

const { default: WaitModePlayer } = await import('../src/tabs/vocal/components/WaitModePlayer.jsx')
const { default: TroubleSpotsPlayer } = await import('../src/tabs/vocal/components/TroubleSpotsPlayer.jsx')

const note = (i, midi) => ({ index: i, step: i, midi, time: i, duration: 1, frequency: 440 * 2 ** ((midi - 69) / 12) })

function fakeViewer() {
  const marks = new Map()
  return {
    marks,
    markNote: vi.fn((index, cls, on = true) => {
      const set = marks.get(index) ?? new Set()
      if (on) set.add(cls)
      else set.delete(cls)
      marks.set(index, set)
    }),
    clearMarks: vi.fn((cls) => marks.forEach((set) => set.delete(cls))),
    show: vi.fn(),
    goToStep: vi.fn(),
    reset: vi.fn(),
  }
}

/** Sing `midi` from `fromMs` for `forMs` in 50 ms frames (wait mode's clock is performance.now). */
function singAt(midi, fromMs, forMs = 300) {
  for (let t = fromMs; t <= fromMs + forMs; t += 50) {
    clock.ms = t
    act(() => mic.onSample({ time: t / 1000, midi }))
  }
}

beforeEach(() => {
  sessionStorage.clear()
  clock.ms = 0
  clock.seconds = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock.ms)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Wait for me score', () => {
  const melody = [note(0, 60), note(1, 62)]

  it('scores how quickly each note is found, and charts each try', async () => {
    const user = userEvent.setup()
    const viewer = fakeViewer()
    render(<WaitModePlayer melody={melody} duration={2} sheetMusicRef={{ current: viewer }} runsKey="song:wait" />)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    singAt(60, 500) // found after 0.5 s: full marks
    expect(screen.getByText('last note: found in 0.5 s')).toBeTruthy()
    const secondShown = clock.ms
    singAt(62, secondShown + 3500) // found after 3.5 s: half marks

    const summary = screen.getByRole('region', { name: 'How well you know the melody' })
    expect(summary.textContent).toContain('75') // (1 + ½) / 2
    expect(summary.textContent).toMatch(/2\.0 s on average/)
    expect(summary.textContent).toMatch(/note 2 \(D4\) 3\.5 s/)
    expect(viewer.marks.get(1).has('practice-note--slow')).toBe(true)
    expect(screen.getByRole('img', { name: /Wait for me scores/ })).toBeTruthy()
    expect(screen.getByLabelText('Try 1: 75')).toBeTruthy()

    // Again, quicker: the chart grows and shows the improvement.
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(viewer.marks.get(1).has('practice-note--slow')).toBe(false)
    singAt(60, clock.ms + 400)
    singAt(62, clock.ms + 400)
    expect(screen.getByLabelText('Try 2: 100')).toBeTruthy()
    expect(screen.getByText(/▲ 25 since your first try/)).toBeTruthy()
    expect(JSON.parse(sessionStorage.getItem('song:wait')).map((r) => r.score)).toEqual([75, 100])
  })

  it('doesn’t count time while paused', async () => {
    const user = userEvent.setup()
    render(<WaitModePlayer melody={melody} duration={2} sheetMusicRef={{ current: fakeViewer() }} runsKey="k" />)
    await user.click(screen.getByRole('button', { name: 'Play' }))
    clock.ms = 600
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    clock.ms = 60_000 // a minute away
    await user.click(screen.getByRole('button', { name: 'Play' }))
    singAt(60, 60_200)
    expect(screen.getByText('last note: found in 0.8 s')).toBeTruthy()
  })

  it('needs the note in tune, not just close', async () => {
    const user = userEvent.setup()
    render(<WaitModePlayer melody={melody} duration={2} sheetMusicRef={{ current: fakeViewer() }} runsKey="k3" />)
    await user.click(screen.getByRole('button', { name: 'Play' }))
    singAt(60.45, 200, 600) // 45 cents sharp, held: not accepted
    expect(screen.getByText(/Note 1 of 2/)).toBeTruthy()
    singAt(60.2, 1000) // 20 cents sharp: accepted
    expect(screen.getByText(/Note 2 of 2/)).toBeTruthy()
  })

  it('shows a run started partway, without charting it', async () => {
    const user = userEvent.setup()
    render(<WaitModePlayer melody={melody} duration={2} sheetMusicRef={{ current: fakeViewer() }} runsKey="k2" />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } })
    await user.click(screen.getByRole('button', { name: 'Play' }))
    singAt(62, 300)
    expect(screen.getByText(/Started partway/)).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Wait for me scores/ })).toBeNull()
    expect(sessionStorage.getItem('k2')).toBeNull()
  })
})

describe('Trouble spots score', () => {
  const melody = [note(0, 60), note(1, 62), note(2, 64), note(3, 69)]

  /** Samples on the playback clock (seconds), every 20 ms. */
  function singIn(midi, from, to) {
    for (let t = from; t < to; t += 0.02) act(() => mic.onSample({ time: t, midi }))
  }

  it('counts right notes, half-credits ones a half step off, misses the rest, and sums up at the end', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0))
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
    const user = userEvent.setup()
    const viewer = fakeViewer()
    const playback = { state: 'stopped', position: 0, duration: 4, rate: 1, play: vi.fn(), pause: vi.fn(), stop: vi.fn(), seek: vi.fn() }
    const ui = (state) => (
      <TroubleSpotsPlayer
        melody={melody}
        playback={{ ...playback, state }}
        sheetMusicRef={{ current: viewer }}
        runsKey="song:trouble"
      />
    )
    const { rerender } = render(ui('stopped'))

    await user.click(screen.getByRole('button', { name: 'Play' }))
    rerender(ui('playing'))
    singIn(60, 0.1, 0.9) // right
    singIn(63, 1.1, 1.9) // a half step sharp: ½
    singIn(67, 2.1, 2.9) // a minor third sharp: a miss
    singIn(69, 3.0, 3.9) // right, on time
    clock.seconds = 3.5 // playback has passed notes 1–3
    await waitFor(() => expect(screen.getByText('1 missed')).toBeTruthy())
    expect(screen.getByText('1 right')).toBeTruthy()
    expect(screen.getByText('1 a half step off (½)')).toBeTruthy()
    expect(viewer.marks.get(1).has('practice-note--close')).toBe(true)
    expect(viewer.marks.get(2).has('practice-note--missed')).toBe(true)

    clock.seconds = 4
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)))
    rerender(ui('stopped')) // the song ended

    const summary = screen.getByRole('region', { name: 'Singing in time' })
    expect(summary.textContent).toContain('63') // (2 + ½) / 4 = 62.5
    expect(summary.textContent).toContain('2 of 4 notes on pitch')
    expect(screen.getByLabelText('Try 1: 63')).toBeTruthy()
    expect(JSON.parse(sessionStorage.getItem('song:trouble')).map((r) => r.score)).toEqual([63])
  })
})
