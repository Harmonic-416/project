import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'

/**
 * Drives Tone.Transport playback of a converted MIDI piece and keeps an
 * OSMD cursor (via `sheetMusicRef.current.{next,reset,show}`) stepping in
 * lockstep. `playbackSchedule` and `cursorTimestamps` must come from the
 * same midiToMusicXml() call so the two clocks can't drift apart.
 */
export function useMidiPlayback({ playbackSchedule, cursorTimestamps, sheetMusicRef }) {
  const [state, setState] = useState('idle') // idle | playing | paused | stopped
  const [position, setPosition] = useState(0)
  const partRef = useRef(null)
  const synthRef = useRef(null)
  const scheduledIdsRef = useRef([])

  const duration = playbackSchedule.length
    ? Math.max(...playbackSchedule.map((n) => n.time + n.duration))
    : 0

  // (Re)build the Tone.Part + cursor-advance schedule whenever a new piece loads.
  useEffect(() => {
    Tone.Transport.stop()
    Tone.Transport.seconds = 0
    setState('idle')
    setPosition(0)

    if (!playbackSchedule.length) return undefined

    const synth = new Tone.PolySynth(Tone.Synth).toDestination()
    synthRef.current = synth

    const part = new Tone.Part((time, event) => {
      synth.triggerAttackRelease(event.pitches, event.duration, time)
    }, playbackSchedule.map((n) => ({ time: n.time, pitches: n.pitches, duration: n.duration })))
    part.start(0)
    partRef.current = part

    // Step 0 is the cursor's resting position after reset(); every later
    // onset advances it one step.
    scheduledIdsRef.current = cursorTimestamps
      .slice(1)
      .map((t) => Tone.Transport.schedule(() => sheetMusicRef.current?.next(), t))

    sheetMusicRef.current?.reset()

    return () => {
      part.dispose()
      synth.dispose()
      scheduledIdsRef.current.forEach((id) => Tone.Transport.clear(id))
      scheduledIdsRef.current = []
      Tone.Transport.stop()
      Tone.Transport.seconds = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackSchedule, cursorTimestamps])

  const play = useCallback(async () => {
    if (!playbackSchedule.length) return
    await Tone.start()
    sheetMusicRef.current?.show()
    Tone.Transport.start()
    setState('playing')
  }, [playbackSchedule, sheetMusicRef])

  const pause = useCallback(() => {
    Tone.Transport.pause()
    setState('paused')
  }, [])

  const stop = useCallback(() => {
    Tone.Transport.stop()
    Tone.Transport.seconds = 0
    sheetMusicRef.current?.reset()
    setPosition(0)
    setState('stopped')
  }, [sheetMusicRef])

  const seek = useCallback(
    (time) => {
      const clamped = Math.max(0, Math.min(time, duration))
      Tone.Transport.seconds = clamped
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
      const t = Tone.Transport.seconds
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

  return { state, position, duration, play, pause, stop, seek }
}
