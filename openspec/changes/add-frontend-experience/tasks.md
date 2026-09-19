# Tasks

Ordered by dependency: audio pipeline and its non-functionals first (they gate everything), then notation + the shared clock, then the scoring engine, then the UI. Each task names how it is verified. MoSCoW: (M) must, (S) should, (C) could.

## 1. audio-pipeline

- [ ] 1.1 (M) Spike getUserMedia + AudioWorklet raw-PCM capture on a real iPhone in mobile Safari; PCM frames must arrive on the worklet thread with no crash on permission grant (N2). Verified by: frames logged from the worklet on a physical iOS device.
- [ ] 1.2 (M) Measure end-to-end mic-to-score latency on that device against the ≤100 ms target; exceeding it must trigger the desktop-first fallback rather than proceed silently (N1, N2). Verified by: a latency measurement logged with pass/fail against 100 ms.
- [ ] 1.3 (M) Handle permission-denied: capture must not start and a mic-unavailable state surfaces instead of a crash. Verified by: denying permission shows the mic-unavailable state.
- [ ] 1.4 (M) Implement the normalized `{note, timestamp, confidence}` contract and the Pitchy pitch analyzer. Verified by: a sustained test tone emits events with the correct note and 0..1 confidence.
- [ ] 1.5 (M) Implement the chord-FFT analyzer (AnalyserNode peak-picking) emitting the identical shape (chord verdict as `note`). Verified by: a strummed open chord emits the standard shape, not a different type.
- [ ] 1.6 (S) Implement noise/volume gating (N6). Verified by: too-quiet input emits a too-quiet signal (no pitched note) and noise-only input emits no high-confidence note.
- [ ] 1.7 (C) Implement RMS-volume dynamics detection (F19). Verified by: rising RMS energy over successive frames reports a rising-dynamics indication.
- [ ] 1.8 (M) Verify a new analyzer emitting the standard shape registers without touching capture or the worklet, and scoring consumes it without instrument-specific code (architecture invariant). Verified by: registering a stub analyzer changes no capture/worklet code.

## 2. notation-rendering

- [ ] 2.1 (M) Render AlphaTab tab + standard notation side by side for a hardcoded song and expose the parsed score as the source of truth for expected notes (F5). Verified by: both staves render and an expected-note sequence is extracted.
- [ ] 2.2 (M) Establish the ONE transport clock (alphaSynth/Tone.js) driving playback, playhead, and the scoring time base (F6, decision 2). Verified by: playhead, expected timings, and event timestamps all read from one clock; no second timeline.
- [ ] 2.3 (M) Implement toggleable reference playback synced to the playhead (F6). Verified by: toggling on plays in sync, toggling off stops audio while the run continues.
- [ ] 2.4 (M) Implement per-song tempo 50–100%, scaling the single clock, persisted via progress-tracking (F37). Verified by: 60% runs everything at 60%, out-of-range values rejected, tempo restores on reopen.
- [ ] 2.5 (S) Implement click/drag-to-seek anywhere in the rendered music (F7). Verified by: clicking a position moves the playhead there and playback can start from it.
- [ ] 2.6 (S) Implement the pre-run countdown before scoring begins (F8). Verified by: countdown plays before the first scored note.
- [ ] 2.7 (S) Implement the solfège label toggle (F15). Verified by: enabling shows solfège labels, disabling hides them.
- [ ] 2.8 (C) Implement Tonal.js random melody generation as a renderable, scorable expected-note sequence (F20). Verified by: a generated melody renders and its expected notes reach scoring.
- [ ] 2.9 (C) Implement Tonal.js random chord-progression generation restricted to unlocked chords at a chosen tempo (F36). Verified by: the progression contains only unlocked chords and renders at the chosen tempo.

## 3. scoring-engine

