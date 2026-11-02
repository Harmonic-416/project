# Guitar Run History

## Why

F22 ("run-through history per song, with last score", a Must) is only half built for guitar. A Trouble spots run on a guitar song is already saved privately as an attempt (`shared_attempt`, via `ShareAttempt`). But:

- the attempt belongs to no practice session, so it never appears in Practice sessions;
- Wait for me saves nothing;
- the saved verdicts are frozen before "Check my run more accurately", so the stored score can disagree with the one the player saw;
- nothing in the Guitar tab shows past runs or a last score.

Home's "Practice sessions" link and `App.openSessions` only work for Vocal. The practice-sessions change left guitar out on purpose (its Non-goals). The table, the hook and the components already take an `instrument`.

## What Changes

- **Guitar runs are saved into practice sessions (progress-tracking, F22).**
  - While signed in, an open guitar song has a practice session (`usePracticeSession`, `instrument: 'guitar'`).
  - Every finished Trouble spots run, and every Wait for me run played to the end, is saved into it as an attempt. Each carries its per-note verdicts and its score:
    - Trouble spots: notes hit.
    - Wait for me: notes played first try.
  - A Trouble spots run that is re-checked note by note is corrected in place.
- **What kind of run it was.** `shared_attempt` gains three nullable columns:
  - `mode`: `'wait'` or `'trouble'`;
  - `easy`: the song's Easy version, F45;
  - `full_run`: from the first scored note to the end.
- **Last and best.** The open song shows "Last run X% · best Y%". These are worked out from the full runs at the same song, mode, part and version. A looped bar, or a run stopped early, is kept but not counted.
- **A Practice sessions view in the Guitar tab**, reused from the Vocal tab:
  - Reached from the Songs library, the open song's toolbar, and Home's "Working on".
  - Each tab lists only its own instrument's sessions, so Practise reopens the song where it was played.
  - Attempt rows name the mode, and Wait for me runs read "first try / after a few tries / skipped".
- **Backend:**
  - `attempts.ts`: `mode`, `easy` and `fullRun` on save; `updateAttemptResult`; `listSongScores`.
  - `practiceSessions.ts`: `listPracticeSessions` takes `instrument`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `progress-tracking`: Run-Through History with Last Score (F22) now covers guitar song runs.

## Impact

- **Migration:** `supabase/migrations/0017_guitar_run_history.sql`. It adds three nullable columns and a partial index to `shared_attempt`. It is numbered 0017 because an unmerged local `0016_transcription_jobs.sql` exists. `get_shared_attempt` returns the whole row, so it needs no change.
- **New code:**
  - `app/src/tabs/guitar/song/follow/runHistory.js` (pure);
  - `app/tests/runHistory.test.js`;
  - `tests/backend/guitarRuns.test.ts`.
- **Changed code:**
  - `ShareAttempt.jsx`: run fields, `onSaved`, and correcting the row after a re-check.
  - `GuitarSong.jsx`: owns the session, the last-score line and the sessions view; it also pulls out `findSongFile`, which the share-link flow reuses.
  - `GuitarTroubleMode.jsx` and `GuitarWaitMode.jsx`: save into the session.
  - `PracticeSessions.jsx`: the `instrument` filter.
  - `SessionAttempts.jsx`: the mode label.
  - `practiceSession.js`: the Wait wording.
  - `VocalTab.jsx`, `GuitarTab.jsx`, `App.jsx`, `ProgressSection.jsx` and `HomeTab.jsx`: routing by instrument.
- **Behaviour change:** in a session, `ShareAttempt` keeps the recording by default while it fits the budget. A Trouble spots run's audio is therefore now kept (100 MB per user, untickable), as for a recorded Vocal attempt. Before, it was uploaded only when shared.
- **No new dependencies.**

## Non-goals

- The Learn drills (Guided, Practice, Play, Changes, Strum on the beat). They keep their totals in `guitar_progress`.
- `practice_run` (the Vocal chart table). It has no `instrument`, and sessions that hold only runs are deleted when they end.
- A chart of tries for guitar, or a "This session" list under the guitar song.
- A lesson map showing the last score (no map exists; see F2).
