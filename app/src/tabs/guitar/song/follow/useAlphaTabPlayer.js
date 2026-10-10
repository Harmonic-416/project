import * as alphaTab from '@coderline/alphatab'
import { useEffect, useRef, useState } from 'react'

const INITIAL = { ready: false, loaded: 0, state: 'idle', tick: 0 }
const UI_INTERVAL_MS = 50

const stateName = (state, stopped) =>
  state === alphaTab.synth.PlayerState.Playing ? 'playing' : stopped ? 'stopped' : 'paused'

const initialFor = (api) => ({ ...INITIAL, ready: Boolean(api?.isReadyForPlayback), loaded: api?.isReadyForPlayback ? 1 : 0 })

/**
 * React state for alphaTab's player: soundfont progress, ready, play state
 * (idle | playing | paused | stopped) and the current tick, throttled for
 * the UI (position events arrive every few milliseconds). `onPosition`
 * gets every position and state change unthrottled — { tick, playing } —
 * for the song clock (songClock.js).
 */
export function useAlphaTabPlayer(api, { onPosition } = {}) {
  // Kept with the api it describes, so a new api starts from scratch without an extra render.
  const [held, setHeld] = useState({ api: null, player: INITIAL })
  const onPositionRef = useRef(onPosition)

  useEffect(() => {
    onPositionRef.current = onPosition
  }, [onPosition])

  useEffect(() => {
    if (!api) return undefined
    let lastUi = 0
    const update = (patch) =>
      setHeld((current) => ({ api, player: { ...(current.api === api ? current.player : initialFor(api)), ...patch } }))
    const playing = () => api.playerState === alphaTab.synth.PlayerState.Playing

    const offs = [
      api.soundFontLoad.on((e) => update({ loaded: e.total ? e.loaded / e.total : 0 })),
      api.playerReady.on(() => update({ ready: true, loaded: 1 })),
      api.playerStateChanged.on((e) => {
        onPositionRef.current?.({ tick: api.tickPosition, playing: playing() })
        update({ state: stateName(e.state, e.stopped), tick: api.tickPosition })
      }),
      api.playerPositionChanged.on((e) => {
        onPositionRef.current?.({ tick: e.currentTick, playing: playing() })
        const now = performance.now()
        if (e.isSeek || now - lastUi >= UI_INTERVAL_MS) {
          lastUi = now
          update({ tick: e.currentTick })
        }
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [api])

  return held.api === api ? held.player : initialFor(api)
}
