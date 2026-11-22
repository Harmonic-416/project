import { expect, it, vi } from 'vitest'
import { alignBackingTrack, attachBackingTrack } from '../src/tabs/guitar/song/follow/localBackingTrack.js'

function emitter() {
  const listeners = new Set()
  return {
    on(handler) { listeners.add(handler); return () => listeners.delete(handler) },
    emit(value) { for (const handler of listeners) handler(value) },
  }
}

function player() {
  let position = 0
  let range = null
  return {
    playing: false, playbackSpeed: 1, isLooping: false,
    playerPositionChanged: emitter(), playerStateChanged: emitter(), playbackRangeChanged: emitter(), playerFinished: emitter(),
    clearPlaybackRangeHighlight: vi.fn(),
    get tickPosition() { return position },
    set tickPosition(tick) {
      position = tick
      this.playerPositionChanged.emit({ currentTick: tick, isSeek: true })
    },
    get playbackRange() { return range },
    set playbackRange(value) {
      range = value
      this.playbackRangeChanged.emit()
    },
    stop() { this.playing = false; this.playerStateChanged.emit() },
    play() { this.playing = true; this.playerStateChanged.emit(); return true },
  }
}

function media() {
  return {
    currentTime: 0, playbackRate: 1, preservesPitch: true, paused: true,
    pause() { this.paused = true },
    play() { this.paused = false; return Promise.resolve() },
  }
}

const scoreTime = (tick) => tick / 1000
const alignment = alignBackingTrack({ tick: 1000, audio: 3 }, { tick: 5000, audio: 8 }, 12, 8000, scoreTime)

it('maps intro offset and a different recorded tempo and rejects reversed or invalid anchors', () => {
  expect(alignment.audioTime(3000)).toBe(5.5)
  expect(alignment.ratio).toBe(1.25)
  expect(alignBackingTrack({ tick: 0, audio: 3 }, { tick: 1000, audio: 2 }, 12, 8000, scoreTime)).toBeNull()
  expect(alignBackingTrack({ tick: 0, audio: 1 }, { tick: 1000, audio: 13 }, 12, 8000, scoreTime)).toBeNull()
})

it('follows score seeks, loop wraps and tempo changes while retaining pitch', async () => {
  const api = player()
  const audio = media()
  const onError = vi.fn()
  const backing = attachBackingTrack(api, audio, alignment, () => api.playing, onError)
  expect(audio.paused).toBe(true)
  expect(api.playbackRange).toMatchObject({ startTick: 1000, endTick: 5000 })
  expect(audio.currentTime).toBe(3)

  api.tickPosition = 3000
  expect(audio.currentTime).toBe(5.5)
  api.tickPosition = 8000
  expect(api.tickPosition).toBe(5000)
  expect(audio.currentTime).toBe(8)

  api.playbackRange = { startTick: 2000, endTick: 4000 }
  api.isLooping = true
  api.tickPosition = 2000
  backing.play()
  expect(audio.paused).toBe(false)
  api.tickPosition = 3500
  api.playbackSpeed = 0.75
  backing.syncTempo()
  expect(audio.playbackRate).toBe(0.9375)
  expect(audio.preservesPitch).toBe(true)
  expect(audio.currentTime).toBe(6.125)

  api.playerFinished.emit()
  api.tickPosition = 2000
  expect(audio.currentTime).toBe(4.25)
  await Promise.resolve()
  expect(onError).not.toHaveBeenCalled()
  backing.dispose()
  expect(audio.paused).toBe(true)
  expect(audio.playbackRate).toBe(1)
  expect(api.playbackRange).toBeNull()
})

it('falls back when the browser cannot preserve pitch at the requested rate', () => {
  const api = player()
  const audio = media()
  delete audio.preservesPitch
  const onError = vi.fn()
  const backing = attachBackingTrack(api, audio, alignment, () => api.playing, onError)
  backing.play()
  expect(onError).toHaveBeenCalledOnce()
  expect(audio.paused).toBe(true)
  backing.dispose()
})
