import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { createClick } from '../../../audio/metronome/click.js'
import { estimateLatency, loadLatency, saveLatency } from '../song/follow/songClock.js'
import { useGuitarListener } from '../song/follow/useGuitarListener.js'
import { soundsLikeANote } from '../song/follow/waitListening.js'
import StrumLane from './StrumLane.jsx'
import {
  BEATS_PER_BAR,
  COUNT_IN_BEATS,
  ON_TIME_MS,
  SCORED_BARS,
  STRUM_STEPS,
  passed,
  scoreStrums,
  strumTargets,
  tendency,
} from './strumTiming.js'
import { soundsLikeAStrum } from './strumHearing.js'
import { loadPassed, savePassed } from './strumProgress.js'
import './StrumDrill.css'

const CALIBRATION_CLICKS = 8
const CALIBRATION_BPM = 80
const LEAD_SECONDS = 0.4 // between the tap and the first click
const SETTLE_MS = 900 // after the last beat, for its strum's window to arrive

/**
 * Schedule `beats` clicks at `bpm` on `click` (from a tap, after
 * Tone.start()), downbeats accented; returns when the first one sounds, on
 * the page clock (performance.now()).
 */
function scheduleClicks(click, beats, bpm) {
  const raw = Tone.getContext().rawContext
  const first = Tone.now() + LEAD_SECONDS
  const beat = 60 / bpm
  for (let i = 0; i < beats; i += 1) click.trigger(first + i * beat, i % BEATS_PER_BAR === 0)
  return performance.now() + (first - raw.currentTime) * 1000
}

const msUntil = (wall) => wall - performance.now()

/**
 * Strum on the beat (F18): a ladder of short runs — a bar of count-in
 * clicks, then four bars to strum with the click — scored on timing alone
 * (strumTiming.js): each strum early, on time or late, how steady, and
 * whether you rush or drag. The clicks (audio/metronome/click.js) and the
 * mic's strums are put on one clock, the page's performance.now(), with
 * the round-trip latency taken off; "Line up the mic" measures that by
 * having you strum along with a few clicks. The strum lane shows the motion.
 */
