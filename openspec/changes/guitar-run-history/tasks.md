# Tasks

(M) is must and (S) is should.

## 1. Schema (migration 0017)

- [x] 1.1 (M) Add `shared_attempt.mode` (`'wait' | 'trouble'`), `easy` and `full_run` (all nullable), plus a partial index `(user_id, song_fingerprint, instrument, mode, created_at desc) where full_run`.

  Verified by `tests/backend/guitarRuns.test.ts` against a project with 0017 applied.

## 2. Backend (`src/lib`)

- [x] 2.1 (M) `attempts.ts`:
  - `mode`, `easy` and `fullRun` on `NewSharedAttempt`, written on insert;
  - `updateAttemptResult` (owner-only through RLS);
  - `listSongScores` (full runs at a song, mode, version and part, newest first).
- [x] 2.2 (M) `practiceSessions.ts`: `listPracticeSessions({ instrument })`; the run columns in `ATTEMPT_COLUMNS`.

  Verified by `tests/backend/guitarRuns.test.ts`.

## 3. App

- [x] 3.1 (M) `guitar/song/follow/runHistory.js`: `isFullRun`, `waitVerdicts`, `waitAccuracy`, `lastAndBest`, `lastAndBestLine`. In `practiceSession.attemptNotesLine`, the Wait for me wording.

  Verified by `app/tests/runHistory.test.js`.
- [x] 3.2 (M) `ShareAttempt.jsx`: `mode`, `easy`, `fullRun` and `onSaved`. A result that changes after the save corrects the row.
- [x] 3.3 (M) `GuitarTroubleMode.jsx` and `GuitarWaitMode.jsx` save each finished run into the session.
- [x] 3.4 (M) `GuitarSong.jsx`:
  - the practice session;
  - the "Last run · best" line;
  - the Practice sessions view (library card, toolbar button);
  - `findSongFile`, shared with the share-link flow.
- [x] 3.5 (M) Routing:
  - `PracticeSessions` takes `instrument`, and `VocalTab` passes `'voice'`;
  - Home's "Practice sessions" link appears on every song;
  - `App.openSessions` opens the instrument's tab;
  - `GuitarTab` passes `sessionsToOpen` through.
- [x] 3.6 (S) `AttemptRow` names the mode, and "(Easy)" when the run was in the Easy version.

## 4. Checks

- [ ] 4.1 (M) Signed in, on a guitar song:
  - Wait for me to the end, then a full Trouble spots run: both appear in one session and the last-score line updates.
  - A looped bar doesn't change last or best.
  - The re-check changes the stored score.
- [ ] 4.2 (M) Home → a guitar song's Practice sessions opens the Guitar tab's view. Vocal's view lists no guitar sessions.
- [ ] 4.3 (M) Vocal regression: a Record attempt still saves into its session, and the Wait for me / Trouble spots chart is unchanged.
