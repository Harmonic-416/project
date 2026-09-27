import { useEffect } from 'react'
import ChordDiagram from './ChordDiagram.jsx'
import { PRACTICE_SECONDS, STRUMS_TO_PASS, canUnlockAnyway } from './practiceRunState.js'
import './PlayRun.css'
import './PracticeRun.css'

const STATUS_TEXT = {
  verified: '✓ Clean — keep going',
  wrong: '✕ Something else — streak reset',
  silent: '… Couldn’t hear you — play a little louder',
}

/**
 * Practice mode screen: Start → 3-2-1 → the one chord being learned stays up
 * for PRACTICE_SECONDS; STRUMS_TO_PASS clean strums in a row pass it and
 * unlock `nextChord`. Same layout and classes as PlayRun. `state`/`dispatch`
 * come from practiceRunReducer (owned by PracticeScreen so the demo buttons
 * and the unlock bookkeeping can reach it).
 */
function PracticeRun({ chord, nextChord, state, dispatch, labelMode, onLearnNext, onBackToLearn, onUnlockAnyway }) {
  const { status, count, streak, verdict } = state

  // Countdown: one tick per second.
  useEffect(() => {
    if (status !== 'countdown') return undefined
    const id = setTimeout(() => dispatch({ type: 'tick' }), 1000)
    return () => clearTimeout(id)
  }, [status, count, dispatch])

  // Running: one window for the whole streak.
  useEffect(() => {
    if (status !== 'running') return undefined
    const id = setTimeout(() => dispatch({ type: 'timeout' }), PRACTICE_SECONDS * 1000)
    return () => clearTimeout(id)
  }, [status, dispatch])

  if (status === 'passed') {
    return (
      <div className="play-run play-run--done">
        <p className="play-run__score">
          <strong>✓ {chord.name}</strong> passed
        </p>
        <p className="play-run__hint">
          {nextChord ? `${nextChord.name} is unlocked.` : 'All chords unlocked.'}
        </p>
        <div className="practice-run__actions">
          {nextChord ? (
            <button type="button" className="play-run__primary" onClick={onLearnNext}>
              Learn {nextChord.name}
            </button>
          ) : (
            <button type="button" className="play-run__primary" onClick={onBackToLearn}>
              Back to Learn
            </button>
          )}
          <button type="button" className="play-run__stop" onClick={() => dispatch({ type: 'start' })}>
            Practice again
          </button>
        </div>
      </div>
    )
  }

  if (status === 'failed') {
    const softGate = canUnlockAnyway(state)
    return (
      <div className="play-run play-run--done">
        <p className="play-run__score">
          Not quite ·{' '}
          <strong>
            {streak} of {STRUMS_TO_PASS}
          </strong>{' '}
          in a row
        </p>
        <p className="play-run__hint">
          {softGate
            ? 'Detection can be fussy. Move on if you like, and come back to this chord later.'
            : `Time ran out. Play ${chord.name} ${STRUMS_TO_PASS} times in a row to pass.`}
        </p>
        <div className="practice-run__actions">
          <button type="button" className="play-run__primary" onClick={() => dispatch({ type: 'start' })}>
            Try again
          </button>
          <button type="button" className="play-run__stop" onClick={onBackToLearn}>
            Back to Learn
          </button>
          {softGate && nextChord && (
            <button type="button" className="play-run__stop" onClick={onUnlockAnyway}>
              Unlock anyway
            </button>
          )}
        </div>
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="play-run play-run--idle">
        <p className="play-run__progression">{chord.name}</p>
        <p className="play-run__hint">
          Play {chord.name} cleanly {STRUMS_TO_PASS} times in a row within {PRACTICE_SECONDS} seconds
          {nextChord ? ` to unlock ${nextChord.name}.` : '.'}
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
        <span className="play-run__step">Clean strums in a row</span>
        <span className="play-run__next">{nextChord ? `Unlocks ${nextChord.name}` : 'Last chord'}</span>
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

      {/* one bar for the whole window */}
      <div className="play-run__bar" aria-hidden="true">
        {status === 'running' && <span style={{ animationDuration: `${PRACTICE_SECONDS}s` }} />}
      </div>

      <ol className="play-run__dots" aria-label={`Streak: ${streak} of ${STRUMS_TO_PASS}`}>
        {Array.from({ length: STRUMS_TO_PASS }, (_, i) => (
          <li
            key={i}
            className={`play-run__dot ${i === streak ? 'is-current' : ''} ${i < streak ? 'play-run__dot--verified' : ''}`}
          >
            {i + 1}
          </li>
        ))}
      </ol>

      <p className={`practice-run__status practice-run__status--${verdict ?? 'waiting'}`} role="status" aria-live="polite">
        {status === 'countdown' ? 'Get ready…' : (STATUS_TEXT[verdict] ?? `Play ${chord.name}`)}
      </p>

      <button type="button" className="play-run__stop" onClick={() => dispatch({ type: 'reset' })}>
        Stop
      </button>
    </div>
  )
}

export default PracticeRun