function StrumDrill() {
  const [passedSteps, setPassedSteps] = useState(loadPassed)
  const [stepId, setStepId] = useState(() => (STRUM_STEPS.find((s) => !loadPassed()[s.id]) ?? STRUM_STEPS[0]).id)
  const [status, setStatus] = useState('idle') // idle | running | calibrating | done
  const [swing, setSwing] = useState(null) // { key, delayMs } for the strum lane while a run plays
  const [heard, setHeard] = useState(0)
  const [score, setScore] = useState(null)
  const [latencyMs, setLatencyMs] = useState(loadLatency)
  const [message, setMessage] = useState(null)
  const runRef = useRef(null) // { kind: 'run' | 'calibrate', step, wall0, strums: [ms], clicks: [ms] }
  const clickRef = useRef(null)
  const timerRef = useRef(null)
  const latencyRef = useRef(latencyMs)
  const step = STRUM_STEPS.find((s) => s.id === stepId)

  useEffect(() => {
    latencyRef.current = latencyMs
  }, [latencyMs])

  const onWindow = useCallback((w) => {
    const run = runRef.current
    if (!run) return
    // The drill's own click, heard back through the speakers, is never a strum.
    if (!soundsLikeAStrum(w)) return
    // Chord steps need a real, ringing strum; muted strums are meant to be dead.
    if (run.kind === 'run' && !run.step.muted && !soundsLikeANote(w).ok) return
    const time = run.kind === 'calibrate' ? w.wall : w.wall - latencyRef.current
    run.strums.push(time - run.wall0)
    setHeard((n) => n + 1)
  }, [])
  const listener = useGuitarListener({ onWindow })
  const { stop: stopListening } = listener

  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
      clickRef.current?.dispose()
    },
    [],
  )

  const finishRun = () => {
    const run = runRef.current
    runRef.current = null
    stopListening()
    clickRef.current?.silence()
    setSwing(null)
    if (run.kind === 'calibrate') {
      const beatMs = 60000 / CALIBRATION_BPM
      const clicks = Array.from({ length: CALIBRATION_CLICKS }, (_, i) => i * beatMs)
      const ms = estimateLatency(clicks, run.strums)
      if (ms === null) setMessage('Couldn’t hear enough strums — strum once on each click, a little louder.')
      else {
        saveLatency(ms)
        setLatencyMs(ms)
        setMessage(`Mic lined up: ${ms} ms.`)
      }
      setStatus('idle')
      return
    }
    const result = scoreStrums(strumTargets(run.step), run.strums)
    setScore(result)
    setStatus('done')
    if (passed(result)) {
      const updated = { ...passedSteps, [run.step.id]: true }
      setPassedSteps(updated)
      savePassed(updated)
    }
  }

  const begin = async (kind) => {
    if (!(await listener.start())) return
    const beats = kind === 'calibrate' ? CALIBRATION_CLICKS : COUNT_IN_BEATS + SCORED_BARS * BEATS_PER_BAR
    const bpm = kind === 'calibrate' ? CALIBRATION_BPM : step.bpm
    await Tone.start()
    clickRef.current ??= createClick()
    clickRef.current.setVolume(0.8)
    const wall0 = scheduleClicks(clickRef.current, beats, bpm)
    runRef.current = { kind, step, wall0, strums: [] }
    setHeard(0)
    setScore(null)
    setMessage(null)
    setSwing({ key: wall0, delayMs: msUntil(wall0) })
    setStatus(kind === 'calibrate' ? 'calibrating' : 'running')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(finishRun, msUntil(wall0) + beats * (60000 / bpm) + SETTLE_MS)
  }

  const stop = () => {
    clearTimeout(timerRef.current)
    runRef.current = null
    stopListening()
    clickRef.current?.silence()
    setSwing(null)
    setStatus('idle')
  }

  const chooseStep = (id) => {
    setStepId(id)
    setScore(null)
    setStatus('idle')
  }

  const busy = status === 'running' || status === 'calibrating'
  const nextStep = STRUM_STEPS[STRUM_STEPS.indexOf(step) + 1]

  return (
    <div className="strum-drill">
      <ol className="strum-drill__steps" aria-label="Steps">
        {STRUM_STEPS.map((s) => (
          <li key={s.id}>
            <button type="button" className={s.id === stepId ? 'is-active' : ''} disabled={busy} onClick={() => chooseStep(s.id)}>
              {passedSteps[s.id] ? '✓ ' : ''}
              {s.title}
            </button>
          </li>
        ))}
      </ol>

      <div className="strum-drill__card">
        <p className="strum-drill__text">
          <strong>{step.text}</strong> {step.bpm} beats a minute: a bar of clicks to get ready, then {SCORED_BARS} bars to play.
          Say it aloud: “1 and 2 and 3 and 4 and”.
        </p>
        <StrumLane step={step} swing={busy ? swing : null} />

        {status === 'idle' && (
          <div className="strum-drill__actions">
            <button type="button" className="strum-drill__primary" onClick={() => begin('run')}>
              Start
            </button>
            <button type="button" className="strum-drill__secondary" onClick={() => begin('calibrate')}>
              {latencyMs ? `Line up the mic again (${latencyMs} ms)` : 'Line up the mic first'}
            </button>
          </div>
        )}

        {busy && (
          <div className="strum-drill__actions">
            <span className="strum-drill__live">
              {status === 'calibrating' ? `Strum once on each of ${CALIBRATION_CLICKS} clicks · heard ${heard}` : `Heard ${heard} strums`}
            </span>
            <button type="button" className="strum-drill__secondary" onClick={stop}>
              Stop
            </button>
          </div>
        )}

        {status === 'done' && score && (
          <div className="strum-drill__result">
            <ol className="strum-drill__beats" aria-label="Each strum">
              {score.results.map((r, i) => (
                <li key={i} className={`strum-drill__beat strum-drill__beat--${r.verdict}`} title={r.offset === null ? 'missed' : `${Math.round(r.offset)} ms`}>
                  {r.target.up ? '↑' : '↓'}
                </li>
              ))}
            </ol>
            <p>
              <strong>
                {score.onTime} of {score.total}
              </strong>{' '}
              on time (within {ON_TIME_MS} ms). {tendency(score) ?? ''}
            </p>
            <p className="strum-drill__hint">
              {passed(score)
                ? nextStep
                  ? `Step passed. Ready for “${nextStep.title}”?`
                  : 'Every step passed — try them with a song.'
                : 'Keep the hand moving with the click; a few more goes.'}
            </p>
            <div className="strum-drill__actions">
              <button type="button" className="strum-drill__primary" onClick={() => begin('run')}>
                Again
              </button>
              {passed(score) && nextStep && (
                <button type="button" className="strum-drill__secondary" onClick={() => chooseStep(nextStep.id)}>
                  Next step
                </button>
              )}
            </div>
          </div>
        )}

        {!latencyMs && status === 'idle' && <p className="strum-drill__hint">Line the mic up once so early and late are measured right.</p>}
        {message && <p className="strum-drill__hint">{message}</p>}
        {listener.status === 'error' && <p className="strum-drill__error">{listener.error}</p>}
      </div>
    </div>
  )
}

export default StrumDrill
