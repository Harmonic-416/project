import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import './PracticeModes.css'
import PlaybackControls from './PlaybackControls.jsx'
import { useMicPitch } from '../audio/useMicPitch.js'
import { findActiveNote, midiToNoteName } from '../audio/pitchDetector.js'
import { createTroubleTracker, noteDistanceCents } from '../practice/practiceLogic.js'
import { createBleedGate, playableWhileScoring } from '../practice/deviceBleed.js'
import { heardScoreTime, TYPICAL_CAPTURE_DELAY } from '../audio/scoreClock.js'

const MISSED_CLASS = 'practice-note--missed'
// Stopping this close to the end counts as finishing, so the last notes still get a verdict.
// The heard clock trails the transport by lookahead + output latency (up to ~0.4 s on Bluetooth).
const END_SLACK_SECONDS = 1

/**
 * "Trouble spots": normal playback that never waits. The mic runs alongside
 * and, as playback moves past each melody note, practiceLogic's tracker
 * decides whether it was sung (within a semitone, any octave); misses are
 * coloured red on the score and stay there until that passage is sung
 * again or the marks are cleared.
 *
 * On the speaker the singer's own part is muted and frames matching what
 * the device plays are ignored, so the device can't hit notes for them
 * (practice/deviceBleed.js).
 */
function TroubleSpotsPlayer({ melody, playback, playbackSchedule, headphones, sheetMusicRef, disabled }) {
  const [missed, setMissed] = useState([])
  const missedRef = useRef([])
  const [run, setRun] = useState(null) // { hit, checked, finished }
  const trackerRef = useRef(null)
  const lastTimeRef = useRef(0)

  const bleedGateRef = useRef(null)
  const isBleed = useCallback((time, midi) => bleedGateRef.current?.(time, midi) ?? false, [])
  const handleSample = useCallback((sample) => trackerRef.current?.addSample(sample), [])
  const mic = useMicPitch({ getTime: heardScoreTime, onSample: handleSample, isBleed })
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
    const audible = playableWhileScoring(playbackSchedule, melody, { headphones })
    playback.setAudible(audible)
    bleedGateRef.current = headphones ? null : createBleedGate(audible)
    if (!(await mic.start())) return
    if (playback.state !== 'paused' || !trackerRef.current) startRun(Tone.Transport.seconds)
    await playback.play()
  }, [headphones, melody, mic, playback, playbackSchedule, startRun])

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
    // Judged on the clock the mic frames use, so a note isn't closed before
    // the frames sung during it have arrived.
    const tick = () => {
      const t = heardScoreTime(TYPICAL_CAPTURE_DELAY)
      if (t === null) {
        raf = requestAnimationFrame(tick)
        return
      }
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

  // Leaving the mode takes the red marks off the score and unmutes playback.
  const { setAudible } = playback
  useEffect(() => {
    const viewer = sheetMusicRef.current
    return () => {
      viewer?.clearMarks(MISSED_CLASS)
      setAudible(null)
    }
  }, [sheetMusicRef, setAudible])

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
          !run && (
            <span>
              {headphones
                ? 'Sing along with playback.'
                : 'Sing your part as the cursor moves — it stays silent so the mic only scores you.'}
            </span>
          )
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
