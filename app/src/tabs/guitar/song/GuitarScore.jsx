import * as alphaTab from '@coderline/alphatab'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import MetronomeControl from '../../../audio/metronome/MetronomeControl.jsx'
import { useMetronomeSettings } from '../../../audio/metronome/useMetronomeSettings.js'
import TempoControl from '../../../audio/tempo/TempoControl.jsx'
import { useSongTempo } from '../../../audio/tempo/useSongTempo.js'
import './GuitarScore.css'

// Copied into public/ by the alphaTab Vite plugin (see vite.config.js).
const FONT_DIRECTORY = `${import.meta.env.BASE_URL}font/`
const SOUND_FONT = `${import.meta.env.BASE_URL}soundfont/sonivox.sf3`

/**
 * alphaTab view for one guitar score: tab + standard notation together (F5),
 * alphaSynth reference playback with a moving cursor, and click on a beat to
 * seek there (F7). The score comes from loadGuitarNotation; `trackIndexes`
 * picks the tracks drawn, the practised one first.
 *
 * The AlphaTabApi is handed to the parent through `onApi` (null when it
 * goes away) — the practice modes drive playback and read its tick cache,
 * player events and note bounds (core.includeNoteBounds, for the marks drawn
 * by follow/useTabOverlay.js). The ref exposes getApi() and getHost(), the
 * element alphaTab renders into.
 *
 * Metronome (F40) is alphaSynth's own: clicks and a one-bar count-in on
 * alphaTab's clock, from the bundled soundfont's metronome sample. Its clicks
 * all sound alike, so the downbeat shows on the light only.
 *
 * Tempo (F37) is alphaSynth's playbackSpeed, which slows notes, cursor,
 * clicks and count-in together; it is remembered per song (`songKey`, the
 * file's fingerprint) and reported through `onSpeedChange`. The printed
 * tempo marks show the tempo being played. `controlsDisabled` locks both
 * (a Trouble spots run keeps the speed it started with).
 */
const GuitarScore = forwardRef(function GuitarScore({ score, songKey, trackIndexes = [0], onApi, onSpeedChange, controlsDisabled }, ref) {
  const scrollRef = useRef(null)
  const surfaceRef = useRef(null)
  const apiRef = useRef(null)
  const onApiRef = useRef(onApi)
  const onSpeedChangeRef = useRef(onSpeedChange)
  const [error, setError] = useState(null)
  const [metronome, setMetronome] = useMetronomeSettings()
  const [beat, setBeat] = useState(null)
  const metronomeRef = useRef(metronome)
  const [tempo, setTempo] = useSongTempo(songKey)
  const tempoRef = useRef(tempo)
  const shownFactorRef = useRef(1) // the factor the printed tempo marks were last drawn at
  const drawnRef = useRef(false) // alphaTab has finished drawing the current score at least once

  // Printed tempo marks at the tempo being played. alphaTab paints them from
  // the score's tempo automations, which also drive its MIDI; the worker
  // renderer copies the score when render() is called, so draw with scaled
  // values and put the written ones straight back — playback (playbackSpeed)
  // and exports keep the written tempo. Only once alphaTab can draw: a render
  // it defers (fonts still loading) would pick up the written values again.
  const drawTempoMarks = useCallback(() => {
    const api = apiRef.current
    const factor = tempoRef.current / 100
    if (!api?.score || !drawnRef.current) return
    if (factor === 1 && shownFactorRef.current === 1) return
    shownFactorRef.current = factor
    const automations = api.score.masterBars.flatMap((bar) => bar.tempoAutomations ?? [])
    const written = automations.map((a) => a.value)
    automations.forEach((a) => {
      a.value = Math.round(a.value * factor)
    })
    api.render()
    automations.forEach((a, i) => {
      a.value = written[i]
    })
  }, []) // reads only refs, so one function serves every render

  useEffect(() => {
    onApiRef.current = onApi
    onSpeedChangeRef.current = onSpeedChange
  }, [onApi, onSpeedChange])

  useEffect(() => {
    const api = new alphaTab.AlphaTabApi(surfaceRef.current, {
      core: { fontDirectory: FONT_DIRECTORY, includeNoteBounds: true },
      // Staff flags decide what shows (loadGuitarNotation turns on tab + notation).
      display: { scale: 0.9 },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: SOUND_FONT,
        scrollElement: scrollRef.current,
        enableCursor: true,
        enableUserInteraction: true,
        enableElementHighlighting: true,
      },
    })
    apiRef.current = api
    // Metronome ticks drive the beat light; metronomeNumerator 0 is the downbeat.
    // alphaTab emits them whether or not they click, so the light follows `on`.
    api.midiEventsPlayedFilter = [alphaTab.midi.MidiEventType.AlphaTabMetronome]
    const offs = [
      api.error.on((e) => setError(e.message || String(e))),
      api.playerStateChanged.on((e) => {
        if (e.stopped) setBeat(null)
      }),
      api.midiEventsPlayed.on((e) => {
        if (!metronomeRef.current.on) return
        const tick = e.events.find((m) => m.isMetronome) // newest first
        if (tick) setBeat((b) => ({ n: (b?.n ?? 0) + 1, downbeat: tick.metronomeNumerator === 0 }))
      }),
      // The first finished drawing of a score: now the tempo marks can be redrawn.
      api.renderFinished.on(() => {
        if (drawnRef.current) return
        drawnRef.current = true
        drawTempoMarks()
      }),
    ]
    onApiRef.current?.(api)
    return () => {
      offs.forEach((off) => off())
      onApiRef.current?.(null)
      api.destroy()
      apiRef.current = null
    }
  }, [drawTempoMarks]) // stable: the API is still created once

  const trackKey = trackIndexes.join(',')
  useEffect(() => {
    if (!score || !apiRef.current) return
    setError(null)
    drawnRef.current = false
    shownFactorRef.current = 1 // a fresh drawing shows the written tempo
    apiRef.current.renderScore(score, trackKey.split(',').map(Number))
  }, [score, trackKey])

  // alphaTab keeps these until its player is ready, so they can be set any time.
  useEffect(() => {
    metronomeRef.current = metronome
    const api = apiRef.current
    if (!api) return
    api.metronomeVolume = metronome.on ? metronome.volume : 0
    api.countInVolume = metronome.countIn ? metronome.volume : 0
  }, [metronome])

  useEffect(() => {
    tempoRef.current = tempo
    drawTempoMarks()
    const speed = tempo / 100
    if (apiRef.current) apiRef.current.playbackSpeed = speed
    onSpeedChangeRef.current?.(speed)
  }, [tempo, drawTempoMarks])

  useImperativeHandle(ref, () => ({ getApi: () => apiRef.current, getHost: () => surfaceRef.current }), [])

  return (
    <div className="guitar-score">
      <div className="guitar-score__scroll" ref={scrollRef}>
        <div className="guitar-score__surface" ref={surfaceRef} />
      </div>
      {error && <p className="guitar-score__error">{error}</p>}
      <MetronomeControl settings={metronome} onChange={setMetronome} beat={beat} disabled={controlsDisabled} />
      <TempoControl pct={tempo} onChange={setTempo} bpm={score?.tempo} disabled={controlsDisabled} />
    </div>
  )
})

export default GuitarScore
