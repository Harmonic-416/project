import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import './PracticeModes.css'
import PlaybackControls from './PlaybackControls.jsx'
import PracticeSummary from './PracticeSummary.jsx'
import { useMicPitch } from '../audio/useMicPitch.js'
import { findActiveNote, midiToNoteName } from '../audio/pitchDetector.js'
import { createTroubleTracker, noteDistanceCents } from '../practice/practiceLogic.js'
import { liveVerdict, STRICT_TROUBLE, summarizeTroubleRun } from '../practice/scoring.js'
import { useSessionRuns } from '../practice/sessionRuns.js'
import { getScoreSeconds } from '../playback/scoreClock.js'

const MISSED_CLASS = 'practice-note--missed'
const CLOSE_CLASS = 'practice-note--close'
// Stopping this close to the end counts as finishing, so the last notes still get a verdict.
const END_SLACK_SECONDS = 0.5
const NEW_RUN = { right: 0, close: 0, missed: 0, finished: false, from: 0 }

/** Playback clock in score seconds (at any tempo), or null while the transport isn't running (so paused frames aren't scored). */
const getTransportSeconds = () => (Tone.Transport.state === 'started' ? getScoreSeconds() : null)

/**
 * "Trouble spots": normal playback that never waits. The mic runs alongside
 * and, as playback moves past each melody note, practiceLogic's tracker
 * decides whether it was sung on pitch (scoring.js STRICT_TROUBLE, any octave),
 * a half step off, or missed. Half-step notes turn amber and missed ones
 * red, and stay so until that passage is sung again or the marks are cleared.
 *
 * Scoring (practice/scoring.js): right = 1, a half step off = ½, missed = 0,
 * counted live; reaching the end shows the score, and a run from the start
 * joins this session's tries for `runsKey` (practice/sessionRuns.js).
 */
