import { useEffect } from 'react'
import ChordDiagram from './ChordDiagram.jsx'
import { SECONDS_PER_CHORD, playScore } from './playState.js'
import './PlayRun.css'

const RESULT_MARK = { verified: '✓', wrong: '✕', silent: '…' }
const RESULT_TEXT = { verified: 'heard it', wrong: 'something else', silent: 'too quiet' }

/**
 * Play mode screen: Start → 3-2-1 → each chord of the progression stays up
 * for SECONDS_PER_CHORD with a progress bar, then the next one comes on its
 * own. Ends with a score and one chip per chord. `state`/`dispatch` come from
 * playReducer (owned by PracticeScreen so the demo buttons can reach it).
 */
function PlayRun({ chords, state, dispatch, labelMode }) {
  const { status, count, index, results } = state

  // Countdown: one tick per second.
  useEffect(() => {
    if (status !== 'countdown') return undefined
    const id = setTimeout(() => dispatch({ type: 'tick' }), 1000)
    return () => clearTimeout(id)
  }, [status, count, dispatch])

  // Running: move to the next chord when this one's time is up.
  useEffect(() => {
    if (status !== 'running') return undefined
    const id = setTimeout(() => dispatch({ type: 'advance' }), SECONDS_PER_CHORD * 1000)
    return () => clearTimeout(id)
  }, [status, index, dispatch])

  const chord = chords[index]
  const next = chords[index + 1]
  const progressionText = chords.map((c) => c.id).join(' → ')

  if (status === 'done') {
    const { heard, total } = playScore(results)
    return (
      <div className="play-run play-run--done">
        <p className="play-run__score">
          <strong>
            {heard} of {total}
          </strong>{' '}
          chords heard
        </p>
        <ul className="play-run__chips">
          {chords.map((c, i) => {
            const result = results[i]
            return (
              <li key={c.id} className={`play-run__chip play-run__chip--${result ?? 'missed'}`}>
                <span className="play-run__chip-mark">{RESULT_MARK[result] ?? '–'}</span>
                <strong>{c.id}</strong>
                <small>{RESULT_TEXT[result] ?? 'missed'}</small>
              </li>
            )
          })}
        </ul>
        <button type="button" className="play-run__primary" onClick={() => dispatch({ type: 'start' })}>
          Play again
        </button>
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="play-run play-run--idle">
        <p className="play-run__progression">{progressionText}</p>
        <p className="play-run__hint">
          {chords.length} chords, {SECONDS_PER_CHORD} seconds each. The app keeps going even if you miss one.
        </p>
        <button type="button" className="play-run__primary" onClick={() => dispatch({ type: 'start' })}>
          Start
        </button>
      </div>
    )
  }

  return (
    <div className="play-run">
      <div className="play-run__top">
        <span className="play-run__step">
          Chord {index + 1} of {chords.length}
        </span>
        <span className="play-run__next">{next ? `Next: ${next.name}` : 'Last chord'}</span>
      </div>

      <div className="play-run__stage">
        <h3 className="play-run__chord">{chord.name}</h3>
        <ChordDiagram chord={chord} labelMode={labelMode} />
        {status === 'countdown' && (
          <div className="play-run__countdown" aria-live="assertive">
            {count}
          </div>
        )}
      </div>

      {/* key restarts the bar's CSS animation for every chord */}
      <div className="play-run__bar" aria-hidden="true">
        {status === 'running' && <span key={index} style={{ animationDuration: `${SECONDS_PER_CHORD}s` }} />}
      </div>

      <ol className="play-run__dots" aria-label="Progress">
        {chords.map((c, i) => (
          <li
            key={c.id}
            className={`play-run__dot ${i === index ? 'is-current' : ''} ${
              results[i] ? `play-run__dot--${results[i]}` : ''
            }`}
          >
            {c.id}
          </li>
        ))}
      </ol>

      <button type="button" className="play-run__stop" onClick={() => dispatch({ type: 'reset' })}>
        Stop
      </button>
    </div>
  )
}

export default PlayRun