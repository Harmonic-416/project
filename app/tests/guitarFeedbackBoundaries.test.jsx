// @vitest-environment jsdom
import React, { createRef } from 'react'
import * as alphaTab from '@coderline/alphatab'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import GuitarTroubleMode from '../src/tabs/guitar/song/follow/GuitarTroubleMode.jsx'
import LatencyCalibration from '../src/tabs/guitar/song/follow/LatencyCalibration.jsx'
import GuitarScore from '../src/tabs/guitar/song/GuitarScore.jsx'
import { loadSongTempo, saveSongTempo } from '../src/audio/tempo/tempo.js'

const mic = vi.hoisted(() => ({
  start: vi.fn(async () => true),
  stop: vi.fn(async () => null),
  onWindow: null,
}))
const synth = vi.hoisted(() => ({ api: null }))
vi.mock('@coderline/alphatab', async (load) => ({
  ...await load(),
  AlphaTabApi: class {
    constructor() { return synth.api }
  },
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
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('grades the delayed final attack before stopping the microphone', async () => {
  vi.useFakeTimers()
  const api = {
    tickPosition: 0, playbackSpeed: 1, playerPositionChanged: event(), playerFinished: event(),
    playbackRangeChanged: event(), playerStateChanged: event(),
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

it('ramps the existing player at a repeat boundary and saves a manual override', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  saveSongTempo('trainer-test', 60)
  const scoreRef = createRef()
  const stopTrainingRef = { current: null }
  const api = {
    tickPosition: 0, playbackSpeed: 1, isLooping: true,
    playbackRange: { startTick: 0, endTick: 960 },
    playerState: alphaTab.synth.PlayerState.Playing,
    playerPositionChanged: event(), playerFinished: event(), playbackRangeChanged: event(),
    playerStateChanged: event(), error: event(), midiEventsPlayed: event(), renderFinished: event(),
    play: vi.fn(), stop: vi.fn(), renderScore: vi.fn(), destroy: vi.fn(),
  }
  synth.api = api
  const setTrainingTempo = (tempo) => scoreRef.current?.setTrainingTempo(tempo)
  const timeline = {
    startTick: 0, endTick: 960, startTime: 0, duration: 1,
    tempoMap: [{ tick: 0, bpm: 60, seconds: 0 }],
    entries: [{ index: 0, tick: 0, time: 0, duration: 0.1, technique: 'pick', kind: 'single' }],
  }
  const clock = { playing: true, secondsAt: () => 0 }
  const props = { api, timeline, clock, overlay: { mark: vi.fn(), clear: vi.fn() }, latencyMs: 0, setTrainingTempo, stopTrainingRef }
  const screenFor = (state) => <>
    <GuitarScore ref={scoreRef} songKey="trainer-test" controlsDisabled={state === 'playing'}
      onManualTempoChange={() => stopTrainingRef.current?.()} />
    <GuitarTroubleMode {...props} player={{ ready: true, state, tick: 0 }} />
  </>
  const view = render(screenFor('idle'))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Speed trainer' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play' })))
  view.rerender(screenFor('playing'))
  act(() => api.playerPositionChanged.emit({ currentTick: 0, isSeek: true }))
  for (let pass = 0; pass < 3; pass++) {
    act(() => mic.onWindow({ wall: performance.now(), verdict: 'hit' }))
    act(() => {
      vi.advanceTimersByTime(1000)
      api.playerFinished.emit()
      api.playerPositionChanged.emit({ currentTick: 0, isSeek: true })
    })
  }
  act(() => vi.advanceTimersByTime(500))
  expect(api.playbackSpeed).toBe(0.60)
  expect(screen.getByText('60% · 3 of 3 clean repeats')).toBeTruthy()
  act(() => api.playerFinished.emit())
  expect(api.playbackSpeed).toBe(0.65)
  expect(loadSongTempo('trainer-test')).toBe(60)
  fireEvent.click(screen.getByText(/^Tempo 65%/))
  const slider = screen.getByRole('slider', { name: 'Tempo' })
  expect(slider.value).toBe('65')
  fireEvent.change(slider, { target: { value: '75' } })
  expect(screen.getByRole('checkbox', { name: 'Speed trainer' }).checked).toBe(false)
  expect(api.playbackSpeed).toBe(0.75)
  expect(loadSongTempo('trainer-test')).toBe(75)
  view.unmount()
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
