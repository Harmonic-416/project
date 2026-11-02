import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { createClick } from '../../../audio/metronome/click.js'

// Scheduling starts a little after the tap, so the first note isn't clipped.
const LEAD_SECONDS = 0.15
const FADE_SECONDS = 0.08
const VOLUME_DB = -8
const SUB_CLICK_VOLUME = 0.3

const midiToHz = (midi) => Tone.Frequency(midi, 'midi').toFrequency()

function newSynth() {
  return new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.35, release: 0.35 },
    volume: VOLUME_DB,
  }).toDestination()
}

/**
 * One run of scheduled sound: a monophonic synth (notes must be scheduled
 * in time order) and, if asked for, metronome clicks. Disposing it cuts
 * everything still to come.
 */
function createSession() {
  const synth = newSynth()
  let click = null
  let subClick = null
  return {
    note(midi, time, seconds) {
      synth.triggerAttackRelease(midiToHz(midi), seconds, time)
    },
    /** level: 'down' | 'beat' | 'sub' */
    click(time, level) {
      if (level === 'sub') {
        if (!subClick) {
          subClick = createClick()
          subClick.setVolume(SUB_CLICK_VOLUME)
        }
        subClick.trigger(time, false)
      } else {
        click ??= createClick()
        click.trigger(time, level === 'down')
      }
    },
    dispose() {
      synth.volume.rampTo(-Infinity, FADE_SECONDS)
      setTimeout(() => {
        synth.dispose()
        click?.dispose()
        subClick?.dispose()
      }, FADE_SECONDS * 2000)
    },
  }
}

let tapSynth = null

/** Play one note now (a tapped solfège box). Call from a tap. */
export async function tapNote(midi) {
  await Tone.start()
  tapSynth ??= new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.4 },
    volume: VOLUME_DB,
  }).toDestination()
  tapSynth.triggerAttackRelease(midiToHz(midi), 0.45)
}

/**
 * One thing playing at a time. `play(owner, seconds, schedule)` stops
 * whatever was playing, then calls `schedule(session, t0)` to book sounds
 * from audio time `t0`; `elapsed` (seconds since t0, negative during the
 * lead-in) updates every frame until `seconds` have passed. `owner` says
 * which part of the page started it.
 */
export function usePlayback() {
  const [state, setState] = useState(null) // { owner, elapsed } while playing
  const sessionRef = useRef(null)
  const frameRef = useRef(0)
  const mountedRef = useRef(true)

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    sessionRef.current?.dispose()
    sessionRef.current = null
    if (mountedRef.current) setState(null)
  }, [])

  const play = useCallback(
    async (owner, seconds, schedule) => {
      stop()
      await Tone.start() // browsers only start audio after a tap
      if (!mountedRef.current) return
      const session = createSession()
      sessionRef.current = session
      const t0 = Tone.now() + LEAD_SECONDS
      schedule(session, t0)
      const tick = () => {
        if (sessionRef.current !== session) return
        const elapsed = Tone.now() - t0
        if (elapsed >= seconds) {
          stop()
          return
        }
        setState({ owner, elapsed })
        frameRef.current = requestAnimationFrame(tick)
      }
      tick()
    },
    [stop],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stop()
    }
  }, [stop])

  return { owner: state?.owner ?? null, elapsed: state?.elapsed ?? null, play, stop }
}
