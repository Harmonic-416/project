// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import GuitarTroubleMode from '../src/tabs/guitar/song/follow/GuitarTroubleMode.jsx'
import LatencyCalibration from '../src/tabs/guitar/song/follow/LatencyCalibration.jsx'

const mic = vi.hoisted(() => ({
  start: vi.fn(async () => true),
  stop: vi.fn(async () => null),
  onWindow: null,
}))

vi.mock('../src/tabs/guitar/song/follow/useGuitarListener.js', () => ({
  useGuitarListener: ({ onWindow }) => {
    mic.onWindow = onWindow
    return { status: 'listening', start: mic.start, stop: mic.stop, getRecordingStartWall: () => 0 }
  },
}))

vi.mock('../src/tabs/guitar/song/follow/noteJudge.js', async (load) => ({
  ...await load(),
  judgeWindow: (window) => ({ verdict: window.verdict }),
}))

function event() {
  const callbacks = new Set()
  return {
    on(callback) {
      callbacks.add(callback)
      return () => callbacks.delete(callback)
    },
    emit(payload) {
      callbacks.forEach((callback) => callback(payload))
    },
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  localStorage.clear()
})

it('grades the delayed final attack before stopping the microphone', async () => {
  vi.useFakeTimers()
  const api = {
    tickPosition: 0, playbackSpeed: 1, playerPositionChanged: event(), playerFinished: event(),
    play: vi.fn(), stop: vi.fn(),
  }
  const props = {
    api,
    timeline: {
      duration: 1,
      tempoMap: [{ tick: 0, bpm: 60, seconds: 0 }],
      entries: [{ index: 0, bar: 0, time: 0.95, duration: 0.05, technique: 'pick', kind: 'single', notes: [{ midi: 64, string: 1, fret: 0 }] }],
    },
    overlay: { clear: vi.fn(), mark: vi.fn() },
    clock: { playing: false },
    latencyMs: 0,
  }
  const view = render(<GuitarTroubleMode {...props} player={{ ready: true, state: 'idle', tick: 0 }} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play' })))
  act(() => {
    api.playerFinished.emit()
    view.rerender(<GuitarTroubleMode {...props} player={{ ready: true, state: 'stopped', tick: 0 }} />)
  })
  expect(screen.getByText('Checking the last notes…')).toBeTruthy()
  expect(mic.stop).not.toHaveBeenCalled()
  act(() => mic.onWindow({ verdict: 'hit', wall: performance.now() + 1 }))
  expect(props.overlay.mark).not.toHaveBeenCalled()
  act(() => mic.onWindow({ verdict: 'hit', wall: performance.now() - 50 }))
  await act(async () => vi.advanceTimersByTimeAsync(450))
  expect(screen.getByText('Hit 1 of 1')).toBeTruthy()
  expect(mic.stop).toHaveBeenCalledOnce()
})

it('restores the transport and keeps the previous offset when calibration is canceled', async () => {
  vi.useFakeTimers()
  localStorage.setItem('harmonic.guitar.latencyMs', '42')
  const api = {
    tickPosition: 960, playbackSpeed: 0.75, playbackRange: { startTick: 960, endTick: 1920 },
    midiEventsPlayed: event(), play: vi.fn(), stop: vi.fn(), changeTrackMute: vi.fn(),
  }
  const onDone = vi.fn()
  const restoreMix = vi.fn()
  const view = render(<LatencyCalibration api={api} score={{ tracks: [] }} onDone={onDone} onCancel={() => view.unmount()} restoreMix={restoreMix} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start' })))
  expect(api.tickPosition).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await act(async () => vi.runAllTimersAsync())
  expect(api.tickPosition).toBe(960)
  expect(api.playbackSpeed).toBe(0.75)
  expect(api.playbackRange.endTick).toBe(1920)
  expect(restoreMix).toHaveBeenCalledOnce()
  expect(onDone).not.toHaveBeenCalled()
  expect(localStorage.getItem('harmonic.guitar.latencyMs')).toBe('42')
})
