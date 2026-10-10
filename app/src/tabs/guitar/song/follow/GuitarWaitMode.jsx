import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import PlaybackControls from '../../../vocal/components/PlaybackControls.jsx'
import StringStates from '../../practice/StringStates.jsx'
import { midiToNoteName } from '../../../vocal/audio/pitchDetector.js'
import { entryIndexAtTime, fingeringLabel } from './songTimeline.js'
import { useGuitarListener } from './useGuitarListener.js'
import { seekToTick } from './playerControls.js'
import { createWaitAttempts } from './waitListening.js'
import { NUDGE_AFTER, initialWait, isDone, waitReducer, waitSummary } from './waitState.js'

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
 */
function GuitarWaitMode({ api, timeline, overlay, ready }) {
  const { entries, duration } = timeline
  const reducer = useMemo(() => waitReducer(entries), [entries])
  const [state, dispatch] = useReducer(reducer, entries, initialWait)
  const [attempts] = useState(() => createWaitAttempts())
  const [lastResult, setLastResult] = useState(null) // { index, result }
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

  // Skip, Retry, a seek, Play, Stop: the gesture being listened to is over.
  const restart = useCallback(
    (action) => {
      attempts.reset()
      if (action) apply(action)
    },
    [apply, attempts],
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
        apply(action)
      }
    },
    [apply, attempts, entries],
  )

  const listener = useGuitarListener({ onWindow: handleWindow })
  const listening = listener.status === 'listening'

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

  // Last note played: release the microphone.
  const { stop: stopListening } = listener
  useEffect(() => {
    if (done && listening) stopListening()
  }, [done, listening, stopListening])

  const play = async () => {
    restart(done ? { type: 'reset' } : null)
    await listener.start()
  }

  const pause = () => {
    listener.stop()
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
  const stuck = state.misses >= NUDGE_AFTER
  const linkClass = `practice-status__link${stuck ? ' practice-status__link--nudge' : ''}`

  return (
    <>
      <PlaybackControls
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
        {listening && !done && heard && (
          <span className={`practice-status__live practice-status__live--${heard.verdict === 'close' ? 'close' : 'wrong'}`}>
            {heard.verdict === 'close' ? 'Close' : 'Something else'}
            {heard.detected != null ? ` (heard ${midiToNoteName(heard.detected)})` : ''} · try {state.misses}
          </span>
        )}
        {listening && !done && !heard && (
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
            {state.misses > 0 && (
              <button type="button" className="practice-status__link" onClick={() => restart({ type: 'retry' })}>
                Retry
              </button>
            )}
          </>
        )}
        {listener.status === 'error' && <span className="practice-status__error">{listener.error}</span>}
      </div>
      {target?.kind === 'chord' && (
        <div className="guitar-follow__strings">
          <StringStates chord={shapeOf(target)} strings={lightsOf(chordResult)} />
        </div>
      )}
    </>
  )
}

export default GuitarWaitMode