- [ ] 3.1 (M) Implement instrument-agnostic hit/late/missed scoring on the one clock (F11). Verified by: unit tests — on-time → hit, in-late-window → late, no-match → miss, with no instrument branching.
- [ ] 3.2 (M) Implement the guided-mode soft-gate state machine: hold until verified, advance after N=3 attempts, record outcome (F13, F28). Verified by: unit test — item advances after 3 attempts and outcome is recorded.
- [ ] 3.3 (M) Implement three-miss auto-skip including silence-timeout misses (F29). Verified by: unit test — 3 misses auto-skip and record; a window with no onset counts as a miss.
- [ ] 3.4 (M) Implement manual-skip handling that advances and records a manual skip (F13, F30). Verified by: unit test — skip intent advances and records.
- [ ] 3.5 (M) Implement guitar chord verification against the single expected chord (F16). Verified by: unit test — matching chord verifies, non-matching counts a failed attempt.
- [ ] 3.6 (M) Implement the "couldn't hear you" state driven by the pipeline volume-gate signal, not scored as a wrong note (F21). Verified by: unit test — below-gate signal raises the state and records no wrong note.
- [ ] 3.7 (S) Implement chord cleanliness/fuzziness reporting when per-string data is present (F17). Verified by: unit test — a muted-string input flags that string alongside the verdict.
- [ ] 3.8 (S) Implement strumming-pattern and timing/tempo scoring (F18). Verified by: unit test — played strums compared to expected pattern produce a timing score.
- [ ] 3.9 (S) Implement the play-mode state machine — uninterrupted, ungated run at tempo (F14, F32). Verified by: unit test — a missed item does not stop playhead advance.
- [ ] 3.10 (S) Implement post-run played-vs-score analysis (verified/wrong/not-heard + early/on/late per item) (F14, F33). Verified by: unit test — a completed run yields per-item verdicts for notation marking.

## 4. ui

- [ ] 4.1 (M) Build the React + Vite app shell and routing between lesson map, playlist, practice screen, and summary. Verified by: navigating between all screens works.
- [ ] 4.2 (M) Implement the lesson-flow display: concept → instrument-free drill → played exercise, including knowledge-only nodes completable with taps and no mic (F3). Verified by: a knowledge-only node completes without mic; a played lesson shows the three stages in order.
- [ ] 4.3 (M) Implement the practice playlist listing at least the three hardcoded V1 songs, each opening its practice screen (F4). Verified by: three songs listed and openable.
- [ ] 4.4 (M) Implement the always-visible skip/override control dispatching a skip intent to scoring (F30, decision 4). Verified by: control visible on every item; activating it records a manual skip.
- [ ] 4.5 (M) Implement the live pitch / relative-pitch feedback display from scoring events (F12). Verified by: singing updates the displayed note/relative pitch live.
- [ ] 4.6 (S) Implement the live chord + per-string state display: expected / heard-something-else / heard-nothing, with six per-string indicators when F17 data is present (F34). Verified by: chord state and per-string indicators reflect scoring reports.
- [ ] 4.7 (S) Implement the hint: invoke reference playback once and animate finger positions onto the fretboard diagram (F31, decision 4). Verified by: requesting a hint plays the chord once and animates the fingering.
- [ ] 4.8 (S) Implement the chord-diagram label toggle (fret numbers / note names / finger numbers) (F35). Verified by: switching modes relabels the diagram dots.
- [ ] 4.9 (S) Implement run-through summary with click-to-highlight patchy areas over the rendered music (F24). Verified by: clicking the summary music highlights the attempt's patchy areas.

## 5. Cross-capability integration

- [ ] 5.1 (M) End-to-end guided-mode guitar lesson on E minor: capture → chord verification → soft gate → live chord state → hint/skip, all on one clock. Verified by: a full guided run on a real device produces a recorded score with hits/misses/auto-skips as expected.
- [ ] 5.2 (S) End-to-end voice play-mode run: capture → pitch scoring → post-run played-vs-score marked on the notation. Verified by: a straight-through vocal run yields a marked summary.
