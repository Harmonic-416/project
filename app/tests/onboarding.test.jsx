// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import OnboardingProvider from '../src/ui/onboarding/OnboardingProvider.jsx'
import { useOnboardingBusy, usePracticeOnboarding } from '../src/ui/onboarding/useOnboarding.js'
import TipAnchor from '../src/ui/onboarding/Tip.jsx'
import HelpControl from '../src/ui/onboarding/HelpControl.jsx'
import WaitModePlayer from '../src/tabs/vocal/components/WaitModePlayer.jsx'
import Welcome from '../src/ui/onboarding/Welcome.jsx'
import { markSeen, readOnboarding } from '../src/ui/onboarding/onboardingStore.js'

const vocalMic = vi.hoisted(() => ({ status: 'idle', start: vi.fn(async () => true) }))
vi.mock('../src/tabs/vocal/audio/useMicPitch.js', () => ({ useMicPitch: () => vocalMic }))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 16, top: 16, right: 216, bottom: 64, width: 200, height: 48,
  })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function Practice({ busy = false, other = false, start }) {
  useOnboardingBusy(busy)
  const { markActive, startWithMicrophone } = usePracticeOnboarding()
  return (
    <>
      <HelpControl />
      <TipAnchor id={other ? 'vocal.song.modes' : 'guitar.song.modes'}>
        <button onClick={markActive}>Play</button>
        <button onClick={async () => { if (await startWithMicrophone()) start() }}>Sing</button>
      </TipAnchor>
      {!other && <TipAnchor id="guitar.song.section"><button>Pick bars</button></TipAnchor>}
    </>
  )
}

