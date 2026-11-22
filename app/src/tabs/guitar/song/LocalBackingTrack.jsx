import { useEffect, useRef, useState } from 'react'
import { alignBackingTrack } from './follow/localBackingTrack.js'
import { ticksToSeconds } from './follow/songTimeline.js'

export default function LocalBackingTrack({ api, timeline, ready, available, active, error, shifted = false, onActivate, onDeactivate }) {
  const audioRef = useRef(null)
  const [track, setTrack] = useState(null)
  const [duration, setDuration] = useState(null)
  const [start, setStart] = useState(null)
  const [end, setEnd] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    const url = track?.url
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [track])

  useEffect(() => {
    if (!available) audioRef.current?.pause()
  }, [available])

  const reset = () => {
    audioRef.current?.pause()
    onDeactivate()
    setTrack(null)
    setDuration(null)
    setStart(null)
    setEnd(null)
    setMessage(null)
  }

  const load = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    reset()
    if (!/\.(mp3|wav)$/i.test(file.name)) {
      setMessage('Choose an MP3 or WAV file.')
      return
    }
    setTrack({ name: file.name, url: URL.createObjectURL(file) })
  }

  const scoreTime = (tick) => ticksToSeconds(timeline.tempoMap, tick)
  const capture = (setPoint) => {
    const audio = audioRef.current
    audio.pause()
    api.pause()
    setPoint({ tick: Math.min(timeline.endTick, api.tickPosition), audio: audio.currentTime })
    setMessage(null)
  }

  const activate = () => {
    if (shifted) return
    const alignment = alignBackingTrack(start, end, duration, timeline.endTick, scoreTime)
    if (!alignment) {
      setMessage('Choose an end after the start in both the tab and the recording.')
      return
    }
    audioRef.current.pause()
    setMessage(null)
    onActivate({ audio: audioRef.current, alignment })
  }

  return (
    <details className="guitar-song__settings" hidden={!available}>
      <summary>Backing track{active ? ' · on' : ''}</summary>
      <div className="guitar-song__settings-body">
        <label>Local audio <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={load} /></label>
        {track && (
          <>
            <span>{track.name}</span>
            <audio key={track.url} ref={audioRef} src={track.url} controls={!active} hidden={active} preload="auto"
              aria-label="Backing audio preview"
              onLoadedMetadata={(event) => {
                const length = event.currentTarget.duration
                if (Number.isFinite(length) && length > 0) setDuration(length)
                else setMessage('The recording’s duration is unavailable.')
              }}
              onError={() => {
                onDeactivate()
                setDuration(null)
                setMessage('This file could not be decoded. Try a different MP3 or WAV.')
              }}
              onPlay={() => { if (!active) api?.pause() }} />
            {active ? (
              <>
                <span>Aligned tab · {scoreTime(start.tick).toFixed(2)}–{scoreTime(end.tick).toFixed(2)} s</span>
                <button type="button" onClick={onDeactivate}>Turn off backing track</button>
              </>
            ) : (
              <>
                <p>Seek to a point on the tab and the same moment in the audio preview. Set the start, then repeat for the end.</p>
                <button type="button" disabled={!ready || !duration} onClick={() => capture(setStart)}>Set alignment start</button>
                {start && <span>Start · Tab {scoreTime(start.tick).toFixed(2)} s · Audio {start.audio.toFixed(2)} s</span>}
                <button type="button" disabled={!ready || !duration} onClick={() => capture(setEnd)}>Set alignment end</button>
                {end && <span>End · Tab {scoreTime(end.tick).toFixed(2)} s · Audio {end.audio.toFixed(2)} s</span>}
                <button type="button" disabled={shifted || !ready || !duration || !start || !end} onClick={activate}>Use backing track</button>
              </>
            )}
            <button type="button" onClick={reset}>Remove backing track</button>
          </>
        )}
        {shifted && <p>Set transpose to As written to use a backing track.</p>}
        {(message || error) && <p role="alert">{message ?? error}</p>}
      </div>
    </details>
  )
}
