import { clearLoop, playRange, seekToTick } from './playerControls.js'

// Correct drift against the score transport. Seeks and wraps always snap.
const DRIFT_SECONDS = 0.06
const SEEK_TOLERANCE_SECONDS = 0.004

export function alignBackingTrack(start, end, duration, lastTick, scoreTime) {
  if (!start || !end || !Number.isFinite(duration) ||
      ![start.tick, end.tick, start.audio, end.audio].every(Number.isFinite) ||
      start.tick < 0 || end.tick > lastTick || end.tick <= start.tick ||
      start.audio < 0 || end.audio > duration || end.audio <= start.audio) return null
  const scoreStart = scoreTime(start.tick)
  const span = scoreTime(end.tick) - scoreStart
  if (!Number.isFinite(span) || span <= 0) return null
  const ratio = (end.audio - start.audio) / span
  return {
    startTick: start.tick,
    endTick: end.tick,
    ratio,
    audioTime(tick) {
      if (tick <= start.tick) return start.audio
      if (tick >= end.tick) return end.audio
      return start.audio + (scoreTime(tick) - scoreStart) * ratio
    },
  }
}

function setBackingRate(audio, rate) {
  if (!('preservesPitch' in audio) || !Number.isFinite(rate) || rate <= 0) return false
  try {
    audio.preservesPitch = true
    if (audio.playbackRate !== rate) audio.playbackRate = rate
    return audio.preservesPitch && Math.abs(audio.playbackRate - rate) < 0.001
  } catch {
    return false
  }
}

/** The score player drives position, tempo and loop boundaries. */
export function attachBackingTrack(api, audio, alignment, isPlaying, onError) {
  const { startTick, endTick } = alignment
  const previousRange = api.playbackRange
  const previousLoop = api.isLooping
  let starting = false
  let requestedPlay = false
  let disposed = false
  let failed = false

  const fail = (message) => {
    if (disposed || failed) return
    failed = true
    audio.pause()
    onError(message)
  }
  const startAudio = () => {
    if (disposed || failed || starting || !audio.paused) return
    starting = true
    audio.play().catch(() => fail('Backing audio could not play. Turn it off to return to score playback.'))
      .finally(() => { starting = false })
  }
  const sync = (tick, force = false, play = requestedPlay && isPlaying()) => {
    if (disposed || failed) return
    if (!setBackingRate(audio, alignment.ratio * api.playbackSpeed)) {
      fail('This browser cannot play the backing track at this tempo with pitch preserved.')
      return
    }
    const expected = alignment.audioTime(tick)
    if (Math.abs(audio.currentTime - expected) > (force ? SEEK_TOLERANCE_SECONDS : DRIFT_SECONDS)) audio.currentTime = expected
    if (play && (tick < endTick || api.isLooping)) startAudio()
    else audio.pause()
  }

  const setRange = (range, loop) => {
    const first = Math.max(startTick, range?.startTick ?? startTick)
    const last = Math.min(endTick, range?.endTick ?? endTick)
    if (first < last && range?.startTick === first && range?.endTick === last) return
    playRange(api, first < last ? first : startTick, first < last ? last : endTick, loop && first < last)
  }

  const off = [
    api.playbackRangeChanged.on(() => setRange(api.playbackRange, api.isLooping)),
    api.playerPositionChanged.on(({ currentTick, isSeek }) => {
      const target = Math.max(startTick, Math.min(endTick, currentTick))
      if (isSeek && Math.abs(currentTick - target) > 1) {
        seekToTick(api, target)
        return
      }
      if (!isSeek && target >= (api.playbackRange?.endTick ?? endTick) && api.isLooping) return
      sync(target, isSeek)
    }),
    api.playerStateChanged.on(() => {
      if (!isPlaying()) {
        requestedPlay = false
        audio.pause()
      }
    }),
    api.playerFinished.on(() => {
      if (api.isLooping) sync(api.playbackRange?.startTick ?? startTick, true)
      else audio.pause()
    }),
  ]
  api.stop()
  const keepLoop = previousLoop && previousRange?.startTick >= startTick && previousRange.endTick <= endTick
  if (!keepLoop) playRange(api, startTick, endTick)
  seekToTick(api, api.playbackRange?.startTick ?? startTick)
  sync(api.tickPosition, true, false)

  return {
    play() {
      const range = api.playbackRange
      if (api.tickPosition < range.startTick || api.tickPosition >= range.endTick) seekToTick(api, range.startTick)
      sync(api.tickPosition, true, false)
      if (!failed && api.play()) {
        requestedPlay = true
        startAudio()
      }
    },
    syncTempo() { sync(api.tickPosition, true) },
    clearSelection() { playRange(api, startTick, endTick) },
    dispose() {
      disposed = true
      off.forEach((unsubscribe) => unsubscribe())
      audio.pause()
      audio.playbackRate = 1
      api.stop()
      if (previousRange) playRange(api, previousRange.startTick, previousRange.endTick, previousLoop)
      else clearLoop(api)
    },
  }
}
