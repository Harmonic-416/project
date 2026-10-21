# Practice Sessions

## Why

A signed-in player's finished attempts are already saved (migration 0010: `shared_attempt` holds every attempt privately, Home lists the songs they're working on). What is missing is the practice itself: there is no notion of a *session*, so after a 20-minute run at a song the player has a pile of unconnected rows, the recording of each attempt is only kept when it was shared, and nothing they thought about an attempt ("breath before the high note", "much better at 80%") survives the page. Attempts are the unit of scoring; sessions are the unit of practice, and feedback belongs to the player as much as to their friends.

Audio is the only part of this that costs anything. The live project runs on Supabase's Free plan, whose file storage is 1 GB in all (see design.md for the verified limits), so keeping every recording of every attempt needs a budget per user that the database enforces rather than a hope that nobody records too much.

## What Changes

- **Practice sessions (progress-tracking, F22):**
  - A `practice_session` row per sitting at a song: it starts when a signed-in user opens a song to practise in the Vocal tab and ends when they leave it, or after 30 minutes without an attempt (then it ends at its last activity). Reopening the song within 30 minutes resumes the same session; a session that ends with no attempts is deleted. Every attempt finished in between carries its `session_id`.
  - A **Practice sessions** view, reachable from the Vocal song library and from each song on Home's "Working on", shows one card per song (times practised, attempts, best, last practised) with that song's sessions underneath, each opening to its attempts and feedback.
  - Under the score, a **This session** list grows with each attempt: time, score, part, play the recording, a note and a 1–5 rating that save as you type, and a way to drop the recording while keeping the attempt.
- **Owner feedback on an attempt (progress-tracking):** `self_note` and `rating` on `shared_attempt`, owner-only; never shown to people the attempt was shared with.
- **Recording storage budget (song-storage, N3, N5):**
  - Keeping an attempt's audio is opt-in per attempt (a toggle, on by default while under budget). Scores, pitch traces and feedback are always kept; only the audio is budgeted.
  - `recording_bytes` is tracked per attempt; a per-user cap of 100 MB is enforced by a trigger on insert/update, and "storage used" is exposed to the app.
  - A recording can be deleted on its own, keeping the attempt.
- **Backend:** `src/lib/practiceSessions.ts` (resume-or-start, end, list sessions, a session's attempts with signed URLs, feedback, delete recording, storage used), and `attempts.ts` learns `sessionId` and `recording_bytes`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `progress-tracking`: adds practice sessions and owner feedback on top of the attempt history it owns (F22).
- `song-storage`: adds the per-user recording budget and per-recording deletion to the private recording storage it owns (F23, N3, N5).

## Impact

- **Migration:** `supabase/migrations/0014_practice_sessions.sql` (0013 is the guitar Learn progress). Additive: a new table, four nullable columns on `shared_attempt`, four functions (`end_practice_session`, `close_idle_practice_sessions`, `recording_budget_bytes`, `recording_storage_used`), one trigger, a per-file size limit on the `recordings` bucket. `get_shared_attempt` is replaced so that a viewer who isn't the owner gets `self_note` / `rating` as null.
- **New code:**
  - `src/lib/practiceSessions.ts`, `tests/backend/practiceSessions.test.ts`;
  - `app/src/tabs/vocal/practice/practiceSession.js` (pure: boundaries, idle, grouping, budget) with `app/tests/practiceSession.test.js`;
  - `app/src/tabs/vocal/practice/usePracticeSession.js` (the live session);
  - `app/src/tabs/vocal/components/SessionAttempts.jsx` + `.css` ("This session");
  - `app/src/tabs/vocal/components/PracticeSessions.jsx` + `.css` (previous sessions).
- **Changed code:** `attempts.ts` (`sessionId`, `recording_bytes`, budget pre-check), `ShareAttempt.jsx` (saves into the session, keeps the recording when ticked), `RecordPanel.jsx` (hosts the list), `VocalTab.jsx` (owns the session and the new view), `HomeTab.jsx` / `ProgressSection.jsx` (link from "Working on"), `App.jsx` (routes it).
- **Not touched:** `app/src/tabs/vocal/arrange/`, `worker/`, the Guitar tab (it keeps calling `ShareAttempt` as before; attempts from it get no session yet).
- **No new dependencies.**

## Non-goals

- Guitar sessions. The hook and the table take an `instrument`, but only the Vocal tab starts sessions in this change.
- Sharing a whole session, or friends' comments on a session (attempt comments stay as they are).
- Transcoding or trimming audio to save space; the budget is enforced on what MediaRecorder produces.
- Changing the Supabase plan. The design assumes Free and leaves the cap in one place to raise on Pro.
- Attempts saved before this change: they keep `session_id = null` and still appear on Home; the sessions view doesn't list them.
