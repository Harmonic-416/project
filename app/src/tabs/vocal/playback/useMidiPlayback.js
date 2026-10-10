import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { countIn } from '../../../audio/metronome/beats.js'
import { createClick } from '../../../audio/metronome/click.js'
import { getScoreSeconds, scoreTicks, setScoreSeconds, setTempoRate } from './scoreClock.js'

const NO_BEATS = []
const METRONOME_OFF = { on: false, volume: 0, countIn: false }
// Headroom between the Play tap and the first count-in click.
const COUNT_IN_LEAD_SECONDS = 0.1

/**
 * Drives Tone.Transport playback of a converted MIDI piece and keeps an
 * OSMD cursor (via `sheetMusicRef.current.{next,reset,show}`) stepping in
 * lockstep. `playbackSchedule` and `cursorTimestamps` must come from the
 * same midiToMusicXml() call so the two clocks can't drift apart.
 *
 * `minDuration` keeps playback running to the end of the score when the
 * schedule leaves the last notes out (practising with the other parts only).
 *
 * Metronome (F40): `beats` (from the score model) are clicked on the same
 * Transport while `metronome.on`, and with `metronome.countIn` every Play
 * first counts in one bar on the audio clock, then starts the Transport —
 * state is 'counting' until then, so nothing reads the count-in as score time.
 *
 * Tempo (F37): `rate` (0.5–1) scales the Transport's bpm, so notes, cursor
 * and clicks slow down together while every time in and out of this hook
 * (position, duration, seek) stays in score seconds (see scoreClock.js).
 */
