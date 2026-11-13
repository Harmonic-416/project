// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useLessonCountIn } from '../src/tabs/guitar/practice/useLessonCountIn.js'
import { useChordPlayer } from '../src/tabs/guitar/practice/useChordPlayer.js'
const audio = vi.hoisted(() => ({ start: vi.fn(async () => {}), trigger: vi.fn(), dispose: vi.fn(), strum: vi.fn(), stop: vi.fn() }))
vi.mock('tone', () => ({ start: audio.start, now: () => 1 }))
vi.mock('../src/audio/metronome/click.js', () => ({ createClick: () => ({ trigger: audio.trigger, dispose: audio.dispose, setVolume: vi.fn() }) }))
vi.mock('../src/tabs/guitar/practice/chordSound.js', () => ({ createChordPlayer: () => ({ strum: audio.strum, stop: audio.stop, dispose: audio.dispose }) }))
afterEach(() => { cleanup(); vi.clearAllMocks(); audio.start.mockImplementation(async () => {}) })
it('sounds one click for each countdown number and disposes on exit', async () => {
  const hook = renderHook(({count}) => useLessonCountIn('countdown', count), { initialProps: {count: 3} })
  await act(async () => {})
  hook.rerender({count: 2}); await act(async () => {})
  hook.rerender({count: 1}); await act(async () => {})
  expect(audio.trigger.mock.calls.map((call) => call[1])).toEqual([true, false, false])
  hook.unmount(); expect(audio.dispose).toHaveBeenCalledTimes(1)
})
it('does not sound a countdown after cancellation while audio unlocks', async () => {
  let resolve; audio.start.mockImplementation(() => new Promise((done) => { resolve = done }))
  const hook = renderHook(() => useLessonCountIn('countdown', 3))
  hook.unmount(); await act(async () => resolve())
  expect(audio.trigger).not.toHaveBeenCalled()
})
it('ignores superseded chord requests and pending requests after stop', async () => {
  const pending = []; audio.start.mockImplementation(() => new Promise((done) => pending.push(done)))
  const hook = renderHook(useChordPlayer)
  const old = hook.result.current.strum({id: 'C'})
  const latest = hook.result.current.strum({id: 'G'})
  await act(async () => { pending[1](); await latest; pending[0](); await old })
  expect(audio.strum).toHaveBeenCalledExactlyOnceWith({id: 'G'})
  const cancelled = hook.result.current.strum({id: 'D'})
  hook.result.current.stop()
  await act(async () => { pending[2](); await cancelled })
  expect(audio.strum).toHaveBeenCalledTimes(1)
})
