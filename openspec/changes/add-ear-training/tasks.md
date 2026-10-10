# Tasks

The order follows dependencies:
1. the chord data and sound, which the exercises play;
2. the exercise rules;
3. the view and its place in the Guitar tab;
4. checks.

(M) is must and (S) is should.

## 1. ear-training

- [x] 1.1 (M) Add `quality` (`major` / `minor`) to each chord in `chords.js`.

  Verified by: `app/tests/earTraining.test.js`. Each chord's quality matches the third it actually sounds.
- [x] 1.2 (M) Write `chordSound.js` (`createChordPlayer`) and `useChordPlayer`:
  - one `Tone.PluckSynth` per sounded string, low to high: a strum (40 ms apart) or note by note (350 ms apart);
  - each string rings about 2.4 s to -60 dB, inside Hint's 3 s mic mute;
  - every play, and `stop()`, fades out and drops the previous strings, including ones an arpeggio still had scheduled;
  - plucks wait for Tone's comb-filter worklet, so the first chord is never silent.

  Verified by:
  - `earTraining.test.js` (ring time);
  - headless Chrome, rendering every chord offline: strums peak 9–11 dB under full scale and fall 40 dB in about 1.8 s; single strings are within 8 cents of pitch.
- [x] 1.3 (M) Practice's Hint plays through `useChordPlayer` instead of its own triangle-wave synth.

  Verified by: headless Chrome. Hint plays with no console errors.
- [x] 1.4 (M) Write the pure `earTraining.js`:
  - `makeRound`: ten questions, no back-to-back repeat, major and minor 50/50 in Level 1, four shuffled chord names in Level 2;
  - `exerciseReducer`: `idle → asking → answered → … → done`, one answer per question;
  - `roundScore` and `missedChords`.

  Verified by: `earTraining.test.js`, with a seeded random source.
- [x] 1.5 (M) Write `Exercises.jsx` and `Exercises.css`:
  - level cards and Start;
  - Play again, Note by note, 2 or 4 answers;
  - after an answer: marks, the chord diagram, Hear yours / Hear the answer, and focus on Next;
  - the summary with playable missed chords.

  Verified by: headless Chrome through both levels and a full round, with no console errors.
- [x] 1.6 (M) Add Exercises to the Guitar tab's views, and fit four views and the account button on phones.

  Verified by: headless Chrome at 360, 375, 390, 414 and 480 px, signed in and out. Nothing overlaps, leaves the screen or scrolls sideways.
- [ ] 1.7 (S) Phone check on iPhone Safari over HTTPS. The chord must play on Start, sound like a guitar, and stop when another view is opened.

  Verified by: a written note in `tests/audio/README.md`.

## 2. Integration

- [ ] 2.1 (M) `npm run ci` passes.

  Verified by: the command exits 0 locally and in GitHub Actions.
- [x] 2.2 (M) Add F41 to the specs repo, an Exercises line to the README, and a row to `docs/architecture.md`.

  Verified by: review on the PR.
