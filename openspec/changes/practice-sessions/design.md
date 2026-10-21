# Design: Practice Sessions

## Context

Since 0010 every finished attempt of a signed-in user is a `shared_attempt` row (pitch trace, score, part, optional recording in the private `recordings` bucket under `<user_id>/<attempt_id>.webm`). Home groups those rows by song. This change adds the level above an attempt (a session), the player's own feedback on an attempt, and a budget for the audio, which is the only part with a real cost on the Free plan.

## Supabase plan limits (verified 2026-10-21)

From Supabase's own pages, read on 2026-10-21:

| | Free | Pro |
|---|---|---|
| Price | $0 | from $25 / month |
| File storage included | **1 GB** | 100 GB, then $0.0213 per GB |
| Egress included | **5 GB / month** | 250 GB, then $0.09 per GB |
| Database size | 500 MB | 8 GB, then $0.125 per GB |
| Monthly active users | 50,000 | 100,000, then $0.00325 per MAU |
| Max size of one uploaded file | **50 MB** (global limit can't be raised above this) | up to 500 GB (configurable) |

Sources:
- Pricing page: https://supabase.com/pricing (storage, egress, database, MAU and the per-plan max file upload size).
- Storage file limits: https://supabase.com/docs/guides/storage/uploads/file-limits (the global file size limit is set in Storage settings, "can't exceed 50 MB" on Free and "up to 500 GB" on Pro; a bucket may set a smaller limit than the global one).

Third-party summaries found in the same search disagree with each other (500 MB vs 1 GB of Free storage, 50 vs 250 GB of Pro egress); the table above uses Supabase's pages only.

### What that means for recordings

MediaRecorder's webm/opus is roughly 0.5–1 MB per minute. On Free:

- **1 GB of storage in all.** A 100 MB per-user cap (about 100–200 minutes of singing) lets ten users fill the project. That is fine for the course project's user count, and the cap lives in one SQL function (`recording_budget_bytes()`) so it is one line to lower, or to raise on Pro.
- **5 GB of egress a month.** Playing a recording back downloads it; at 1 MB a minute that is about 80 hours of listening a month across all users before the limit, so playback isn't the concern storage is. Signed URLs are minted on demand (one per play, or one batch per session opened), not for every row listed.
- **50 MB per file.** Never reached by one attempt; the `recordings` bucket gets a 25 MB `file_size_limit` anyway so a runaway recording can't eat a quarter of a user's budget in one go.
- **Database size** is unaffected: the rows added here are small (a pitch trace is capped at 30,000 samples by 0005, as before).

## Goals / Non-Goals

- **Goal:** a session is a real row, so it reads the same on every device, and attempts in it are found by `session_id` rather than by guessing from timestamps.
- **Goal:** audio is opt-in and capped at the database; scores, traces and feedback are never dropped to make room.
- **Goal:** the owner's feedback is theirs: it doesn't leak through `get_shared_attempt` to a friend or a link.
- **Non-goal:** server-side detection of idle sessions on a timer. Supabase has no cron on Free; the client ends sessions, and a session left open (tab closed) is closed lazily the next time its owner starts one.
- **Non-goal:** counting bytes in the bucket itself. Storage policies can't see a file's size at insert time reliably, so the count is kept on `shared_attempt.recording_bytes` and the upload is removed again if the row is refused.

## Decisions

### Data model (migration 0014)

```
practice_session
  id uuid pk, user_id uuid -> auth.users (default auth.uid())
  song_id uuid? -> song, song_fingerprint text? (sha-256 hex), song_title text
  instrument text ('voice' | 'guitar', default 'voice')
  started_at timestamptz (default now()), ended_at timestamptz?  (ended_at >= started_at)
  title text?, notes text?
  check: song_id or song_fingerprint
  index (user_id, started_at desc)

shared_attempt +
  session_id uuid? -> practice_session on delete set null
  self_note text? (<= 2000 chars), rating smallint? (1..5)
  recording_bytes integer? (>= 0)
  index (session_id, created_at) where session_id is not null
```

Owner-only RLS on `practice_session` (`for all`, `auth.uid() = user_id`), like `guitar_progress`. The existing `shared_attempt_own` policy already lets the owner update the new columns.

**Why 0014:** 0013 is `guitar_progress` on `main`. The task named 0013; the number moved, nothing else.

### Session boundaries

A session is owned by the client that practises:

- **Start:** the Vocal tab's detail view, once the notation is ready and the user is signed in, calls `startPracticeSession`. The id is made client-side (`crypto.randomUUID()`) so an attempt finished while the insert is in flight can wait on the same promise and attach to it.
- **Attach:** `ShareAttempt` saves each attempt with the session's id. Before saving it asks the session hook for the id, which is also where the idle rule runs.
- **Idle (30 min):** `lastActivity` is the later of `started_at` and the last attempt. If a new attempt comes more than 30 minutes after that, the open session is ended **at `lastActivity`** and a new one starts for the attempt. A 30-minute timer in the page does the same without an attempt, so "This session" empties. The rule is a pure function (`practiceSession.js: rollover`) so it is unit-tested.
- **End:** leaving the song (back, closing a shared attempt, unmount, song change) sets `ended_at = now()`, or `lastActivity` if idle.
- **Stale sessions:** `close_idle_practice_sessions()` (SQL, called by `startPracticeSession`) ends any open session of the caller whose last activity is older than 30 minutes, at that activity. A closed tab therefore never leaves a session open for days.

### Owner feedback

`self_note` and `rating` are columns on the attempt, not a table of their own: there is exactly one owner and one note per attempt, and the sessions view reads attempts in one query. `get_shared_attempt` is re-created to return the row with those two fields nulled unless `auth.uid()` is the owner (`jsonb_populate_record` over `to_jsonb(a)` so the function needn't list columns and stays `setof public.shared_attempt`).

### Recording budget

- `recording_budget_bytes()` returns 100 MiB; `recording_storage_used()` returns `{ used_bytes, cap_bytes, recordings }` for the caller from `sum(recording_bytes)`.
- Trigger `shared_attempt_recording_budget` (before insert or update of `recording_path, recording_bytes`): when the new row carries bytes, the sum over the owner's *other* rows plus the new bytes must stay within the cap, else `raise exception` with sqlstate `P0001` and a message the app shows as is. Rows without a recording never trip it, so scores are always saved.
- `attempts.ts` sets `recording_bytes = blob.size` wherever it uploads, checks the budget first (one RPC) so it doesn't upload something the row will refuse, and removes the upload if the insert still fails (the existing behaviour).
- **Opt-in:** the "Keep recording" toggle in `ShareAttempt` defaults to on when the blob fits the remaining budget and off otherwise (`practiceSession.js: keepByDefault`). Ticking it attaches the recording; unticking after it was attached deletes it. The attempt row is saved either way.
- **Delete a recording:** `deleteAttemptRecording` nulls `recording_path` / `recording_bytes` first (the budget is freed and the list is consistent even if the next step fails), then removes the object. An orphaned object is harmless to the count and can be swept by hand.
- **Why not a storage policy:** `storage.objects.metadata->>'size'` is written after the object row, so a `with check` on insert can't use it; the row-level count is the one that can be enforced.

### Listing

- `listPracticeSessions(supabase, { songId | songFingerprint, limit })`: the caller's sessions newest first, one query. A second query fetches the attempts of those sessions (summary columns: no pitch trace) and `groupAttemptsBySession` (pure) puts them under their session, oldest first. No PostgREST aggregates, which hosted projects don't enable by default.
- `listSessionAttempts(supabase, sessionId)`: one session's attempts with `recording_url` from one `createSignedUrls` call (10 minutes). The sessions view calls it when a session is expanded.

### App

- `usePracticeSession({ supabase, userId, song })` owns the live session: `session`, `attempts` (this session, newest last), `ensureSessionId()`, `addAttempt`, `patchAttempt`, `storage` (`{ used, cap }`), and ends the session on cleanup.
- `SessionAttempts` renders "This session" under `RecordPanel`: each row has time, score, part, a play button (signed URL fetched on first play, `<audio>`), a textarea whose value autosaves 600 ms after the last keystroke (`debounce` in `practiceSession.js`), five rating buttons, and "Delete recording". A line under the list shows storage used.
- `PracticeSessions` is a Vocal view (`view === 'sessions'`): sessions for one song (from the song library's "Practice sessions" row with a song chosen, or from Home's "Working on" card) or for all songs. Sessions expand to their attempts with the same feedback controls, so a note written days later is as easy as one written right away.
- Home → Vocal: `App.jsx` gets `openSessions({ songId, songFingerprint, songTitle })`, passed to `VocalTab` as `sessionsToOpen` + `onSessionsOpened`, the way `fileToOpenId` already works.

## Risks / Trade-offs

- **[Risk] Two tabs practising at once open two sessions.** Acceptable: they are two sittings; nothing breaks.
- **[Risk] The budget trigger counts `recording_bytes` the client reported, not the object's real size.** The client is the only writer and the bucket's 25 MB per-file limit bounds any lie; the trigger is a guard against honest overuse, not an adversary.
- **[Risk] `get_shared_attempt` replacement.** It keeps the same signature and return type; the backend tests for shares (0005/0010) run unchanged against it.
- **[Trade-off] Feedback columns on `shared_attempt` rather than a `attempt_feedback` table.** One note per attempt, by its one owner, is a column. A table would only pay off with history or several authors, which are out of scope.

## Migration Plan

Additive, one file, applied by CI's `migrate` job when the branch merges to `main` (never by hand against the linked project). Rollback: `drop trigger`, `drop function`s, `alter table shared_attempt drop column session_id, self_note, rating, recording_bytes`, `drop table practice_session`, restore 0010's `get_shared_attempt` body. No data to migrate: existing attempts simply have `session_id = null`.

## Open Questions

- Whether the Guitar tab should start sessions too (the hook is instrument-agnostic; GuitarTroubleMode would need the same wiring as RecordPanel).
- Whether attempts saved before this change should be shown as "earlier attempts" under the song in the sessions view.
