import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import PlaybackControls from './GuitarPlaybackControls.jsx'
import ShareAttempt from '../../../vocal/components/ShareAttempt.jsx'
import StringStates from '../../practice/StringStates.jsx'
import { midiToNoteName } from '../../../vocal/audio/pitchDetector.js'
import { entryIndexAtTime, fingeringLabel } from './songTimeline.js'
import { useGuitarListener } from './useGuitarListener.js'
import { seekToTick } from './playerControls.js'
import { useTuningReport } from '../../tuner/tuningReport.js'
import { createWaitAttempts } from './waitListening.js'
import { NUDGE_AFTER, initialWait, isDone, waitReducer, waitSummary } from './waitState.js'
import { isFullRun, waitAccuracy, waitVerdicts } from './runHistory.js'
import { waitTiming } from './recordingTiming.js'
import RunReview from './RunReview.jsx'
import HearingHelp from './HearingHelp.jsx'

// How long a Hint rings; the mic ignores it for that long.
const HINT_MS = 1500

/** StringStates' chord shape ({ frets }, low E first, -1 = not played) for a timeline entry. */
function shapeOf(entry) {
  const frets = [-1, -1, -1, -1, -1, -1]
  for (const { string, fret } of entry.notes) if (string >= 1 && string <= 6) frets[6 - string] = fret
  return { frets }
}

/** StringStates' per-string lights (low E first) from a chord judgement. */
function lightsOf(result) {
  return [6, 5, 4, 3, 2, 1].map((string) => result?.strings?.[string] ?? 'idle')
}

/**
 * "Wait for me" on a guitar song: the Vocal tab's mode (vocal/components/
 * WaitModePlayer) for picks and strums. Playback stays stopped; the cursor
 * sits on the next note or chord, which is boxed on the tab, and moves on
 * only once the mic hears it played. A wrong note never moves it (waitState.js),
 * and noise, a strum heard twice or a chord still ringing doesn't count as
 * playing at all (waitListening.js). Nothing plays while listening, so the
 * mic only hears the guitar.
 *
 * While signed in, a run played to the end is saved privately into the
 * song's practice session, scored on the notes played first try, and can be
 * shared like a Trouble spots run (change: guitar-run-history, F22).
 * `shareSong` names the song (see vocal/components/ShareAttempt).
 *
 * The run is recorded from the first Play to the last note (Pause only
 * pauses the recording), so whoever it's shared with hears the playing
 * itself, not the song's MIDI. Stop, or a seek after the end, starts over.
 * Each time the cursor moves on is noted against the recording
 * (recordingTiming.waitTiming), so their cursor moves with it.
 */
