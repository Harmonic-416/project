import { useEffect, useRef, useState } from 'react'
import './SessionAttempts.css'
import { deleteAttemptRecording, getRecordingUrl, saveAttemptFeedback } from '@backend/practiceSessions'
import { attemptNotesLine, attemptTime, budgetOf, debounce, formatBytes } from '../practice/practiceSession.js'

const AUTOSAVE_MS = 600
const RATINGS = [1, 2, 3, 4, 5]

/**
 * "This session": the attempts recorded since the song was opened (change:
 * practice-sessions), each with its time, score and part, its recording to
 * play, a note that saves as you type, a 1–5 rating, and a way to drop the
 * recording while keeping the attempt. `session` is usePracticeSession's
 * return value.
 */
function SessionAttempts({ supabase, session }) {
  const { session: row, attempts, patchAttempt, storage, refreshStorage } = session
  if (!row && attempts.length === 0) return null

  return (
    <section className="session-attempts" aria-labelledby="session-attempts-title">
      <div className="session-attempts__head">
        <h3 id="session-attempts-title" className="session-attempts__title">
          This session
        </h3>
        {row?.ended_at && <span className="session-attempts__hint">Ended after 30 min without an attempt; the next one starts a new session.</span>}
        {session.startNew && attempts.length > 0 && (
          <button type="button" className="session-attempts__new" onClick={session.startNew}>
            New session
          </button>
        )}
      </div>
      {attempts.length === 0 ? (
        <p className="session-attempts__hint">Attempts you record now are kept here, and in Practice sessions later.</p>
      ) : (
        <ol className="session-attempts__list">
          {attempts.map((attempt, i) => (
            <AttemptRow
              key={attempt.id}
              index={i + 1}
              attempt={attempt}
              supabase={supabase}
              onChange={(patch) => patchAttempt(attempt.id, patch)}
              onRecordingDeleted={refreshStorage}
            />
          ))}
        </ol>
      )}
      <RecordingBudget storage={storage} />
    </section>
  )
}

/** "Recordings: 3.4 MB of 100 MB" with a bar. */
export function RecordingBudget({ storage }) {
  if (!storage) return null
  const budget = budgetOf(storage.used_bytes, storage.cap_bytes)
  return (
    <p className={`session-budget ${budget.fraction > 0.9 ? 'session-budget--high' : ''}`}>
      <span className="session-budget__bar" aria-hidden="true">
        <span style={{ width: `${Math.round(budget.fraction * 100)}%` }} />
      </span>
      <span>
        Recordings: {formatBytes(budget.used)} of {formatBytes(budget.cap)}
        {budget.full ? ' · full. Delete some to keep new ones.' : ''}
      </span>
    </p>
  )
}

/**
 * One attempt with its feedback controls. `attempt` is a shared_attempt row
 * (or a SessionAttempt, which may already carry `recording_url`).
 * `onChange(patch)` reports what was saved so the parent's copy stays right.
 * `actions` go at the end of the row's first line; `showAudio` false leaves
 * the recording to the caller (an opened attempt already has a player).
 */
