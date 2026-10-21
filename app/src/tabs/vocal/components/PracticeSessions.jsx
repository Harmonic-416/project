import { useCallback, useEffect, useState } from 'react'
import './PracticeSessions.css'
import { listPracticeSessions, listSessionAttempts, recordingStorageUsed } from '@backend/practiceSessions'
import { timeAgo } from '../../home/homeFormat.js'
import { groupSessionsBySong, sessionLength, sessionSummary } from '../practice/practiceSession.js'
import { AttemptRow, RecordingBudget } from './SessionAttempts.jsx'

const INSTRUMENT = { guitar: 'Guitar', voice: 'Vocal' }

/**
 * Previous practice sessions (change: practice-sessions), one card per
 * song: the song with a summary (times practised, attempts, best, last
 * practised), and under it that song's sessions newest first, each a
 * compact row that opens to its attempts with the same feedback controls
 * as "This session". For one song (`song` = { songId, fingerprint, title },
 * from the song's toolbar or Home) only that card, open; for every song
 * (from the library) the most recently practised card is open. Keyed by
 * song in VocalTab, so a different song starts it fresh.
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

  const songs = sessions ? groupSessionsBySong(sessions) : null

  return (
    <div className="practice-sessions">
      <p className="practice-sessions__intro">
        {song ? (
          <>
            Every sitting at <strong>{song.title}</strong>, newest first, with its attempts and your notes.
          </>
        ) : (
          'Each song you’ve practised, with every sitting, its attempts and your notes.'
        )}
      </p>
      {error && <p className="practice-sessions__error">{error}</p>}
      {songs === null && !error && <p className="practice-sessions__hint">Loading…</p>}
      {songs?.length === 0 && (
        <p className="practice-sessions__hint">
          {song ? 'No sessions at this song yet.' : 'No sessions yet.'} Open a song and record an attempt; each sitting shows up here.
        </p>
      )}
      {songs?.length > 0 && (
        <ul className="practice-sessions__list">
          {songs.map((entry, i) => (
            <SongCard key={entry.key} entry={entry} supabase={supabase} openAtFirst={Boolean(song) || i === 0} onRecordingDeleted={load} />
          ))}
        </ul>
      )}
      <RecordingBudget storage={storage} />
    </div>
  )
}

/** One song: its summary, and its sessions underneath (the latest open). */
function SongCard({ entry, supabase, openAtFirst, onRecordingDeleted }) {
  const [open, setOpen] = useState(openAtFirst)
  const { summary } = entry

  return (
    <li className="practice-song">
      <button type="button" className="practice-song__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="practice-song__title">
          {entry.song_title}
          <small>{INSTRUMENT[entry.instrument] ?? entry.instrument}</small>
        </span>
        <span className="practice-song__summary">
          Practised {summary.times} {summary.times === 1 ? 'time' : 'times'} · {summary.attempts}{' '}
          {summary.attempts === 1 ? 'attempt' : 'attempts'} · best <strong>{summary.best}%</strong> · last {timeAgo(summary.lastPractised)}
        </span>
        <span className="practice-session__chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ol className="practice-song__sessions">
          {entry.sessions.map((session, i) => (
            <SessionItem key={session.id} session={session} supabase={supabase} openAtFirst={i === 0} onRecordingDeleted={onRecordingDeleted} />
          ))}
        </ol>
      )}
    </li>
  )
}

/** One sitting: a compact row that opens to its attempts. */
function SessionItem({ session, supabase, openAtFirst, onRecordingDeleted }) {
  const [open, setOpen] = useState(openAtFirst)
  const [attempts, setAttempts] = useState(null) // with signed URLs once opened
  const [error, setError] = useState(null)
  const summary = sessionSummary(session.attempts)
  const started = new Date(session.started_at)

  useEffect(() => {
    if (!open || attempts) return undefined
    let live = true
    listSessionAttempts(supabase, session.id).then(
      (rows) => live && setAttempts(rows),
      (err) => {
        console.error(err)
        if (live) setError(err.message || 'Could not load the attempts.')
      },
    )
    return () => {
      live = false
    }
  }, [open, attempts, supabase, session.id])

  const patch = (id, changes) => setAttempts((list) => list?.map((a) => (a.id === id ? { ...a, ...changes } : a)) ?? list)

  return (
    <li className="practice-session">
      <button type="button" className="practice-session__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="practice-session__when">
          {started.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
          {started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          <small>
            {sessionLength(session)}
            {session.ended_at ? '' : ' · open'}
          </small>
        </span>
        <span className="practice-session__summary">
          {summary ? (
            <>
              {summary.attempts} {summary.attempts === 1 ? 'attempt' : 'attempts'} · best <strong>{summary.best}%</strong>
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
