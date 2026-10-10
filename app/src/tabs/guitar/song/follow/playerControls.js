import * as alphaTab from '@coderline/alphatab'

/**
 * alphaTab's API is an imperative player object (created and owned by
 * GuitarScore), not React state: the practice modes change it from event
 * handlers through these helpers rather than assigning to it inline.
 */

/** Set player properties: playbackSpeed, countInVolume, metronomeVolume, isLooping, playbackRange, … */
export function setPlayerOptions(api, options) {
  for (const [key, value] of Object.entries(options)) api[key] = value
}

/** Move playback (and the cursor) to `tick`. */
export function seekToTick(api, tick) {
  api.tickPosition = tick
}

/** Loop ticks [startTick, endTick) and put the cursor at the start. */
export function loopTicks(api, startTick, endTick) {
  const range = new alphaTab.synth.PlaybackRange()
  range.startTick = startTick
  range.endTick = endTick
  setPlayerOptions(api, { playbackRange: range, isLooping: true, tickPosition: startTick })
}

/** Back to playing the whole song, with any selection cleared. */
export function clearLoop(api) {
  setPlayerOptions(api, { playbackRange: null, isLooping: false })
  api.clearPlaybackRangeHighlight()
}