export function AttemptRow({ attempt, index, supabase, onChange, onRecordingDeleted, actions = null, showAudio = true, className = '' }) {
  const [note, setNote] = useState(attempt.self_note ?? '')
  const [noteState, setNoteState] = useState('idle') // idle | saving | saved | error
  const [rating, setRating] = useState(attempt.rating ?? null)
  const [audioUrl, setAudioUrl] = useState(attempt.recording_url ?? null)
  const [audioError, setAudioError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  // The latest onChange, for the debounced save made once per attempt.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // The debounced save, one per attempt; leaving the row saves what is pending.
  const autosave = useRef(null)
  useEffect(() => {
    const save = debounce(async (text) => {
      setNoteState('saving')
      try {
        await saveAttemptFeedback(supabase, attempt.id, { selfNote: text })
        onChangeRef.current?.({ self_note: text.trim() || null })
        setNoteState('saved')
      } catch (err) {
        console.error(err)
        setNoteState('error')
      }
    }, AUTOSAVE_MS)
    autosave.current = save
    return () => {
      save.flush()
      if (autosave.current === save) autosave.current = null
    }
  }, [supabase, attempt.id])

  const changeNote = (text) => {
    setNote(text)
    setNoteState('idle')
    autosave.current?.(text)
  }

  const rate = async (value) => {
    const next = value === rating ? null : value
    setRating(next)
    try {
      await saveAttemptFeedback(supabase, attempt.id, { rating: next })
      onChangeRef.current?.({ rating: next })
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not save the rating.')
      setRating(attempt.rating ?? null)
    }
  }

  const play = async () => {
    setAudioError(null)
    try {
      setAudioUrl(await getRecordingUrl(supabase, attempt))
    } catch (err) {
      console.error(err)
      setAudioError(err.message || 'Could not load the recording.')
    }
  }

  const removeRecording = async () => {
    if (!window.confirm('Delete this recording? The attempt, its score and your note stay.')) return
    setDeleting(true)
    setError(null)
    try {
      await deleteAttemptRecording(supabase, attempt)
      setAudioUrl(null)
      onChangeRef.current?.({ recording_path: null, recording_bytes: null, recording_url: null })
      onRecordingDeleted?.()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not delete the recording.')
    } finally {
      setDeleting(false)
    }
  }

  const noteHint =
    noteState === 'saving' ? 'Saving…' : noteState === 'saved' ? 'Saved' : noteState === 'error' ? 'Could not save' : ''

  return (
    <li className={`attempt-row ${className}`.trim()}>
      <div className="attempt-row__head">
        {index !== undefined && <span className="attempt-row__index">#{index}</span>}
        <strong className="attempt-row__score">{Math.round(Number(attempt.accuracy))}%</strong>
        <span className="attempt-row__meta">
          {attemptTime(attempt.created_at)}
          {attempt.part_name ? ` · ${attempt.part_name}` : ''}
          {attempt.recording_bytes ? ` · ${formatBytes(attempt.recording_bytes)}` : ''}
        </span>
        <span className="attempt-row__rating" role="radiogroup" aria-label="Rate this attempt">
          {RATINGS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} of 5`}
              className={`attempt-row__star ${rating !== null && value <= rating ? 'is-on' : ''}`}
              onClick={() => rate(value)}
            >
              ★
            </button>
          ))}
        </span>
        {actions}
      </div>
      {attemptNotesLine(attempt.verdicts) && <p className="attempt-row__notes">{attemptNotesLine(attempt.verdicts)}</p>}

      {!showAudio ? null : attempt.recording_path ? (
        <div className="attempt-row__audio">
          {audioUrl ? (
            <audio className="attempt-row__player" controls src={audioUrl} autoPlay={!attempt.recording_url} />
          ) : (
            <button type="button" className="attempt-row__button" onClick={play}>
              ▶ Play recording
            </button>
          )}
          <button type="button" className="attempt-row__link" disabled={deleting} onClick={removeRecording}>
            {deleting ? 'Deleting…' : 'Delete recording'}
          </button>
          {audioError && <span className="attempt-row__error">{audioError}</span>}
        </div>
      ) : (
        <span className="attempt-row__hint">No recording kept.</span>
      )}

      <label className="attempt-row__note">
        <span className="attempt-row__note-label">
          Note to self {noteHint && <em className={`attempt-row__note-state attempt-row__note-state--${noteState}`}>{noteHint}</em>}
        </span>
        <textarea
          rows={2}
          maxLength={2000}
          placeholder="What went well, what to work on…"
          value={note}
          onChange={(event) => changeNote(event.target.value)}
          onBlur={() => autosave.current?.flush()}
        />
      </label>
      {error && <span className="attempt-row__error">{error}</span>}
    </li>
  )
}

export default SessionAttempts
