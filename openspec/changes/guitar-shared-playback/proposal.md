# Guitar Shared Playback

## Why

Someone opening a shared guitar run, from a link or from Home, heard the song's MIDI, not the player:

- the song view kept its MIDI playback controls;
- Wait for me never recorded at all;
- in Trouble spots the recording was there, but only as a small player under the panel.

The receiver is meant to judge the run and comment on it, so they need to hear the playing itself. They also need to see where on the tab each moment of it falls. The tab's cursor stayed on the first note.

## What Changes

- **Wait for me records the run** (song-storage, F23), from the first Play to the last note, like Trouble spots.
  - Pause keeps the mic open and pauses the recorder, so a paused run is still one recording.
  - The recording is kept and shared with the attempt through `ShareAttempt`, as for Trouble spots.
- **The shared view plays the recording, never the MIDI.**
  - The song's playback controls are hidden while a shared run is open.
  - The recording comes first in `GuitarSharedPanel` ("Listen to … play").
  - Wait for me runs read "first try / after a few tries / skipped".
- **The cursor follows the recording.** Each run is saved with `timing`: points of seconds into the recording against song seconds (`recordingTiming.js`). While the recording plays, the receiver's cursor moves to the note being played.
  - **Trouble spots**: the run's clock anchors, a calibrated latency later. The cursor moves at the speed and tempo it was played, and holds through a pause.
  - **Wait for me**: the moment the cursor moved on to each note. The cursor sits on each note until it was played.
- `ShareAttempt` warns when the recording is unticked that the person won't hear you.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `song-storage`: Private Attempt-Recording Storage (F23) covers guitar runs shared with their recording and its timing.

## Impact

- **Migration:** `supabase/migrations/0018_attempt_recording_timing.sql` adds a nullable `shared_attempt.timing jsonb`. `get_shared_attempt` returns the whole row, so it needs no change. `insertAttempt` only writes `timing` when there is some, so Vocal saves don't depend on 0018. Guitar saves do, so apply it before deploying.
- **New code:**
  - `app/src/tabs/guitar/song/follow/recordingTiming.js` (pure);
  - `app/tests/recordingTiming.test.js`.
- **Changed code:**
  - `useGuitarListener.js`: `pause()`, resuming through `start()`, `recordingSecondsAt()`.
  - `GuitarWaitMode.jsx` and `GuitarTroubleMode.jsx`: record and build the timing.
  - `GuitarSharedPanel.jsx`: the recording first, the cursor following it.
  - `GuitarSong.jsx`: no MIDI controls in the shared view.
  - `ShareAttempt.jsx`: `timing`, and the no-recording warning.
  - `src/lib/attempts.ts`: the `timing` field.
  - `tests/backend/guitarRuns.test.ts`.
- **Behaviour change:** Wait for me's Pause keeps the microphone open (the recorder is paused). Stop still releases it.

## Non-goals

- Vocal shared attempts. Their view already plays no MIDI, and their pitch trace is drawn on the score.
- Runs saved before 0018. They have no timing, so the cursor stays put; Wait for me runs before this change have no recording either.
