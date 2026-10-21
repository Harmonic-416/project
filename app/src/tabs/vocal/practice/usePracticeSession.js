import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { endPracticeSession, recordingStorageUsed, startPracticeSession } from '@backend/practiceSessions'
import { endTimeFor, lastActivityOf, msUntilIdle, rollover } from './practiceSession.js'

/**
 * The live practice session at the open song (change: practice-sessions).
 *
 * While `enabled` (a signed-in user with the score ready) a session row is
 * started for `song` and ended when the song changes, the view is left, or
 * the tab unmounts. Attempts ask `ensureSessionId()` for the id to save
 * under; that is where the idle rule runs: more than 30 minutes after the
 * last attempt, the open session is ended at that attempt and a new one
 * started. A timer does the same without an attempt, so "This session"
 * empties.
 *
 *   song: { songId, fingerprint, title } (songId wins over fingerprint)
 *
 * Returns { session, attempts, ensureSessionId, addAttempt, patchAttempt,
 *           storage, refreshStorage, error }.
 */
export function usePracticeSession({ supabase, userId, song, instrument = 'voice', enabled = true }) {
  const [session, setSession] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [storage, setStorage] = useState(null)
  const [error, setError] = useState(null)
  // The row (or its insert in flight) that attempts attach to.
  const current = useRef(null) // { id, startedAt, promise }
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

  /** Start a session now; its id is known at once, the row follows. */
  const begin = useCallback(() => {
    const id = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const promise = startPracticeSession(supabase, {
      id,
      startedAt,
      songId,
      songFingerprint: songId ? null : fingerprint,
      songTitle: title,
      instrument,
    })
    const entry = { id, startedAt, promise }
    current.current = entry
    attemptsRef.current = []
    setAttempts([])
    setSession({ id, started_at: startedAt, ended_at: null, pending: true })
    setError(null)
    promise.then(
      (row) => {
        if (current.current === entry) setSession(row)
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
  }, [supabase, songId, fingerprint, title, instrument])

  /** End the given entry at `endedAt` (default: now, or its last activity if idle). */
  const finish = useCallback(
    (entry, endedAt) => {
      if (!entry) return
      const at = endedAt ?? endTimeFor({ started_at: entry.startedAt, attempts: attemptsRef.current })
      entry.promise.then(() => endPracticeSession(supabase, entry.id, at)).catch((err) => console.error(err))
    },
    [supabase],
  )

  // One session per song while active. Deferred a tick so StrictMode's
  // mount/unmount/mount in development doesn't leave a 0-minute session.
  useEffect(() => {
    if (!active) return undefined
    let entry = null
    const timer = setTimeout(() => {
      entry = begin()
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
  }, [active, songKey, userId, begin, finish, refreshStorage])

  // Idle without an attempt: end the session at its last activity.
  useEffect(() => {
    if (!session || session.ended_at) return undefined
    const wait = msUntilIdle({ started_at: session.started_at, attempts })
    const timer = setTimeout(() => {
      const entry = current.current
      if (!entry || entry.id !== session.id) return
      const endedAt = new Date(lastActivityOf({ started_at: entry.startedAt, attempts: attemptsRef.current })).toISOString()
      finish(entry, endedAt)
      current.current = null
      setSession((s) => (s && s.id === entry.id ? { ...s, ended_at: endedAt } : s))
    }, wait)
    return () => clearTimeout(timer)
  }, [session, attempts, finish])

  /** The session id to save the next attempt under (null when not signed in). */
  const ensureSessionId = useCallback(async () => {
    if (!active) return null
    const entry = current.current
    const open = entry ? { started_at: entry.startedAt, ended_at: null, attempts: attemptsRef.current } : null
    const next = rollover(open)
    if (next.action === 'reuse') return entry.id
    if (next.action === 'rollover') {
      finish(entry, next.endedAt)
      current.current = null
    }
    const fresh = begin()
    await fresh.promise
    return fresh.id
  }, [active, begin, finish])

  /** A saved attempt row: shown under "This session" if it belongs to it. */
  const addAttempt = useCallback((row) => {
    if (!row || !current.current || row.session_id !== current.current.id) return
    attemptsRef.current = [...attemptsRef.current, row]
    setAttempts(attemptsRef.current)
  }, [])

  const patchAttempt = useCallback((id, patch) => {
    attemptsRef.current = attemptsRef.current.map((a) => (a.id === id ? { ...a, ...patch } : a))
    setAttempts(attemptsRef.current)
  }, [])

  return useMemo(
    () => ({ session, attempts, ensureSessionId, addAttempt, patchAttempt, storage, refreshStorage, error }),
    [session, attempts, ensureSessionId, addAttempt, patchAttempt, storage, refreshStorage, error],
  )
}
