import { useCallback, useEffect, useState } from 'react'
import './PracticeSessions.css'
import { listPracticeSessions, listSessionAttempts, recordingStorageUsed } from '@backend/practiceSessions'
import { sessionLength, sessionSummary } from '../practice/practiceSession.js'
import { AttemptRow, RecordingBudget } from './SessionAttempts.jsx'

/**
 * Previous practice sessions (change: practice-sessions): for one song
 * (`song` = { songId, fingerprint, title }) or, with no song, every song.
 * Each session opens to its attempts with the same feedback controls as
 * "This session", so a note can be written days later too. Keyed by song in
 * VocalTab, so a different song starts it fresh.
 */
function PracticeSessions({ auth, supabase, song }) {
  const [sessions, setSessions] = useState(null)
  const [storage, setStorage] = useState(null)
  const [error, setError] = useState(null)
  const [reloads, setReloads] = useState(0) // bumped to load again (a recording deleted)
  const signedIn = Boolean(auth.configured && auth.user && supabase)
  const songId = song?.songId ?? null
  const fingerprint = song?.fingerprint ?? null

  const fetchAll = useCallback(
    () =>
      Promise.all([
        listPracticeSessions(supabase, { songId, songFingerprint: songId ? null : fingerprint }),
        recordingStorageUsed(supabase),
      ]),
    [supabase, songId, fingerprint],
  )

  useEffect(() => {
    if (!signedIn) return undefined
    let live = true
    fetchAll().then(
      ([list, used]) => {
        if (!live) return
        setSessions(list)
        setStorage(used)
        setError(null)
      },
      (err) => {
        console.error(err)
        if (live) setError(err.message || 'Could not load your practice sessions.')
      },
    )
    return () => {
      live = false
    }
  }, [signedIn, fetchAll, reloads])
  const load = () => setReloads((n) => n + 1)

  if (!auth.configured) {
    return <p className="practice-sessions__hint">Practice sessions need the cloud, which isn’t configured on this copy of the app.</p>
  }
  if (!auth.ready) return <p className="practice-sessions__hint">Checking your sign-in…</p>
  if (!auth.user) return <p className="practice-sessions__hint">Sign in on the Home tab to keep your practice sessions.</p>

  return (
    <div className="practice-sessions">
      <p className="practice-sessions__intro">
        {song ? (
          <>
            Every sitting at <strong>{song.title}</strong>, newest first, with its attempts and your notes.
          </>
        ) : (
          'Every sitting at a song, newest first, with its attempts and your notes.'
        )}
      </p>
      {error && <p className="practice-sessions__error">{error}</p>}
      {sessions === null && !error && <p className="practice-sessions__hint">Loading…</p>}
      {sessions?.length === 0 && (
        <p className="practice-sessions__hint">
          No sessions yet. Open a song and record an attempt; each sitting shows up here.
        </p>
      )}
      {sessions?.length > 0 && (
        <ul className="practice-sessions__list">
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} supabase={supabase} showSong={!song} onRecordingDeleted={load} />
          ))}
        </ul>
      )}
      <RecordingBudget storage={storage} />
    </div>
  )
}

function SessionItem({ session, supabase, showSong, onRecordingDeleted }) {
  const [open, setOpen] = useState(false)
  const [attempts, setAttempts] = useState(null) // with signed URLs once opened
  const [error, setError] = useState(null)
  const summary = sessionSummary(session.attempts)
  const started = new Date(session.started_at)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (!next || attempts) return
    try {
      setAttempts(await listSessionAttempts(supabase, session.id))
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not load the attempts.')
    }
  }

  const patch = (id, changes) => setAttempts((list) => list?.map((a) => (a.id === id ? { ...a, ...changes } : a)) ?? list)

  return (
    <li className="practice-session">
      <button type="button" className="practice-session__head" aria-expanded={open} onClick={toggle}>
        <span className="practice-session__when">
          {started.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          <small>
            {started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {sessionLength(session)}
            {session.ended_at ? '' : ' · open'}
          </small>
        </span>
        {showSong && <span className="practice-session__song">{session.song_title}</span>}
        <span className="practice-session__summary">
          {summary ? (
            <>
              {summary.attempts} {summary.attempts === 1 ? 'attempt' : 'attempts'} · best <strong>{summary.best}%</strong>
              {summary.attempts > 1 ? ` · mean ${summary.mean}%` : ''}
              {summary.recordings ? ` · ${summary.recordings} ${summary.recordings === 1 ? 'recording' : 'recordings'}` : ''}
            </>
          ) : (
            'no attempts'
          )}
        </span>
        <span className="practice-session__chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="practice-session__body">
          {error && <p className="practice-sessions__error">{error}</p>}
          {!attempts && !error && <p className="practice-sessions__hint">Loading…</p>}
          {attempts?.length === 0 && <p className="practice-sessions__hint">No attempts in this session.</p>}
          {attempts?.length > 0 && (
            <ol className="session-attempts__list">
              {attempts.map((attempt, i) => (
                <AttemptRow
                  key={attempt.id}
                  index={i + 1}
                  attempt={attempt}
                  supabase={supabase}
                  onChange={(changes) => patch(attempt.id, changes)}
                  onRecordingDeleted={onRecordingDeleted}
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}

export default PracticeSessions
