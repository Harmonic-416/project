# Tasks

Ordered by dependency: the window measurements first (the noise gate reads them), then the judging rules, then the screen.

## 1. audio-pipeline

- [x] 1.1 `createWindowCollector` adds `levels`, `referenceSpectrum` (the frame ending ≥ 40 ms before the onset), `floor` (the room floor) and `closedBy` / `closedAt` to every window, plus a `hop` option that `useGuitarListener` sets. Verified by: the "listening windows" tests in `app/tests/noteJudge.test.js`.
- [x] 1.2 `soundsLikeANote(window)`: the tonal, keeps-ringing and above-the-floor checks. Verified by: the typing scenarios in `app/tests/waitListening.test.js` give no verdicts.

## 2. scoring-engine

- [x] 2.1 `waitReducer`: wrong tries never advance, and Skip is the only way past a note; export `NUDGE_AFTER`. Verified by: `app/tests/songFollow.test.js` "keeps waiting after any number of wrong tries".
- [x] 2.2 `judgeWindow(window, entry, options)` with `EVERY_STRING` (every chord tone, per-string threshold 0.15); the defaults are unchanged. Verified by: the near-miss chord tests in `app/tests/noteJudge.test.js` (E for Em, Em for E, Am for C).
- [x] 2.3 `createWaitAttempts`: one judgment per gesture, a hit only on fresh playing, a wrong held until the gesture ends. Verified by: the scenario table in `app/tests/waitListening.test.js`.
- [ ] 2.4 `GuitarWaitMode` uses it: try count, a nudge to Hint / Skip after `NUDGE_AFTER` tries, and the measurements in the dev-mode judgement log. Verified by: `npm --prefix app run lint && npm --prefix app test && npm --prefix app run build`, then by hand with a guitar (typing doesn't move the cursor; one ringing strum advances once; a wrong chord stays).
