import * as alphaTab from '@coderline/alphatab'
import { useEffect, useRef, useState } from 'react'
import PlaybackControls from '../../vocal/components/PlaybackControls.jsx'
import './GuitarScore.css'

// Copied into public/ by the alphaTab Vite plugin (see vite.config.js).
const FONT_DIRECTORY = `${import.meta.env.BASE_URL}font/`
const SOUND_FONT = `${import.meta.env.BASE_URL}soundfont/sonivox.sf3`

const INITIAL_PLAYER = { ready: false, loaded: 0, state: 'idle', position: 0, duration: 0 }

/**
 * alphaTab view for one guitar score: tab + standard notation together (F5),
 * alphaSynth reference playback with a moving cursor, and click on a beat to
 * seek there (F7). The score comes from loadGuitarNotation.
 */
function GuitarScore({ score }) {
  const scrollRef = useRef(null)
  const surfaceRef = useRef(null)
  const apiRef = useRef(null)
  const [player, setPlayer] = useState(INITIAL_PLAYER)
  const [error, setError] = useState(null)

  useEffect(() => {
    const api = new alphaTab.AlphaTabApi(surfaceRef.current, {
      core: { fontDirectory: FONT_DIRECTORY },
      // Staff flags decide what shows (loadGuitarNotation turns on tab + notation).
      display: { scale: 0.9 },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: SOUND_FONT,
        scrollElement: scrollRef.current,
        enableCursor: true,
        enableUserInteraction: true,
      },
    })
    apiRef.current = api
    const update = (patch) => setPlayer((current) => ({ ...current, ...patch }))
    api.soundFontLoad.on((e) => update({ loaded: e.total ? e.loaded / e.total : 0 }))
    api.playerReady.on(() => update({ ready: true, loaded: 1 }))
    api.playerStateChanged.on((e) => {
      const playing = e.state === alphaTab.synth.PlayerState.Playing
      update({ state: playing ? 'playing' : e.stopped ? 'stopped' : 'paused' })
    })
    api.playerPositionChanged.on((e) => update({ position: e.currentTime / 1000, duration: e.endTime / 1000 }))
    api.error.on((e) => setError(e.message || String(e)))
    return () => {
      api.destroy()
      apiRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!score || !apiRef.current) return
    setError(null)
    setPlayer((current) => ({ ...current, state: 'idle', position: 0 }))
    apiRef.current.renderScore(score, [0])
  }, [score])

  const soundLabel = player.ready ? null : `Loading guitar sound… ${Math.round(player.loaded * 100)}%`

  return (
    <div className="guitar-score">
      <div className="guitar-score__scroll" ref={scrollRef}>
        <div className="guitar-score__surface" ref={surfaceRef} />
      </div>
      {error && <p className="guitar-score__error">{error}</p>}
      <PlaybackControls
        state={player.state}
        position={player.position}
        duration={player.duration}
        onPlay={() => apiRef.current?.play()}
        onPause={() => apiRef.current?.pause()}
        onStop={() => apiRef.current?.stop()}
        onSeek={(seconds) => {
          if (apiRef.current) apiRef.current.timePosition = seconds * 1000
        }}
        disabled={!player.ready}
      />
      {soundLabel && <p className="guitar-score__status">{soundLabel}</p>}
    </div>
  )
}

export default GuitarScore
