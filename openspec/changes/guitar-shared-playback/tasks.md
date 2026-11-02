# Tasks

(M) is must and (S) is should.

## 1. Schema (migration 0018)

- [x] 1.1 (M) Add `shared_attempt.timing jsonb` (nullable).

  Verified by `tests/backend/guitarRuns.test.ts` against a project with 0018 applied.

## 2. Recording

- [x] 2.1 (M) `useGuitarListener`:
  - `pause()` keeps the mic open and pauses the recorder;
  - `start()` resumes;
  - `recordingSecondsAt(wall)` leaves paused time out.
- [x] 2.2 (M) Wait for me records the run and saves it with the attempt.

## 3. Timing

- [x] 3.1 (M) `recordingTiming.js`: `songTimeAt`, `compressTiming`, `troubleTiming`, `waitTiming`, `entryAt`.

  Verified by `app/tests/recordingTiming.test.js`.
- [x] 3.2 (M) Trouble spots and Wait for me pass `timing` to `ShareAttempt`, which saves it (`attempts.ts`).

## 4. Shared view

- [x] 4.1 (M) No MIDI playback controls while a shared guitar run is open; the recording comes first in `GuitarSharedPanel`.
- [x] 4.2 (M) The cursor follows the recording while it plays, pauses and seeks.
- [x] 4.3 (S) Wait for me wording and legend; the warning when the recording is unticked.

## 5. Checks

- [ ] 5.1 (M) Apply 0018 to the Supabase project.
- [ ] 5.2 (M) Send a Wait for me run and a Trouble spots run to a friend. Signed in as the friend:
  - each plays the sender's recording, with no MIDI;
  - the cursor moves with it: at tempo for Trouble spots, note by note for Wait for me;
  - it holds where the sender paused.
- [ ] 5.3 (M) A paused and resumed Wait for me run is one recording.
