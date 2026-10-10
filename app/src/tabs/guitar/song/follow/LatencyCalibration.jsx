import * as alphaTab from '@coderline/alphatab'
import { useEffect, useRef, useState } from 'react'
import { seekToTick, setPlayerOptions } from './playerControls.js'
import { estimateLatency, saveLatency } from './songClock.js'
import { useGuitarListener } from './useGuitarListener.js'

const CLICKS = 8
const TIMEOUT_MS = 12000
const SETTLE_MS = 600 // let the last click's onset arrive

/**
 * Measures the round trip from alphaTab's audio to the microphone, so
 * Trouble spots can line up what you play with what you heard
 * (songClock.js). The song's tracks are muted and the metronome clicks; the
 * mic hears each click through the speaker — or, with headphones on, you
 * strum along. The median delay is saved for next time.
 */
function LatencyCalibration({ api, score, onDone, onCancel, restoreMix }) {
  const [phase, setPhase] = useState('ready') // ready | running | failed
  const clicksRef = useRef([])
  const onsetsRef = useRef([])
  const cleanupRef = useRef(null)
  const listener = useGuitarListener({ onWindow: (w) => onsetsRef.current.push(w.wall) })

  useEffect(() => () => cleanupRef.current?.(), [])

  const start = async () => {
    clicksRef.current = []
    onsetsRef.current = []
    if (!(await listener.start())) return
    const saved = {
      metronome: api.metronomeVolume,
      countIn: api.countInVolume,
      filter: api.midiEventsPlayedFilter,
      range: api.playbackRange,
      looping: api.isLooping,
      speed: api.playbackSpeed,
    }
    api.stop()
    api.changeTrackMute(score.tracks, true)
    setPlayerOptions(api, {
      metronomeVolume: 1,
      countInVolume: 0,
      playbackSpeed: 1,
      playbackRange: null,
      isLooping: false,
      midiEventsPlayedFilter: [alphaTab.midi.MidiEventType.AlphaTabMetronome],
    })

    let finished = false
    const finish = async () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      offClicks()
      api.stop()
      setPlayerOptions(api, {
        metronomeVolume: saved.metronome,
        countInVolume: saved.countIn,
        midiEventsPlayedFilter: saved.filter,
        playbackSpeed: saved.speed,
        playbackRange: saved.range,
        isLooping: saved.looping,
      })
      restoreMix()
      cleanupRef.current = null
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
      await listener.stop()
      const ms = estimateLatency(clicksRef.current, onsetsRef.current)
      if (ms === null) {
        setPhase('failed')
        return
      }
      saveLatency(ms)
      onDone(ms)
    }

    const offClicks = api.midiEventsPlayed.on((e) => {
      for (const event of e.events) {
        if (event.type === alphaTab.midi.MidiEventType.AlphaTabMetronome) clicksRef.current.push(performance.now())
      }
      if (clicksRef.current.length >= CLICKS) finish()
    })
    const timer = setTimeout(finish, TIMEOUT_MS)
    cleanupRef.current = finish
    setPhase('running')
    seekToTick(api, 0)
    api.play()
  }

  return (
    <div className="latency-calibration">
      <p>
        <strong>Line up the mic with the music.</strong> Turn the volume up and press Start: the app plays {CLICKS}{' '}
        clicks. Without headphones, stay quiet so the mic hears them; with headphones, strum along with each click.
      </p>
      {phase === 'failed' && (
        <p className="practice-status__error">Couldn’t hear the clicks. Turn the volume up, or strum along with each click.</p>
      )}
      <div className="latency-calibration__actions">
        <button type="button" className="song-extras__button" onClick={start} disabled={phase === 'running'}>
          {phase === 'running' ? 'Listening…' : phase === 'failed' ? 'Try again' : 'Start'}
        </button>
        <button type="button" className="song-extras__link" onClick={onCancel} disabled={phase === 'running'}>
          Cancel
        </button>
      </div>
      {listener.status === 'error' && <p className="practice-status__error">{listener.error}</p>}
    </div>
  )
}

export default LatencyCalibration
