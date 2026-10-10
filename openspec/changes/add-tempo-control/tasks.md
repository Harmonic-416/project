# Tasks

Ordered by dependency:
1. the pure tempo module and the score clock;
2. the Vocal wiring, which needs the clock;
3. Guitar;
4. checks.

(M) is must and (S) is should.

## 1. notation-rendering

- [x] 1.1 (M) `tempo.js` and `useSongTempo`:
  - `clampTempo` uses 5% steps from 50 to 100;
  - `effectiveBpm`;
  - per-song memory in `harmonic.tempo` keyed by file fingerprint, where 100% removes the entry;
  - the song is switched during render, so one song's tempo is never saved under another's key.

  Verified by: `app/tests/tempo.test.js`.
- [x] 1.2 (M) `scoreClock.js`: score time as Transport ticks (`scoreTicks` / `getScoreSeconds` / `setScoreSeconds`), with tempo set as bpm. `useMidiPlayback` uses these:
  - it schedules notes, cursor and beats as ticks;
  - note durations and the count-in interval are divided by the rate;
  - a `rate` input applies live.

  Verified by:
  - headless Chrome on Ode to Joy at 50%: the count-in and beats are 1 s apart, 2.9 s of playback reaches 1.44 score s, and the song shows 0:32;
  - switching to 100% mid-song gives 0.5 s beats without stopping;
  - `grep Transport.seconds app/src` finds no code.
- [x] 1.3 (M) `RecordPanel` and `TroubleSpotsPlayer` stamp and judge in score time.

  Verified by: headless Chrome at 70%, where the dev hook's transport time matches the seek position (2.08 vs 2.07, 2.57 vs 2.57, 3.06 vs 3.06).
- [x] 1.4 (M) Printed marks on voice songs: `tempoMarks.js` rescales the drawn `vf-bpm` text after every OSMD render, from the written text kept on the element.

  Verified by:
  - `tempo.test.js` (no compounding);
  - headless Chrome, where Ode shows ` = 60` at 50% and ` = 120` again at 100%.
- [x] 1.5 (M) `TempoControl` sits in the Vocal tab beside the metronome. It is hidden in Wait for me and disabled during a count-in. `PlaybackControls` shows real time.

  Verified by: headless Chrome. Ode is remembered at 50%, Amazing Grace stays at 100%, and the control is hidden in Wait for me.
- [x] 1.6 (M) Guitar Songs:
  - `playbackSpeed` follows the tempo;
  - the readout is rescaled at once;
  - the printed marks are drawn scaled after alphaTab's first finished render, then the written values are restored;
  - `GuitarSong` fingerprints the file.

  Verified by: headless Chrome on House of the Rising Sun at 50%:
  - ` = 45`, beats about 680 ms apart, and 1:03 long;
  - reopening shows 50% and ` = 45`;
  - 100% shows ` = 90` again.
- [ ] 1.7 (S) Phone check on iPhone Safari: slowed audio stays clean, and the clicks stay on the beat at 50%.

  Verified by: a written note in `tests/audio/README.md`.

## 2. Integration

- [ ] 2.1 (M) `npm run ci` passes.

  Verified by: the command exits 0 locally and in GitHub Actions.
- [x] 2.2 (M) Add a tempo line to the README for each tab.

  Verified by: review on the PR.