function TroubleSpotsPlayer({ melody, playback, sheetMusicRef, disabled, runsKey }) {
  const [missed, setMissed] = useState([])
  const missedRef = useRef([])
  const [run, setRun] = useState(null) // { right, close, missed, finished, from }
  const runRef = useRef(null)
  const [summary, setSummary] = useState(null)
  const [runs, addRun] = useSessionRuns(runsKey)
  const trackerRef = useRef(null)
  const lastTimeRef = useRef(0)

  const handleSample = useCallback((sample) => trackerRef.current?.addSample(sample), [])
  const mic = useMicPitch({ getTime: getTransportSeconds, onSample: handleSample })
  const listening = mic.status === 'listening'

  const updateRun = useCallback((next) => {
    runRef.current = next
    setRun(next)
  }, [])

  const applyVerdicts = useCallback(
    ({ hit, missed: newlyMissed, close }) => {
      if (!hit.length && !newlyMissed.length) return
      const near = new Set(close)
      newlyMissed.forEach((note) =>
        sheetMusicRef.current?.markNote(note.index, near.has(note) ? CLOSE_CLASS : MISSED_CLASS),
      )
      if (newlyMissed.length) {
        missedRef.current = [...missedRef.current, ...newlyMissed]
        setMissed(missedRef.current)
      }
      const r = runRef.current
      if (r) {
        updateRun({
          ...r,
          right: r.right + hit.length,
          close: r.close + close.length,
          missed: r.missed + newlyMissed.length - close.length,
        })
      }
    },
    [sheetMusicRef, updateRun],
  )

  /** Start judging from `from`; singing a passage again clears its old marks. */
  const startRun = useCallback(
    (from) => {
      const tracker = createTroubleTracker(melody, STRICT_TROUBLE)
      tracker.skipTo(from)
      trackerRef.current = tracker
      lastTimeRef.current = from
      const keep = []
      for (const note of missedRef.current) {
        if (note.time + note.duration < from) keep.push(note)
        else {
          sheetMusicRef.current?.markNote(note.index, MISSED_CLASS, false)
          sheetMusicRef.current?.markNote(note.index, CLOSE_CLASS, false)
        }
      }
      missedRef.current = keep
      setMissed(keep)
      setSummary(null)
      updateRun({ ...NEW_RUN, from })
    },
    [melody, sheetMusicRef, updateRun],
  )

  const clearMarks = useCallback(() => {
    sheetMusicRef.current?.clearMarks(MISSED_CLASS)
    sheetMusicRef.current?.clearMarks(CLOSE_CLASS)
    missedRef.current = []
    setMissed([])
    updateRun(null)
    setSummary(null)
  }, [sheetMusicRef, updateRun])

  const play = useCallback(async () => {
    if (!(await mic.start())) return
    if (playback.state !== 'paused' || !trackerRef.current) startRun(getScoreSeconds())
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
      const t = getScoreSeconds()
      lastTimeRef.current = t
      if (trackerRef.current) applyVerdicts(trackerRef.current.collect(t))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playback.state, applyVerdicts])

  // End of the song (or Stop): judge what's left if we got to the end, score
  // the run, then release the mic. Only on the transition into 'stopped' —
  // Play starts a run while the state is still 'stopped'.
  const prevStateRef = useRef(playback.state)
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = playback.state
    if (playback.state !== 'stopped' || prev === 'stopped' || !trackerRef.current) return
    const tracker = trackerRef.current
    trackerRef.current = null
    const finished = lastTimeRef.current >= playback.duration - END_SLACK_SECONDS
    if (finished) applyVerdicts(tracker.collect(Infinity))
    const r = runRef.current
    if (r) {
      updateRun({ ...r, finished })
      if (finished) {
        const result = summarizeTroubleRun(runRef.current)
        // Only a run from the top is a fair comparison with the others.
        const charted = result.total > 0 && r.from <= (melody[0]?.time ?? 0) + 1e-3
        if (charted) addRun(result.score)
        setSummary(result.total > 0 ? { ...result, charted } : null)
      }
    }
    mic.stop()
  }, [playback.state, playback.duration, applyVerdicts, mic, melody, addRun, updateRun])

  // Leaving the mode takes the marks off the score.
  useEffect(() => {
    const viewer = sheetMusicRef.current
    return () => {
      viewer?.clearMarks(MISSED_CLASS)
      viewer?.clearMarks(CLOSE_CLASS)
    }
  }, [sheetMusicRef])

  const live = mic.current
  const liveTarget = live ? findActiveNote(melody, live.time) : null
  const liveCents = live && liveTarget ? noteDistanceCents(live.midi, liveTarget.midi) : null
  const liveTone = liveCents === null ? 'rest' : liveVerdict(liveCents, STRICT_TROUBLE.toleranceCents)
  const playing = playback.state === 'playing'
  const counted = run ? run.right + run.close + run.missed : 0

  return (
    <>
      <PlaybackControls
        state={playback.state}
        position={playback.position}
        duration={playback.duration}
        rate={playback.rate}
        onPlay={play}
        onPause={playback.pause}
        onStop={playback.stop}
        onSeek={seek}
        disabled={disabled || mic.status === 'requesting'}
      />
      <div className="practice-status" aria-live="polite">
        {listening && playing ? (
          <span className={`practice-status__live practice-status__live--${liveTone}`}>
            {live
              ? `you: ${live.noteName}${liveTarget ? ` · note ${midiToNoteName(liveTarget.midi)}` : ' · rest'}`
              : 'listening…'}
          </span>
        ) : (
          !run && <span>Sing along with playback. Headphones help — otherwise the mic also hears the music.</span>
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
      {/* Outside the live region: it changes with every note. */}
      {run && counted > 0 && !summary && <Tally run={run} />}
      {(summary || runs.length > 0) && (
        <PracticeSummary
          title="Singing in time"
          score={summary?.score ?? null}
          runs={runs}
          charted={summary?.charted ?? true}
          chartLabel="Trouble spots scores this session, by try"
        >
          {summary && (
            <>
              <Tally run={summary} />
              <p>
                {summary.right} of {summary.total} notes on pitch. Notes a half step off count half; anything
                further off, or not sung, is a miss.
              </p>
            </>
          )}
        </PracticeSummary>
      )}
    </>
  )
}

/** Right / a half step off / missed, coloured like the notes on the score. */
function Tally({ run }) {
  return (
    <ul className="practice-tally" aria-label="Notes so far">
      <li className="practice-tally__right">{run.right} right</li>
      <li className="practice-tally__close">{run.close} a half step off (½)</li>
      <li className="practice-tally__missed">{run.missed} missed</li>
    </ul>
  )
}

export default TroubleSpotsPlayer
