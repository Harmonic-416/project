import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useGuitarListener } from '../song/follow/useGuitarListener.js'
import ChordTransition from './ChordTransition.jsx'
import { CHORDS } from './chords.js'
import { createChangeCounter } from './changesCounter.js'
import { FIRST_TARGET, GOAL, changesReducer, defaultPair, initialChanges, loadBests, pairKey, recordBest } from './changesState.js'
import { transitionTip } from './chordTransition.js'
import { useChordPlayer } from './useChordPlayer.js'
import './ChangesRun.css'

const SHOW_FLIPS = 6 // A → B → A → B … for "Show me"
const SHOW_STEP_MS = 1400

const byId = (id) => CHORDS.find((c) => c.id === id)

/**
 * One-minute changes (F38): pick two chords you've opened, see and hear
 * the change (ChordTransition: which fingers stay, which move), then change
 * between them for a minute. Tap "Changed!" (or the space bar) for every
 * change — the drill as JustinGuitar teaches it — while the mic counts the
 * changes it hears too (changesCounter.js), side by side. The tap count is
 * the score, and the best per pair is kept.
 */
function ChangesRun({ unlocked }) {
  const choices = CHORDS.slice(0, Math.max(unlocked, 2))
  const [pair, setPair] = useState(() => defaultPair(unlocked))
  const [a, b] = pair.map(byId)
  const [state, dispatch] = useReducer(changesReducer, undefined, initialChanges)
  const [bests, setBests] = useState(loadBests)
  const [showStep, setShowStep] = useState(null) // 0 … SHOW_FLIPS while "Show me" runs
  const player = useChordPlayer()
  const counterRef = useRef(null)
  const statusRef = useRef(state.status)

  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  const onWindow = useCallback(
    (w) => {
      if (statusRef.current !== 'running' || !counterRef.current) return
      dispatch({ type: 'heard', count: counterRef.current.window(w).count })
    },
    [dispatch],
  )
  const listener = useGuitarListener({ onWindow })
  const { stop: stopListening } = listener

  // Countdown and run: one tick a second (taps don't restart it). The last
  // tick of the minute releases the mic and keeps the best.
  const tappedRef = useRef(0)
  useEffect(() => {
    tappedRef.current = state.tapped
  }, [state.tapped])
  useEffect(() => {
    if (state.status !== 'countdown' && state.status !== 'running') return undefined
    const last = state.status === 'running' && state.left <= 1
    const id = setTimeout(() => {
      if (last) {
        stopListening()
        setBests((current) => recordBest(current, a.id, b.id, tappedRef.current))
      }
      dispatch({ type: 'tick' })
    }, 1000)
    return () => clearTimeout(id)
  }, [state.status, state.count, state.left, a.id, b.id, stopListening])

  // Space bar taps while running, like the button.
  useEffect(() => {
    if (state.status !== 'running') return undefined
    const onKey = (event) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      dispatch({ type: 'tap' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.status])

  // "Show me": flip between the shapes, strumming each, a few times.
  const { strum } = player
  useEffect(() => {
    if (showStep === null) return undefined
    strum(showStep % 2 ? b : a).catch((err) => console.error('Changes playback failed', err))
    const id = setTimeout(() => setShowStep((step) => (step + 1 >= SHOW_FLIPS ? null : step + 1)), SHOW_STEP_MS)
    return () => clearTimeout(id)
  }, [showStep, a, b, strum])

  const choose = (slot, id) => {
    const next = [...pair]
    next[slot] = id
    if (next[0] !== next[1]) setPair(next)
  }

  const start = () => {
    setShowStep(null)
    counterRef.current = createChangeCounter(a, b)
    listener.start() // from the tap, so the browser allows the mic
    dispatch({ type: 'start' })
  }

  const stop = () => {
    listener.stop()
    dispatch({ type: 'reset' })
  }

  if (unlocked < 2) {
    return <p className="changes-run__locked">Pass a second chord in Practice first — then change between the two here.</p>
  }

  const best = bests[pairKey(a.id, b.id)] ?? 0
  const phase = showStep !== null && showStep % 2 ? 'to' : 'from'
  const busy = state.status === 'countdown' || state.status === 'running'

  return (
    <div className="changes-run">
      <div className="changes-run__pair">
        Change between
        {[0, 1].map((slot) => (
          <select key={slot} value={pair[slot]} disabled={busy} onChange={(event) => choose(slot, event.target.value)} aria-label={slot ? 'Second chord' : 'First chord'}>
            {choices.map((c) => (
              <option key={c.id} value={c.id} disabled={c.id === pair[1 - slot]}>
                {c.id}
              </option>
            ))}
          </select>
        ))}
      </div>

      <div className="changes-run__body">
        <div className="changes-run__shape">
          <ChordTransition from={a} to={b} phase={phase} />
          <button type="button" className="changes-run__secondary" disabled={busy || showStep !== null} onClick={() => setShowStep(0)}>
            {showStep !== null ? 'Showing…' : 'Show me the change'}
          </button>
        </div>

        <div className="changes-run__panel">
          <p className="changes-run__tip">{transitionTip(a, b)}</p>

          {state.status === 'idle' && (
            <>
              <p className="changes-run__hint">
                Change back and forth for a minute and tap for every change. First target {FIRST_TARGET}, goal {GOAL}.
                {best ? ` Your best: ${best}.` : ''}
              </p>
              <button type="button" className="changes-run__primary" onClick={start}>
                Start
              </button>
            </>
          )}

          {state.status === 'countdown' && (
            <div className="changes-run__countdown" aria-live="assertive">
              {state.count}
            </div>
          )}

          {state.status === 'running' && (
            <>
              <p className="changes-run__time" aria-live="off">
                {state.left}s left
              </p>
              <button type="button" className="changes-run__tap" onClick={() => dispatch({ type: 'tap' })}>
                Changed!
                <small>{state.tapped}</small>
              </button>
              <p className="changes-run__counts">
                Tapped {state.tapped} · heard {state.heard}
              </p>
              <button type="button" className="changes-run__secondary" onClick={stop}>
                Stop
              </button>
            </>
          )}

          {state.status === 'done' && (
            <>
              <p className="changes-run__score">
                <strong>{state.tapped}</strong> changes in a minute
                {state.tapped >= best && state.tapped > 0 ? ' — your best!' : best ? ` (best ${best})` : ''}
              </p>
              <p className="changes-run__counts">
                The mic heard {state.heard}. Your taps are the score while the mic’s count is still being checked.
              </p>
              <p className="changes-run__hint">
                {state.tapped >= GOAL
                  ? 'That’s the goal — try a new pair.'
                  : state.tapped >= FIRST_TARGET
                    ? `Past the first target. Next stop: ${GOAL}.`
                    : `Aim for ${FIRST_TARGET} a minute. Slow, clean changes first.`}
              </p>
              <button type="button" className="changes-run__primary" onClick={start}>
                Go again
              </button>
            </>
          )}

          {listener.status === 'error' && <p className="changes-run__error">{listener.error}</p>}
        </div>
      </div>
    </div>
  )
}

export default ChangesRun
