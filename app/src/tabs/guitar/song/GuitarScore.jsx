import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import { createPortal } from 'react-dom'
import { createBarScrollHandler } from './follow/barScroll.js'
import * as alphaTab from '@coderline/alphatab'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import MetronomeControl from '../../../audio/metronome/MetronomeControl.jsx'
import { useMetronomeSettings } from '../../../audio/metronome/useMetronomeSettings.js'
import TempoControl from '../../../audio/tempo/TempoControl.jsx'
import { useGuitarTempo } from './useGuitarTempo.js'
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
const GuitarScore = forwardRef(function GuitarScore({ score, songKey, trackIndexes = [0], onApi, onSpeedChange, controlsDisabled, userId, catalogSongId, client, settingsHost, hideControls = false }, ref) {
  const followEnabledRef = useRef(false)
  const scrollRef = useRef(null)
  const surfaceRef = useRef(null)
  const apiRef = useRef(null)
  const onApiRef = useRef(onApi)
  const onSpeedChangeRef = useRef(onSpeedChange)
  const [error, setError] = useState(null)
  const [metronome, setMetronome] = useMetronomeSettings()
  const [beat, setBeat] = useState(null)
  const metronomeRef = useRef(metronome)
  const { tempo, change: setTempo, message: tempoMessage, retry: retryTempo } = useGuitarTempo({ fingerprint: songKey, catalogSongId, userId, client })
  const [retry, setRetry] = useState(0)
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
      display: { scale: scrollRef.current.clientWidth < 480 ? 0.65 : 0.9, barsPerRow: scrollRef.current.clientWidth < 480 ? 1 : -1, layoutMode: alphaTab.LayoutMode.Page },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: SOUND_FONT,
        scrollElement: scrollRef.current.closest('.guitar-tab__body') ?? scrollRef.current,
        enableCursor: true,
        enableUserInteraction: true,
        enableElementHighlighting: true,
      },
    })
    apiRef.current = api
    api.customScrollHandler = createBarScrollHandler((bar) => {
      if (!followEnabledRef.current) return
      const host = surfaceRef.current
      const outer = host?.closest('.guitar-tab__body')
      const surface = host?.querySelector('.at-surface')
      if (!outer || !surface) return
      const region = outer.getBoundingClientRect()
      const origin = surface.getBoundingClientRect()
      const bounds = bar.realBounds
      const top = origin.top + bounds.y
      const bottom = top + bounds.h
      // Bars on the same visible staff system stay still; the next row comes
      // into view when a new bar would otherwise be below the visible page.
      if (top >= region.top + 16 && bottom <= region.bottom - 16) return
      outer.scrollTo({ top: Math.max(0, outer.scrollTop + top - region.top - 24), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
    let previousWidth = scrollRef.current.clientWidth
    const resize = new ResizeObserver(() => {
      const width = scrollRef.current?.clientWidth ?? 0
      if (!width || width === previousWidth) return
      previousWidth = width
      const narrow = width < 480
      api.settings.display.scale = narrow ? 0.65 : 0.9
      api.settings.display.barsPerRow = narrow ? 1 : -1
      api.updateSettings()
      if (api.score) api.render()
    })
    resize.observe(scrollRef.current)
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
      resize.disconnect()
      api.destroy()
      apiRef.current = null
    }
  }, [drawTempoMarks, retry]) // stable: the API is still created once

  const trackKey = trackIndexes.join(',')
  useEffect(() => {
    if (!score || !apiRef.current) return
    setError(null)
    drawnRef.current = false
    followEnabledRef.current = false
    shownFactorRef.current = 1 // a fresh drawing shows the written tempo
    apiRef.current.renderScore(score, trackKey.split(',').map(Number))
  }, [score, trackKey, retry])

  // alphaTab keeps these until its player is ready, so they can be set any time.
  useEffect(() => {
    metronomeRef.current = metronome
    const api = apiRef.current
    if (!api) return
    api.metronomeVolume = metronome.on ? metronome.volume : 0
    api.countInVolume = metronome.countIn ? metronome.volume : 0
  }, [metronome, retry])

  useEffect(() => {
    tempoRef.current = tempo
    drawTempoMarks()
    const speed = tempo / 100
    if (apiRef.current) apiRef.current.playbackSpeed = speed
    onSpeedChangeRef.current?.(speed)
  }, [tempo, drawTempoMarks, retry])

  useImperativeHandle(ref, () => ({ getApi: () => apiRef.current, getHost: () => surfaceRef.current, enableFollow: () => { followEnabledRef.current = true; apiRef.current?.scrollToCursor() } }), [])

  const settings = <>
      <details className="guitar-score__settings"><summary>Tempo {tempo}% · Metronome {metronome.on ? 'on' : 'off'} · Count-in {metronome.countIn ? 'on' : 'off'}</summary><div className="guitar-score__settings-body">
      <MetronomeControl settings={metronome} onChange={setMetronome} beat={beat} disabled={controlsDisabled} />
      <p className="guitar-score__status">{metronome.countIn ? 'One bar of clicks plays before playback starts.' : 'Playback starts without a count-in.'} {metronome.on && beat && (beat.downbeat ? 'Downbeat - beat 1' : 'Beat')}</p>
      <TempoControl pct={tempo} onChange={setTempo} bpm={score?.tempo} disabled={controlsDisabled} />
      </div></details>
      {tempoMessage && <p className="guitar-score__status" role="status">{tempoMessage} {tempoMessage.includes('Retry sync') && <button type="button" disabled={controlsDisabled} onClick={retryTempo}>Retry sync</button>}</p>}
  </>
  return (
    <div className="guitar-score">
      {!hideControls && (settingsHost ? createPortal(settings, settingsHost) : settings)}
      <div className="guitar-score__scroll" ref={scrollRef} role="region" aria-label="Guitar tablature and standard notation" tabIndex={0}>
        <div className="guitar-score__surface" ref={surfaceRef} />
      </div>
      {error && <GuitarFeedback kind="error" onRetry={() => { setError(null); drawnRef.current = false; setRetry((n) => n + 1) }} retryLabel="Retry player">The guitar player could not load. Check your connection and try again.</GuitarFeedback>}
      <p className="guitar-score__status">Click a note to seek. Drag across the score to select a passage.</p>

    </div>
  )
})

export default GuitarScore