export function useMidiPlayback({
  playbackSchedule,
  cursorTimestamps,
  sheetMusicRef,
  minDuration = 0,
  beats = NO_BEATS,
  metronome = METRONOME_OFF,
  rate = 1,
}) {
  const [state, setState] = useState('idle') // idle | counting | playing | paused | stopped
  const [position, setPosition] = useState(0)
  const [beat, setBeat] = useState(null) // { n, downbeat } for the metronome light
  const partRef = useRef(null)
  const synthRef = useRef(null)
  const clickRef = useRef(null)
  const scheduledIdsRef = useRef([])
  const metronomeRef = useRef(metronome)
  const rateRef = useRef(rate)
  const countInRef = useRef(null) // { timer, token } while counting in
  const countInTokenRef = useRef(0)

  const duration = Math.max(minDuration, ...playbackSchedule.map((n) => n.time + n.duration))

  const flash = useCallback((downbeat) => setBeat((b) => ({ n: (b?.n ?? 0) + 1, downbeat })), [])

  useEffect(() => {
    metronomeRef.current = metronome
    clickRef.current?.setVolume(metronome.volume)
  }, [metronome])

  // Applies live, mid-song too: the Transport keeps its tick position across bpm changes.
  useEffect(() => {
    rateRef.current = rate
    setTempoRate(rate)
  }, [rate])

  useEffect(() => () => setTempoRate(1), [])

  /** Abandon a count-in in progress, leaving the Transport where it was. True if there was one. */
  const cancelCountIn = useCallback(() => {
    if (!countInRef.current) return false
    clearTimeout(countInRef.current.timer)
    countInRef.current = null
    countInTokenRef.current += 1
    clickRef.current?.silence()
    const at = getScoreSeconds()
    Tone.Transport.stop() // also cancels the Transport's pending start
    setScoreSeconds(at)
    return true
  }, [])

  // (Re)build the Tone.Part + cursor-advance schedule whenever a new piece loads.
  // Times go in as ticks (scoreTicks), so a rebuild at a slowed tempo still
  // lands every event at its score time.
  useEffect(() => {
    Tone.Transport.stop()
    setScoreSeconds(0)
    setState('idle')
    setPosition(0)
    setBeat(null)

    if (!playbackSchedule.length) return undefined

    const synth = new Tone.PolySynth(Tone.Synth).toDestination()
    // Release tails of consecutive notes sum; -6 dB keeps the mix under 0 dBFS.
    synth.volume.value = -6
    synthRef.current = synth

    // Durations are score seconds; the synth wants wall-clock seconds at the current tempo.
    const part = new Tone.Part((time, event) => {
      synth.triggerAttackRelease(event.pitches, event.duration / rateRef.current, time)
    }, playbackSchedule.map((n) => ({ time: scoreTicks(n.time), pitches: n.pitches, duration: n.duration })))
    part.start(0)
    partRef.current = part

    const click = createClick()
    click.setVolume(metronomeRef.current.volume)
    clickRef.current = click

    // Step 0 is the cursor's resting position after reset(); every later
    // onset advances it one step. Transport callbacks fire `lookAhead`
    // (~100 ms) before the audio, so the DOM step is deferred to the exact
    // audio time via Tone's draw scheduler.
    const cursorIds = cursorTimestamps.slice(1).map((t) =>
      Tone.Transport.schedule((time) => {
        Tone.getDraw().schedule(() => sheetMusicRef.current?.next(), time)
      }, scoreTicks(t)),
    )
    // Every beat is scheduled; whether it clicks is read at play time, so
    // turning the metronome on or off never rebuilds (or stops) playback.
    const beatIds = beats.map((b) =>
      Tone.Transport.schedule((time) => {
        if (!metronomeRef.current.on) return
        click.trigger(time, b.downbeat)
        Tone.getDraw().schedule(() => flash(b.downbeat), time)
      }, scoreTicks(b.time)),
    )
    scheduledIdsRef.current = [...cursorIds, ...beatIds]

    sheetMusicRef.current?.reset()

    return () => {
      if (countInRef.current) clearTimeout(countInRef.current.timer)
      countInRef.current = null
      countInTokenRef.current += 1
      part.dispose()
      synth.dispose()
      click.dispose()
      clickRef.current = null
      scheduledIdsRef.current.forEach((id) => Tone.Transport.clear(id))
      scheduledIdsRef.current = []
      Tone.Transport.stop()
      setScoreSeconds(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackSchedule, cursorTimestamps, beats])

  const play = useCallback(async () => {
    if (!playbackSchedule.length || countInRef.current) return
    await Tone.start()
    sheetMusicRef.current?.show()
    const lead = metronomeRef.current.countIn ? countIn(beats, getScoreSeconds()) : null
    if (!lead || !clickRef.current) {
      Tone.Transport.start()
      setState('playing')
      return
    }
    // One bar of clicks on the audio clock, then the Transport starts on
    // the beat after the last one; until then Transport.state isn't
    // 'started', so mic panels drop anything heard during the count-in.
    const click = clickRef.current
    const token = countInTokenRef.current + 1
    countInTokenRef.current = token
    const interval = lead.interval / rateRef.current // score seconds → wall seconds at this tempo
    const first = Tone.now() + COUNT_IN_LEAD_SECONDS
    for (let i = 0; i < lead.count; i += 1) {
      const time = first + i * interval
      click.trigger(time, i === 0)
      Tone.getDraw().schedule(() => {
        if (countInTokenRef.current === token) flash(i === 0)
      }, time)
    }
    const startAt = first + lead.count * interval
    Tone.Transport.start(startAt)
    const timer = setTimeout(() => {
      if (countInRef.current?.token !== token) return
      countInRef.current = null
      setState('playing')
    }, (startAt - Tone.now()) * 1000)
    countInRef.current = { timer, token }
    setState('counting')
  }, [playbackSchedule, sheetMusicRef, beats, flash])

  const pause = useCallback(() => {
    if (!cancelCountIn()) Tone.Transport.pause()
    setState('paused')
  }, [cancelCountIn])

  const stop = useCallback(() => {
    cancelCountIn()
    Tone.Transport.stop()
    setScoreSeconds(0)
    sheetMusicRef.current?.reset()
    setPosition(0)
    setBeat(null)
    setState('stopped')
  }, [cancelCountIn, sheetMusicRef])

  const seek = useCallback(
    (time) => {
      const clamped = Math.max(0, Math.min(time, duration))
      setScoreSeconds(clamped)
      const stepIndex = cursorTimestamps.filter((t) => t <= clamped).length - 1
      sheetMusicRef.current?.reset()
      for (let i = 0; i < stepIndex; i += 1) sheetMusicRef.current?.next()
      setPosition(clamped)
    },
    [cursorTimestamps, duration, sheetMusicRef],
  )

  // Drive the position readout (for the scrub bar) while playing.
  useEffect(() => {
    if (state !== 'playing') return undefined
    let raf
    const tick = () => {
      const t = getScoreSeconds()
      if (t >= duration) {
        stop()
        return
      }
      setPosition(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state, duration, stop])

  return { state, position, duration, rate, beat, play, pause, stop, seek }
}
