import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { endPracticeSession, recordingStorageUsed, resumePracticeSession, startPracticeSession } from '@backend/practiceSessions'
import { endTimeFor, lastActivityOf, msUntilIdle, rollover } from './practiceSession.js'

/**
 * The live practice session at the open song (change: practice-sessions).
 *
 * While `enabled` (a signed-in user with the song open) the last session at
 * `song` is resumed if it was active less than 30 minutes ago, else a new
 * one is started (resumePracticeSession). It is ended when the song
 * changes, the view is left, or the tab unmounts; a session with no
 * attempts is deleted then. Attempts ask `ensureSessionId()` for the id to
 * save under; that is where the idle rule runs: more than 30 minutes after
 * the last attempt, the open session is ended at that attempt and a new one
 * started. A timer does the same without an attempt, so "This session"
 * empties.
 *
 * `startNew()` ends the current sitting and starts a fresh one at once (the
 * "New session" button). `freshStart` (a ref) asks for the same when the
 * song opens: if it is true then, the next session starts fresh instead of
 * resuming, and the ref is cleared.
 *
 *   song: { songId, fingerprint, title } (songId wins over fingerprint)
 *
 * Returns { session, attempts, ensureSessionId, addAttempt, patchAttempt,
 *           startNew, storage, refreshStorage, error }.
 */
export function usePracticeSession({ supabase, userId, song, instrument = 'voice', enabled = true, freshStart = null }) {
  const [session, setSession] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [storage, setStorage] = useState(null)
  const [error, setError] = useState(null)
  // The sitting attempts attach to: { promise, row } — row once resumed/started.
  const current = useRef(null)
  const attemptsRef = useRef([])

  const songId = song?.songId ?? null
  const fingerprint = song?.fingerprint ?? null
  const title = song?.title ?? ''
  const identifiable = Boolean(songId || fingerprint)
  const active = Boolean(enabled && supabase && userId && identifiable)
  const songKey = `${instrument}:${songId ?? fingerprint ?? ''}`

  const refreshStorage = useCallback(async () => {
    if (!supabase || !userId) return
    try {
      setStorage(await recordingStorageUsed(supabase))
    } catch (err) {
      console.error(err)
    }
  }, [supabase, userId])

  /** Resume (or, `fresh`, start) the session at this song; the row follows. */
  const begin = useCallback(
    (fresh = false) => {
      const details = { songId, songFingerprint: songId ? null : fingerprint, songTitle: title, instrument }
      const promise = fresh
        ? startPracticeSession(supabase, details).then((row) => ({ session: row, attempts: [], resumed: false }))
        : resumePracticeSession(supabase, details)
      const entry = { promise, row: null }
      current.current = entry
      attemptsRef.current = []
      setAttempts([])
      setSession({ id: null, started_at: new Date().toISOString(), ended_at: null, pending: true })
      setError(null)
      promise.then(
        ({ session: row, attempts: rows }) => {
          if (current.current !== entry) return
          entry.row = row
          attemptsRef.current = rows
          setAttempts(rows)
          setSession(row)
        },
        (err) => {
          console.error(err)
          if (current.current === entry) {
            current.current = null
            setSession(null)
            setError(err.message || 'Could not start a practice session.')
          }
        },
      )
      return entry
    },
    [supabase, songId, fingerprint, title, instrument],
  )

  /** End `entry` at `endedAt` (default: now, or its last activity if idle). Empty sessions are deleted. */
  const finish = useCallback(
    (entry, endedAt) => {
      if (!entry) return
      const attemptsThen = attemptsRef.current
      entry.promise
        .then(({ session: row }) =>
          endPracticeSession(supabase, row.id, endedAt ?? endTimeFor({ started_at: row.started_at, attempts: attemptsThen })),
        )
        .catch((err) => console.error(err))
    },
    [supabase],
  )

  // One session per song while active. Deferred a tick so StrictMode's
  // mount/unmount/mount in development doesn't start the sitting twice.
  useEffect(() => {
    if (!active) return undefined
    let entry = null
    const timer = setTimeout(() => {
      const fresh = Boolean(freshStart?.current)
      if (freshStart) freshStart.current = false
      entry = begin(fresh)
      refreshStorage()
    }, 0)
    return () => {
      clearTimeout(timer)
      if (entry && current.current === entry) {
        finish(entry)
        current.current = null
      }
      setSession(null)
      setAttempts([])
      attemptsRef.current = []
    }
    // songKey stands for songId / fingerprint; title and instrument ride along.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, songKey, userId, begin, finish, refreshStorage, freshStart])

  // Idle without an attempt: end the session at its last activity.
  useEffect(() => {
    if (!session || session.pending || session.ended_at) return undefined
    const wait = msUntilIdle({ started_at: session.started_at, attempts })
    const timer = setTimeout(() => {
      const entry = current.current
      if (!entry?.row || entry.row.id !== session.id) return
      const endedAt = new Date(lastActivityOf({ started_at: entry.row.started_at, attempts: attemptsRef.current })).toISOString()
      finish(entry, endedAt)
      current.current = null
      setSession((s) => (s && s.id === entry.row.id ? { ...s, ended_at: endedAt } : s))
    }, wait)
    return () => clearTimeout(timer)
  }, [session, attempts, finish])

  /** The session id to save the next attempt under (null when not signed in). */
  const ensureSessionId = useCallback(async () => {
    if (!active) return null
    const entry = current.current
    if (entry && !entry.row) return (await entry.promise).session.id // still resuming / starting
    const open = entry ? { started_at: entry.row.started_at, ended_at: null, attempts: attemptsRef.current } : null
    const next = rollover(open)
    if (next.action === 'reuse') return entry.row.id
    if (next.action === 'rollover') {
      finish(entry, next.endedAt)
      current.current = null
    }
    return (await begin().promise).session.id
  }, [active, begin, finish])

  /** End this sitting now and start a new one at the same song ("New session"). */
  const startNew = useCallback(() => {
    if (!active) return
    const entry = current.current
    if (entry) finish(entry)
    current.current = null
    begin(true)
  }, [active, begin, finish])

  /** A saved attempt row: shown under "This session" if it belongs to it. */
  const addAttempt = useCallback((row) => {
    const id = current.current?.row?.id
    if (!row || !id || row.session_id !== id) return
    attemptsRef.current = [...attemptsRef.current, row]
    setAttempts(attemptsRef.current)
  }, [])

  const patchAttempt = useCallback((id, patch) => {
    attemptsRef.current = attemptsRef.current.map((a) => (a.id === id ? { ...a, ...patch } : a))
    setAttempts(attemptsRef.current)
  }, [])

  return useMemo(
    () => ({ session, attempts, ensureSessionId, addAttempt, patchAttempt, startNew, storage, refreshStorage, error }),
    [session, attempts, ensureSessionId, addAttempt, patchAttempt, startNew, storage, refreshStorage, error],
  )
}