function GuitarWaitMode({ api, transportHost, onTransportStart, timeline, overlay, ready, auth = null, supabase = null, shareSong = null, session = null, easy = false, onSaved = null }) {
  const { entries, duration } = timeline
  const reducer = useMemo(() => waitReducer(entries), [entries])
  const [state, dispatch] = useReducer(reducer, entries, initialWait)
  const [attempts] = useState(() => createWaitAttempts())
  const reportTuning = useTuningReport()
  const [lastResult, setLastResult] = useState(null) // { index, result }
  const [take, setTake] = useState(null) // { recording, timing } once a finished run's audio is in
  const fullRunRef = useRef(true)
  const takeGenerationRef = useRef(0)
  const finishedRef = useRef(false) // this run's recording is being (or was) collected
  const stepsRef = useRef([]) // { at, time }: when (into the recording) the cursor moved to which note
  const secondsAtRef = useRef(null) // listener.recordingSecondsAt
  const stateRef = useRef(state)
  const done = isDone(entries, state)
  const target = done ? null : entries[state.index]

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // The ref moves at once, so a window that arrives before the next render meets the new target.
  const apply = useCallback(
    (action) => {
      stateRef.current = reducer(stateRef.current, action)
      dispatch(action)
    },
    [reducer],
  )

  // The cursor moved on to entry `index` (or past the last note) at page time `wall`.
  const noteStep = useCallback(
    (wall, index) => {
      const at = secondsAtRef.current?.(wall) ?? null
      const entry = entries[Math.min(index, entries.length - 1)]
      if (at !== null && entry) stepsRef.current.push({ at, time: entry.time })
    },
    [entries],
  )

  // Skip, Retry, a seek, Play, Stop: the gesture being listened to is over.
  const restart = useCallback(
    (action) => {
      attempts.reset()
      if (action) {
        if (action.type === 'goto') fullRunRef.current = false
        if (action.type === 'reset') fullRunRef.current = true
        takeGenerationRef.current += 1
        setTake(null)
        const from = stateRef.current.index
        apply(action)
        if (stateRef.current.index !== from) noteStep(performance.now(), stateRef.current.index)
      }
    },
    [apply, attempts, noteStep],
  )

  const handleWindow = useCallback(
    (w) => {
      const index = stateRef.current.index
      const entry = entries[index]
      if (!entry) return
      const { actions, log } = attempts.consider(w, entry)
      if (import.meta.env.DEV) {
        // For tuning against real playing: every window, what was decided and why, in the console's window.__harmonic.
        const harmonic = (window.__harmonic ??= {})
        ;(harmonic.guitarJudgements ??= []).push({ mode: 'wait', source: w.source, entry: index, ...log })
      }
      for (const action of actions) {
        setLastResult({ index, result: action.result })
        if (action.result.verdict === 'hit') reportTuning(action.result.cents) // single notes carry cents
        apply(action)
      }
      if (stateRef.current.index !== index) noteStep(w.wall, stateRef.current.index)
    },
    [apply, attempts, entries, noteStep, reportTuning],
  )

  const listener = useGuitarListener({ onWindow: handleWindow, record: true })
  const listening = listener.status === 'listening'
  const micOpen = listening || listener.status === 'paused'
  useEffect(() => {
    secondsAtRef.current = listener.recordingSecondsAt
  }, [listener.recordingSecondsAt])

  // The song is ours while this mode is up: stop playback, leave a clean score behind.
  useEffect(() => {
    api?.stop()
    return () => overlay.clear()
  }, [api, overlay])

  // Results and the current target, boxed on the tab.
  useEffect(() => {
    overlay.clear()
    state.results.forEach((result, i) => result && overlay.mark(i, result))
    if (target) overlay.mark(target.index, 'target')
  }, [overlay, state.results, target])

  // The cursor sits on the target.
  useEffect(() => {
    if (!api || !ready || !target) return
    seekToTick(api, target.tick)
    api.scrollToCursor()
  }, [api, ready, target])

  // Last note played (or skipped): release the microphone and keep the
  // run's recording for the save below. Once per run.
  const { stop: stopListening } = listener
  useEffect(() => {
    if (!done) {
      finishedRef.current = false
      return
    }
    if (finishedRef.current) return
    finishedRef.current = true
    const generation = takeGenerationRef.current
    const steps = [...stepsRef.current]
    Promise.resolve(micOpen ? stopListening() : null).then((recording) => {
      if (takeGenerationRef.current === generation) setTake({ recording, timing: recording ? waitTiming(steps) : null, fullRun: fullRunRef.current })
    })
  }, [done, micOpen, stopListening])

  const play = async () => {
    restart(done ? { type: 'reset' } : null)
    const fresh = !micOpen
    if (!(await listener.start())) return
    // A new recording: the cursor starts on the note it's sitting on.
    if (fresh) stepsRef.current = [{ at: 0, time: entries[stateRef.current.index]?.time ?? 0 }]
  }

  const pause = () => {
    listener.pause()
    restart()
  }

  const stop = () => {
    listener.stop()
    restart({ type: 'reset' })
  }

  const hint = () => {
    if (!target || !api) return
    listener.muteFor(HINT_MS)
    restart()
    api.playBeat(target.beat)
  }

  const first = initialWait(entries).index
  const controlState = done ? 'stopped' : listening ? 'playing' : state.index > first ? 'paused' : 'idle'
  const heard = state.heard
  const chordResult = target && lastResult?.index === target.index ? lastResult.result : null
  const summary = done ? waitSummary(state.results) : null
  const savedVerdicts = useMemo(() => (done ? waitVerdicts(entries, state.results) : null), [done, entries, state.results])
  const stuck = state.misses >= NUDGE_AFTER
  const linkClass = `practice-status__link${stuck ? ' practice-status__link--nudge' : ''}`

  return (
    <>
      <PlaybackControls
        transportHost={transportHost}
        onTransportStart={onTransportStart}
        state={controlState}
        position={target?.time ?? duration}
        duration={duration}
        onPlay={play}
        onPause={pause}
        onStop={stop}
        onSeek={(time) => restart({ type: 'goto', index: entryIndexAtTime(entries, time) })}
        disabled={!ready || !entries.length || listener.status === 'requesting'}
      />
      <div className="practice-status" aria-live="polite">
        {summary ? (
          <strong>
            Done — {summary.firstTry} of {summary.scored} first try
            {summary.afterRetry ? `, ${summary.afterRetry} after a few tries` : ''}
            {summary.missed ? `, ${summary.missed} skipped` : ''}. Press Play to go again.
          </strong>
        ) : (
          target && (
            <span>
              {target.kind === 'single' ? 'Note' : 'Chord'} {target.index + 1} of {entries.length}:{' '}
              {target.kind === 'single' ? (
                <>
                  play <strong>{midiToNoteName(target.midi)}</strong>
                  {fingeringLabel(target) && ` (${fingeringLabel(target)})`}
                </>
              ) : (
                <>
                  strum <strong>{fingeringLabel(target) || target.notes.map((n) => midiToNoteName(n.midi)).join(' ')}</strong>
                </>
              )}
            </span>
          )
        )}
        {listening && !done && heard && !listener.quiet && (
          <span className={`practice-status__live practice-status__live--${heard.verdict === 'close' ? 'close' : 'wrong'}`}>
            {heard.verdict === 'close' ? 'Close' : 'Something else'}
            {heard.detected != null ? ` (heard ${midiToNoteName(heard.detected)})` : ''} · try {state.misses}
          </span>
        )}
        {listening && !done && (!heard || listener.quiet) && (
          <span className="practice-status__live">
            {listener.quiet
              ? 'Couldn’t hear you — play a little louder'
              : listener.live
                ? `you: ${listener.live.noteName}`
                : 'listening…'}
          </span>
        )}
        {listening && !done && stuck && <span>Stuck? Hint plays it for you, or Skip moves on.</span>}
        {target && (
          <>
            <button type="button" className={linkClass} onClick={hint} disabled={!ready}>
              Hint
            </button>
            <button type="button" className={linkClass} onClick={() => restart({ type: 'skip' })}>
              Skip
            </button>
              <button type="button" className="practice-status__link" onClick={() => restart({ type: 'retry' })}>
                Retry
              </button>
          </>
        )}
        {listener.status === 'error' && <span className="practice-status__error">{listener.error}</span>}
      </div>
      {listener.quiet && listening && <HearingHelp />}
      {summary && <RunReview entries={entries} verdicts={state.results} mode="wait" onSelect={(entry) => { restart({ type: 'goto', index: entry.index }); seekToTick(api, entry.tick) }} />}
      {summary && summary.scored > 0 && take && auth && shareSong && (
        <ShareAttempt
          auth={auth}
          supabase={supabase}
          song={shareSong}
          accuracy={waitAccuracy(summary)}
          recording={take.recording}
          timing={take.timing}
          instrument="guitar"
          recordingChoice
          verdicts={savedVerdicts}
          session={session}
          mode="wait"
          easy={easy}
          fullRun={take.fullRun && isFullRun(entries, savedVerdicts)}
          onSaved={onSaved}
        />
      )}
      {target?.kind === 'chord' && (
        <div className="guitar-follow__strings">
          <StringStates chord={shapeOf(target)} strings={lightsOf(chordResult)} />
        </div>
      )}
    </>
  )
}

export default GuitarWaitMode
