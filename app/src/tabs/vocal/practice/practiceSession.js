/**
 * Pure helpers behind practice sessions (no DOM, no Supabase), unit-tested
 * in app/tests/practiceSession.test.js: when a session ends or rolls over,
 * what "This session" shows, and the recording budget.
 *
 * A session starts when a signed-in user opens a song to practise and ends
 * when they leave it, or after IDLE_MS without an attempt (then at its last
 * activity). The rows live in Supabase (src/lib/practiceSessions.ts).
 */

/** 30 minutes without an attempt ends a session. */
export const IDLE_MS = 30 * 60 * 1000

/** Must match recording_budget_bytes() in migration 0014. */
export const RECORDING_BUDGET_BYTES = 100 * 1024 * 1024

const ms = (when) => (typeof when === 'number' ? when : new Date(when).getTime())

/**
 * When a session was last active: its start, or its latest attempt.
 * `session` is { started_at, attempts?: [{ created_at }] }; epoch ms.
 */
export function lastActivityOf(session) {
  let last = ms(session.started_at)
  for (const attempt of session.attempts ?? []) last = Math.max(last, ms(attempt.created_at))
  return last
}

/** True when the session has had no attempt for IDLE_MS (or longer). */
export function isIdle(session, now = Date.now(), idleMs = IDLE_MS) {
  return now - lastActivityOf(session) >= idleMs
}

/**
 * When a session should end: `now` if it is still active, else its last
 * activity (an idle session ends when it stopped, not when we noticed).
 * Returns an ISO string.
 */
export function endTimeFor(session, now = Date.now(), idleMs = IDLE_MS) {
  return new Date(isIdle(session, now, idleMs) ? lastActivityOf(session) : now).toISOString()
}

/**
 * What to do when an attempt is about to be saved: keep the open session,
 * or end it (at its last activity) and start a new one because it went
 * idle. `current` is null when there is no session yet.
 *
 *   { action: 'reuse' }
 *   { action: 'start' }                       — nothing open
 *   { action: 'rollover', endedAt: ISO }      — idle: end current, start new
 */
export function rollover(current, now = Date.now(), idleMs = IDLE_MS) {
  if (!current || current.ended_at) return { action: 'start' }
  if (isIdle(current, now, idleMs)) return { action: 'rollover', endedAt: endTimeFor(current, now, idleMs) }
  return { action: 'reuse' }
}

/** Milliseconds until the open session goes idle (0 if it already has). */
export function msUntilIdle(session, now = Date.now(), idleMs = IDLE_MS) {
  return Math.max(0, lastActivityOf(session) + idleMs - now)
}

/**
 * Whether opening the song now should continue `session` rather than start
 * a new one: it was active (open: its start or last attempt; ended: its
 * end) less than IDLE_MS ago. The same rule as rollover, seen from the
 * other side.
 */
export function resumable(session, now = Date.now(), idleMs = IDLE_MS) {
  if (!session) return false
  const last = session.ended_at ? ms(session.ended_at) : lastActivityOf(session)
  return now - last < idleMs
}

/** Stable key for a song: instrument + catalog id, else the file's fingerprint, else the title. */
export function songKeyOf(session) {
  return `${session.instrument ?? 'voice'}:${session.song_id ?? session.song_fingerprint ?? session.song_title}`
}

/** When a session was last practised: its end, or its last attempt / start. Epoch ms. */
export function lastPractisedOf(session) {
  return session.ended_at ? Math.max(ms(session.ended_at), lastActivityOf(session)) : lastActivityOf(session)
}

/**
 * One entry per song for the Practice sessions view: the song, its sessions
 * (newest first, each with `attempts`), and a summary — how many times it
 * was practised (sessions with at least one attempt), attempts in all, best
 * score and when it was last practised. Songs come most recently practised
 * first. Sessions without attempts are left out (they shouldn't exist, but
 * an old open tab may still hold one).
 */
export function groupSessionsBySong(sessions) {
  const bySong = new Map()
  for (const session of sessions) {
    if (!session.attempts?.length) continue
    const key = songKeyOf(session)
    let entry = bySong.get(key)
    if (!entry) {
      entry = {
        key,
        song_id: session.song_id ?? null,
        song_fingerprint: session.song_fingerprint ?? null,
        song_title: session.song_title,
        instrument: session.instrument ?? 'voice',
        sessions: [],
      }
      bySong.set(key, entry)
    }
    entry.sessions.push(session)
  }
  const round1 = (n) => Math.round(n * 10) / 10
  return [...bySong.values()]
    .map((entry) => {
      const sessionsSorted = [...entry.sessions].sort((a, b) => ms(b.started_at) - ms(a.started_at))
      const attempts = sessionsSorted.flatMap((s) => s.attempts)
      return {
        ...entry,
        sessions: sessionsSorted,
        summary: {
          times: sessionsSorted.length,
          attempts: attempts.length,
          best: round1(Math.max(...attempts.map((a) => Number(a.accuracy)))),
          lastPractised: new Date(Math.max(...sessionsSorted.map(lastPractisedOf))).toISOString(),
        },
      }
    })
    .sort((a, b) => ms(b.summary.lastPractised) - ms(a.summary.lastPractised))
}