it('queues tips, waits through busy runs, preserves focus and remembers dismissals', () => {
  const tree = (busy) => <OnboardingProvider><Practice busy={busy} /></OnboardingProvider>
  const { rerender, unmount } = render(tree(true))
  expect(screen.queryByRole('note')).toBeNull()
  const play = screen.getByRole('button', { name: 'Play' })
  play.focus()
  rerender(tree(false))
  expect(document.activeElement).toBe(play)
  expect(screen.getByRole('note', { name: 'Practice modes' })).toBeTruthy()
  fireEvent.click(play)
  fireEvent.keyDown(play, { key: 'Escape' })
  expect(screen.getByRole('note', { name: 'Practice section' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
  expect(screen.queryByRole('note')).toBeNull()
  unmount()
  render(tree(false))
  expect(screen.queryByRole('note')).toBeNull()
})

it('keeps the same tip controls when switching between anchored and docked layouts', () => {
  const style = document.documentElement.style
  style.setProperty('--onboarding-gap', '8px')
  try {
    render(<OnboardingProvider><Practice /><div id="onboarding-tip-dock" /></OnboardingProvider>)
    const note = screen.getByRole('note', { name: 'Practice modes' })
    const dismiss = within(note).getByRole('button', { name: 'Got it' })
    expect(note.style.position).toBe('fixed')
    dismiss.focus()
    style.setProperty('--onboarding-dock', '1')
    fireEvent(window, new Event('resize'))
    expect(note.style.position).toBe('')
    expect(document.activeElement).toBe(dismiss)
    style.setProperty('--onboarding-dock', '0')
    fireEvent(window, new Event('resize'))
    expect(note.style.position).toBe('fixed')
    expect(document.activeElement).toBe(dismiss)
  } finally {
    style.removeProperty('--onboarding-gap')
    style.removeProperty('--onboarding-dock')
  }
})

it('marks idle help without opening a tip, then replays and resets seen tips', () => {
  vi.useFakeTimers()
  markSeen('guitar.song.modes')
  markSeen('guitar.song.section')
  const tree = (other) => <OnboardingProvider><Practice other={other} /></OnboardingProvider>
  const { rerender } = render(tree(false))
  const help = screen.getByRole('button', { name: 'Practice help' })
  act(() => vi.advanceTimersByTime(29_000))
  expect(help.querySelector('.onboarding-dot')).toBeNull()
  act(() => vi.advanceTimersByTime(1_000))
  expect(help.querySelector('.onboarding-dot')).toBeTruthy()
  expect(screen.queryByRole('note')).toBeNull()
  fireEvent.click(help)
  expect(help.querySelector('.onboarding-dot')).toBeNull()
  expect(screen.getByRole('note', { name: 'Practice modes' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reset tips' }))
  expect(screen.queryByRole('note')).toBeNull()
  expect(readOnboarding().seen).toEqual([])
  rerender(tree(true))
  rerender(tree(false))
  expect(screen.getByRole('note', { name: 'Practice modes' })).toBeTruthy()
  act(() => vi.advanceTimersByTime(30_000))
  expect(help.querySelector('.onboarding-dot')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(help.querySelector('.onboarding-dot')).toBeNull()
})

it.each(['granted', 'prompt', 'denied', undefined])('primes microphone from permission %s', async (state) => {
  const getUserMedia = vi.fn()
  vi.stubGlobal('navigator', {
    ...navigator,
    permissions: state ? { query: vi.fn().mockResolvedValue({ state }) } : undefined,
    mediaDevices: { getUserMedia },
  })
  const start = vi.fn()
  render(<OnboardingProvider><Practice start={start} /></OnboardingProvider>)
  const sing = screen.getByRole('button', { name: 'Sing' })
  await act(async () => fireEvent.click(sing))
  expect(getUserMedia).not.toHaveBeenCalled()
  if (state === 'granted') {
    expect(start).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Allow microphone' })).toBeNull()
    return
  }
  const card = screen.getByRole('region', { name: state === 'denied' ? 'Microphone blocked' : 'Use your microphone?' })
  expect(start).not.toHaveBeenCalled()
  if (state === 'denied') {
    expect(within(card).queryByRole('button', { name: 'Allow microphone' })).toBeNull()
    expect(within(card).getByText(/address bar/)).toBeTruthy()
  }
  await act(async () => fireEvent.click(within(card).getByRole('button', { name: 'Not now' })))
  expect(start).not.toHaveBeenCalled()
  if (state !== 'denied') {
    await act(async () => fireEvent.click(sing))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Allow microphone' })))
    expect(start).toHaveBeenCalledOnce()
    await act(async () => fireEvent.click(sing))
    expect(start).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('region', { name: 'Use your microphone?' })).toBeNull()
  }
  expect(getUserMedia).not.toHaveBeenCalled()
})

it('uses the same primer before Vocal Wait for me and hides guidance while listening', async () => {
  vi.stubGlobal('navigator', { ...navigator, permissions: { query: async () => ({ state: 'prompt' }) } })
  const melody = [{ midi: 60, time: 0, end: 1 }]
  const viewer = { current: null }
  const tree = () => (
    <OnboardingProvider>
      <TipAnchor id="vocal.song.modes">
        <WaitModePlayer melody={melody} duration={1} sheetMusicRef={viewer} runsKey="vocal-primer-test" />
      </TipAnchor>
    </OnboardingProvider>
  )
  const { rerender } = render(tree())
  expect(screen.getByRole('note', { name: 'Practice modes' })).toBeTruthy()
  const play = screen.getByRole('button', { name: 'Play', exact: true })
  await act(async () => fireEvent.click(play))
  expect(vocalMic.start).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Allow microphone' })))
  expect(vocalMic.start).toHaveBeenCalledOnce()
  vocalMic.status = 'listening'
  try {
    rerender(tree())
    expect(screen.queryByRole('note')).toBeNull()
  } finally {
    vocalMic.status = 'idle'
  }
})

it.each([['Guitar', 'guitar'], ['Voice', 'vocal'], ['Just look around', 'home']])(
  'routes %s and records welcome completion', (choice, destination) => {
    const navigate = vi.fn()
    render(<OnboardingProvider initialWelcome onDestination={navigate} />)
    fireEvent.click(screen.getByRole('button', { name: choice }))
    expect(navigate).toHaveBeenCalledWith(destination)
    expect(readOnboarding().welcome).toBe('done')
  },
)

it.each(['close', 'escape'])('dismisses welcome with %s', (method) => {
  const dismiss = vi.fn()
  render(<Welcome onDismiss={dismiss} />)
  if (method === 'escape') {
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Close welcome' }))
  }
  expect(dismiss).toHaveBeenCalledOnce()
})
