import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import './PracticeModes.css'
import PlaybackControls from './PlaybackControls.jsx'
import { useMicPitch } from '../audio/useMicPitch.js'
import { findActiveNote, midiToNoteName } from '../audio/pitchDetector.js'
import { createTroubleTracker, noteDistanceCents } from '../practice/practiceLogic.js'

const MISSED_CLASS = 'practice-note--missed'
// Stopping this close to the end counts as finishing, so the last notes still get a verdict.
const END_SLACK_SECONDS = 0.5

/** Playback clock, or null while the transport isn't running (so paused frames aren't scored). */
const getTransportSeconds = () => (Tone.Transport.state === 'started' ? Tone.Transport.seconds : null)

/**
 * "Trouble spots": normal playback that never waits. The mic runs alongside
 * and, as playback moves past each melody note, practiceLogic's tracker
 * decides whether it was sung (within a semitone, any octave); misses are
 * coloured red on the score and stay there until that passage is sung
 * again or the marks are cleared.
 */
function TroubleSpotsPlayer({ melody, playback, sheetMusicRef, disabled }) {
  const [missed, setMissed] = useState([])
  const missedRef = useRef([])
  const [run, setRun] = useState(null) // { hit, checked, finished }
  const trackerRef = useRef(null)
  const lastTimeRef = useRef(0)

  const handleSample = useCallback((sample) => trackerRef.current?.addSample(sample), [])
  const mic = useMicPitch({ getTime: getTransportSeconds, onSample: handleSample })
  const listening = mic.status === 'listening'

  const applyVerdicts = useCallback(
    ({ hit, missed: newlyMissed }) => {
      if (!hit.length && !newlyMissed.length) return
      newlyMissed.forEach((note) => sheetMusicRef.current?.markNote(note.index, MISSED_CLASS))
      if (newlyMissed.length) {
        missedRef.current = [...missedRef.current, ...newlyMissed]
        setMissed(missedRef.current)
      }
      setRun((r) => ({ ...r, hit: r.hit + hit.length, checked: r.checked + hit.length + newlyMissed.length }))
    },
    [sheetMusicRef],
  )

  /** Start judging from `from`; singing a passage again clears its old marks. */
  const startRun = useCallback(
    (from) => {
      const tracker = createTroubleTracker(melody)
      tracker.skipTo(from)
      trackerRef.current = tracker
      lastTimeRef.current = from
      const keep = []
      for (const note of missedRef.current) {
        if (note.time + note.duration < from) keep.push(note)
        else sheetMusicRef.current?.markNote(note.index, MISSED_CLASS, false)
      }
      missedRef.current = keep
      setMissed(keep)
      setRun({ hit: 0, checked: 0, finished: false })
    },
    [melody, sheetMusicRef],
  )

  const clearMarks = useCallback(() => {
    sheetMusicRef.current?.clearMarks(MISSED_CLASS)
    missedRef.current = []
    setMissed([])
    setRun(null)
  }, [sheetMusicRef])

  const play = useCallback(async () => {
    if (!(await mic.start())) return
    if (playback.state !== 'paused' || !trackerRef.current) startRun(Tone.Transport.seconds)
    await playback.play()
  }, [mic, playback, startRun])

  const seek = useCallback(
    (time) => {
      playback.seek(time)
      if (trackerRef.current) startRun(time)
    },
    [playback, startRun],
  )

  // Judge notes as playback moves past them.
  useEffect(() => {
    if (playback.state !== 'playing') return undefined
    let raf
    const tick = () => {
      const t = Tone.Transport.seconds
      lastTimeRef.current = t
      if (trackerRef.current) applyVerdicts(trackerRef.current.collect(t))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playback.state, applyVerdicts])

  // End of the song (or Stop): judge what's left if we got to the end, then release the mic.
  // Only on the transition into 'stopped' — Play starts a run while the state is still 'stopped'.
  const prevStateRef = useRef(playback.state)
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = playback.state
    if (playback.state !== 'stopped' || prev === 'stopped' || !trackerRef.current) return
    const tracker = trackerRef.current
    trackerRef.current = null
    const finished = lastTimeRef.current >= playback.duration - END_SLACK_SECONDS
    if (finished) applyVerdicts(tracker.collect(Infinity))
    setRun((r) => r && { ...r, finished })
    mic.stop()
  }, [playback.state, playback.duration, applyVerdicts, mic])

  // Leaving the mode takes the red marks off the score.
  useEffect(() => {
    const viewer = sheetMusicRef.current
    return () => viewer?.clearMarks(MISSED_CLASS)
  }, [sheetMusicRef])

  const live = mic.current
  const liveTarget = live ? findActiveNote(melody, live.time) : null
  const liveCents = live && liveTarget ? noteDistanceCents(live.midi, liveTarget.midi) : null
  const liveVerdict = liveCents === null ? 'rest' : Math.abs(liveCents) <= 100 ? 'in-tune' : 'wrong'
  const playing = playback.state === 'playing'

  return (
    <>
      <PlaybackControls
        state={playback.state}
        position={playback.position}
        duration={playback.duration}
        onPlay={play}
        onPause={playback.pause}
        onStop={playback.stop}
        onSeek={seek}
        disabled={disabled || mic.status === 'requesting'}
      />
      <div className="practice-status" aria-live="polite">
        {listening && playing ? (
          <span className={`practice-status__live practice-status__live--${liveVerdict}`}>
            {live
              ? `you: ${live.noteName}${liveTarget ? ` · note ${midiToNoteName(liveTarget.midi)}` : ' · rest'}`
              : 'listening…'}
          </span>
        ) : (
          !run && <span>Sing along with playback. Headphones help — otherwise the mic also hears the music.</span>
        )}
        {run?.finished && (
          <strong>
            Hit {run.hit} of {run.checked} notes
          </strong>
        )}
        {missed.length > 0 && (
          <span className="practice-status__count">
            {missed.length} trouble spot{missed.length === 1 ? '' : 's'}
          </span>
        )}
        {missed.length > 0 && !playing && (
          <button type="button" className="practice-status__link" onClick={clearMarks}>
            Clear marks
          </button>
        )}
        {mic.status === 'error' && <span className="practice-status__error">{mic.error}</span>}
      </div>
    </>
  )
}

export default TroubleSpotsPlayer