/**
 * Attempts under their session (oldest first within a session); sessions
 * keep the order given. Attempts with no session (from before 0014) are
 * returned separately as `orphans`, newest first.
 */
export function groupBySession(sessions, attempts) {
  const bySession = new Map(sessions.map((s) => [s.id, []]))
  const orphans = []
  for (const attempt of attempts) {
    const list = attempt.session_id ? bySession.get(attempt.session_id) : null
    if (list) list.push(attempt)
    else orphans.push(attempt)
  }
  const byTime = (a, b) => ms(a.created_at) - ms(b.created_at)
  return {
    sessions: sessions.map((s) => ({ ...s, attempts: [...bySession.get(s.id)].sort(byTime) })),
    orphans: orphans.sort((a, b) => byTime(b, a)),
  }
}

/** Best, latest and mean accuracy of a session's attempts (null with none). */
export function sessionSummary(attempts) {
  if (!attempts?.length) return null
  const scores = attempts.map((a) => Number(a.accuracy))
  const round1 = (n) => Math.round(n * 10) / 10
  return {
    attempts: attempts.length,
    best: round1(Math.max(...scores)),
    latest: round1(scores[scores.length - 1]),
    mean: round1(scores.reduce((sum, n) => sum + n, 0) / scores.length),
    recordings: attempts.filter((a) => a.recording_path).length,
  }
}

// ── recording budget ────────────────────────────────────────────────────

/** How full the budget is: { used, cap, remaining, fraction, full }. */
export function budgetOf(usedBytes, capBytes = RECORDING_BUDGET_BYTES) {
  const used = Math.max(0, Number(usedBytes) || 0)
  const cap = Math.max(0, Number(capBytes) || RECORDING_BUDGET_BYTES)
  const remaining = Math.max(0, cap - used)
  return { used, cap, remaining, fraction: cap ? Math.min(1, used / cap) : 1, full: remaining === 0 }
}

/** True when a recording of `bytes` fits what is left of the budget. */
export function fitsBudget(bytes, usedBytes, capBytes = RECORDING_BUDGET_BYTES) {
  return Number(bytes) > 0 && budgetOf(usedBytes, capBytes).remaining >= Number(bytes)
}

/**
 * Whether "Keep recording" starts ticked for a new attempt: yes while the
 * recording fits the remaining budget, no once it doesn't. When the usage
 * isn't known yet (null) it starts ticked and the database has the last
 * word.
 */
export function keepByDefault(recordingBytes, storage) {
  if (!recordingBytes) return false
  if (!storage) return fitsBudget(recordingBytes, 0)
  return fitsBudget(recordingBytes, storage.used_bytes ?? storage.used, storage.cap_bytes ?? storage.cap)
}

/** "0 B", "512 KB", "3.4 MB", "100 MB". */
export function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  const mb = n / (1024 * 1024)
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`
}

// ── autosave ────────────────────────────────────────────────────────────

/**
 * Call `fn` with the latest arguments once `wait` ms have passed without
 * another call. `.flush()` runs a pending call now; `.cancel()` drops it.
 */
export function debounce(fn, wait, { setTimeout: schedule = globalThis.setTimeout, clearTimeout: clear = globalThis.clearTimeout } = {}) {
  let timer = null
  let pending = null
  const run = () => {
    timer = null
    const args = pending
    pending = null
    if (args) fn(...args)
  }
  const debounced = (...args) => {
    pending = args
    if (timer !== null) clear(timer)
    timer = schedule(run, wait)
  }
  debounced.flush = () => {
    if (timer === null) return
    clear(timer)
    run()
  }
  debounced.cancel = () => {
    if (timer !== null) clear(timer)
    timer = null
    pending = null
  }
  return debounced
}

/** "10:42" for the time an attempt was made (today), else "Oct 3, 10:42". */
export function attemptTime(when, now = Date.now()) {
  const date = new Date(ms(when))
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const today = new Date(now)
  const sameDay =
    date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
  return sameDay ? time : `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}

/** "12 min" / "1 h 05 min" between a session's start and end (or now). */
export function sessionLength(session, now = Date.now()) {
  const minutes = Math.max(0, Math.round((ms(session.ended_at ?? now) - ms(session.started_at)) / 60000))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h} h ${String(m).padStart(2, '0')} min`
}
