# Tasks

The order follows dependencies: the schema, then the backend helper it is tested through, then the app, then checks. (M) is must and (S) is should.

## 1. Schema (migration 0014)

- [ ] 1.1 (M) `practice_session` table with owner-only RLS, `(user_id, started_at desc)` index, song reference by `song_id` or `song_fingerprint`.
- [ ] 1.2 (M) `shared_attempt.session_id` (nullable, `on delete set null`), `self_note` (≤ 2000 chars), `rating` (1..5), `recording_bytes` (≥ 0); partial index `(session_id, created_at)`.
- [ ] 1.3 (M) Budget: `recording_budget_bytes()`, `recording_storage_used()`, and the `shared_attempt_recording_budget` trigger that refuses a recording past the cap while letting rows without audio through. `recordings` bucket `file_size_limit` = 25 MB.
- [ ] 1.4 (M) `close_idle_practice_sessions()`: ends the caller's open sessions whose last activity is more than 30 minutes old, at that activity.
- [ ] 1.5 (M) `get_shared_attempt` returns `self_note` / `rating` as null to anyone but the owner.

  Verified by: `tests/backend/practiceSessions.test.ts` (1.1–1.5) and the unchanged `attempts.test.ts` / `social.test.ts` against a local stack.

## 2. Backend (`src/lib`)

- [ ] 2.1 (M) `attempts.ts`: `sessionId` on `NewSharedAttempt`; `recording_bytes` written on every upload; budget checked before uploading; `SharedAttempt` type gains the new columns.
- [ ] 2.2 (M) `practiceSessions.ts`: `startPracticeSession`, `endPracticeSession`, `listPracticeSessions` (with attempts grouped by `groupAttemptsBySession`), `listSessionAttempts` (signed URLs), `saveAttemptFeedback`, `deleteAttemptRecording`, `recordingStorageUsed`, `RECORDING_BUDGET_BYTES`.

  Verified by: `tests/backend/practiceSessions.test.ts`: the pure grouping always runs; the rest runs when `SUPABASE_URL` / `SUPABASE_ANON_KEY` point at a project with 0014 applied.

## 3. App (Vocal tab)

- [ ] 3.1 (M) `practice/practiceSession.js`: `IDLE_MS`, `lastActivityOf`, `rollover` (reuse / end-and-start), `endTimeFor`, `groupBySession`, `keepByDefault`, `budgetOf`, `formatBytes`, `debounce`.

  Verified by: `app/tests/practiceSession.test.js`.
- [ ] 3.2 (M) `practice/usePracticeSession.js`: starts the session when the score is ready and the user is signed in, hands out the session id to attempts (rolling over when idle), ends it on leave, loads storage used.
- [ ] 3.3 (M) `ShareAttempt.jsx`: optional `session` prop; saves with `session_id`, reports the saved row, "Keep recording" attaches / deletes the audio and defaults from the budget. Guitar keeps calling it without a session.
- [ ] 3.4 (M) `SessionAttempts.jsx`: "This session" under `RecordPanel` with time, score, part, play, autosaving note, rating, delete recording, storage used.
- [ ] 3.5 (M) `PracticeSessions.jsx`: the sessions view for a song (or all songs), sessions expand to their attempts with the same feedback controls. Reached from the song library and from Home's "Working on" (`App.jsx` → `VocalTab` `sessionsToOpen`).

  Verified by: `npm --prefix app run lint`, `npm --prefix app test`, `npm --prefix app run build`, and a run in the browser against a local Supabase stack.

## 4. Integration

- [ ] 4.1 (M) `npm run lint`, `npm run typecheck`, `npm test`, and the app's lint / test / build pass.
- [ ] 4.2 (M) 0014 is applied to the live project by CI's `migrate` job on merge to `main`, after Eddie's OK; nobody runs `supabase db push` by hand.
- [ ] 4.3 (S) Decide on the open questions in design.md (Guitar sessions; pre-0014 attempts in the sessions view).
