# Tasks

The order follows dependencies: the schema, then the backend helper it is tested through, then the app, then checks. (M) is must and (S) is should.

## 1. Schema (migration 0014)

- [x] 1.1 (M) `practice_session` table with owner-only RLS, `(user_id, started_at desc)` index, song reference by `song_id` or `song_fingerprint`.
- [x] 1.2 (M) `shared_attempt.session_id` (nullable, `on delete set null`), `self_note` (≤ 2000 chars), `rating` (1..5), `recording_bytes` (≥ 0); partial index `(session_id, created_at)`.
- [x] 1.3 (M) Budget: `recording_budget_bytes()`, `recording_storage_used()`, and the `shared_attempt_recording_budget` trigger that refuses a recording past the cap while letting rows without audio through. `recordings` bucket `file_size_limit` = 25 MB.
- [x] 1.4 (M) `end_practice_session(id, at)`: ends a session with attempts at `at`, deletes one without. `close_idle_practice_sessions()`: ends the caller's open sessions whose last activity is more than 30 minutes old (at that activity), deletes idle empty ones.
- [x] 1.5 (M) `get_shared_attempt` returns `self_note` / `rating` as null to anyone but the owner.

  Verified by: `tests/backend/practiceSessions.test.ts` (1.1–1.5) and the unchanged `attempts.test.ts` / `social.test.ts` against a local stack.

## 2. Backend (`src/lib`)

- [x] 2.1 (M) `attempts.ts`: `sessionId` on `NewSharedAttempt`; `recording_bytes` written on every upload; budget checked before uploading; `SharedAttempt` type gains the new columns.
- [x] 2.2 (M) `practiceSessions.ts`: `resumePracticeSession` (continue the last session at the song if active within 30 minutes, else start; pure `resumable`), `startPracticeSession`, `endPracticeSession` (RPC; 'ended' | 'deleted' | 'none'), `listPracticeSessions` (with attempts grouped by `groupAttemptsBySession`), `listSessionAttempts` (signed URLs), `saveAttemptFeedback`, `deleteAttemptRecording`, `recordingStorageUsed`, `RECORDING_BUDGET_BYTES`, `IDLE_MS`.

  Verified by: `tests/backend/practiceSessions.test.ts`: the pure grouping and `resumable` always run; the rest (including resume within / after the window, empty-session deletion on end and on idle tidy-up) runs when `SUPABASE_URL` / `SUPABASE_ANON_KEY` point at a project with 0014 applied.

## 3. App (Vocal tab)

- [x] 3.1 (M) `practice/practiceSession.js`: `IDLE_MS`, `lastActivityOf`, `rollover` (reuse / end-and-start), `resumable`, `endTimeFor`, `groupBySession`, `groupSessionsBySong` (per-song summaries, most recently practised first), `keepByDefault`, `budgetOf`, `formatBytes`, `debounce`.

  Verified by: `app/tests/practiceSession.test.js`.
- [x] 3.2 (M) `practice/usePracticeSession.js`: resumes or starts the session when the song is open and the user is signed in (a resumed session brings its attempts into "This session"), hands out the session id to attempts (rolling over when idle), ends it on leave (deleting it if empty), loads storage used.
- [x] 3.3 (M) `ShareAttempt.jsx`: optional `session` prop; saves with `session_id`, reports the saved row, "Keep recording" attaches / deletes the audio and defaults from the budget. Guitar keeps calling it without a session.
- [x] 3.4 (M) `SessionAttempts.jsx`: "This session" under `RecordPanel` with time, score, part, play, autosaving note, rating, delete recording, storage used.
- [x] 3.5 (M) `PracticeSessions.jsx`: one card per song (summary line) with its sessions underneath as compact rows that expand to their attempts with the same feedback controls; the latest session open, and only the chosen song's card when opened for one song. Reached from the song library (every song), the open song's toolbar and Home's "Working on" (`App.jsx` → `VocalTab` `sessionsToOpen`).

  Verified by: `npm --prefix app run lint`, `npm --prefix app test`, `npm --prefix app run build`, and a run in the browser (Playwright) against a local Supabase stack: open a song → record → "This session" row with the kept recording → note autosaves, rating saves, play through a signed URL → untick "Keep recording" frees the budget → Sessions view shows one song card with the sitting under it → "← Songs" ends it → reopening within the window resumes the same session with its attempt → leaving a song without an attempt leaves no session row → Home's "Working on" opens the view.

## 4. Integration

- [x] 4.1 (M) `npm run lint`, `npm run typecheck`, `npm test`, and the app's lint / test / build pass.
- [x] 4.2 (M) 0014 is applied to the live project by CI's `migrate` job on merge to `main`, after Eddie's OK; nobody runs `supabase db push` by hand.
- [ ] 4.3 (S) Decide on the open questions in design.md (Guitar sessions; pre-0014 attempts in the sessions view).

## 5. Follow-up: persistent runs, note counts, New session (migration 0015)

- [x] 5.1 (M) Migration `0015_practice_runs.sql`: `practice_run` (song fingerprint, part, accompaniment, mode `wait` | `trouble`, score, note counts `notes_total/right/half/missed`, optional `session_id` that must be one of the caller's own sessions); owner-only RLS; chart and session indexes.
- [x] 5.2 (S) `src/lib/practiceRuns.ts`: `savePracticeRun`, `listPracticeRuns` (one chart, oldest first, latest 50), `listSessionRuns`.
- [x] 5.3 (M) Wait for me / Trouble spots runs (`sessionRuns.js`) move from sessionStorage to localStorage, and for a signed-in user are saved to and loaded from the account, with their note counts and the open session.
- [x] 5.4 (S) Recorded attempts save their per-note verdicts (`judgeNotes` → `shared_attempt.verdicts`); attempt rows show "N of M notes hit · K missed".
- [x] 5.5 (S) The sessions view lists each session's scored runs with their note counts.
- [x] 5.6 (S) New session: `usePracticeSession().startNew()` and a `freshStart` ref; "New session" under This session, and "Practise" / "+ New session" on each song card in Practice sessions.

  Verified by: backend suite against a local stack with 0001–0015 (`tests/backend/practiceRuns.test.ts`), app lint / test / build, and a browser run: the sessions view shows "6 of 8 notes hit · 2 missed" and both scored runs with their note lines; Practise resumes a recent session with its attempt; New session ends it at its last attempt and starts a new row; "+ New session" from the song's toolbar deletes the empty sitting and starts a new one.
