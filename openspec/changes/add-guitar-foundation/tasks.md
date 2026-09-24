# Tasks

Ordered by dependency: capture first (the tuner and every later guitar analyzer sit on it), then the tuner, then notation, then the M2 checks. (M) must, (S) should, (C) could.

## 1. audio-pipeline

- [x] 1.1 (M) Pure `FrameAssembler`: 128-sample render blocks in, 512-hop frames of the last `frameSize` samples out, each with RMS and end position; onset when frame energy jumps well above its running average. Verified by: `app/tests/frameAssembler.test.js`.
- [x] 1.2 (M) `pcm-capture.worklet.js` processor using the same logic, posting transferable frames and onsets to the main thread; imports the assembler and is bundled via `?worker&url`. Verified by: headless Chrome with a fake microphone playing a 110 Hz WAV — frames reach the tuner, which reads A2.
- [x] 1.3 (M) `createCapture({ context, frameSize })`: getUserMedia with processing off, `audioWorklet.addModule` via a Vite `?worker&url` import, optional injected AudioContext, `stop()` releases the mic. Permission denied surfaces an error state, not a crash. Verified by: headless Chrome with permission prompts denied shows "Microphone permission was denied." and no page error.

## 2. tuner

- [x] 2.1 (M) `tuner.js`: `STANDARD_TUNING`, `nearestString` (±600¢, lock override), `centsFrom`, `createStabilizer` (median of 5, in tune at ±5¢ for 0.5 s, cleared outside ±8¢). Reuses `frequencyToMidi`/`createPitchTracker` from `pitchDetector.js`. Verified by: `app/tests/tuner.test.js`.
- [x] 2.2 (M) `useTuner` hook: capture → Pitchy (4096 frames) → stabilizer; status idle / requesting / listening / error; UI updates ≥ 20/s. Verified by: fake-mic 110 Hz → "A2 In tune" and a ✓ on A; 82.4 Hz (louder 2nd harmonic) → E2 in the production build.
- [x] 2.3 (M) `Tuner.jsx`: Start (user tap), six string chips (auto highlight, tap to lock, tick when in tune), cents needle, "play a string" state. Verified by: silence shows "play a string"; 115 Hz reads ≈ +77¢.

## 3. notation-rendering

- [x] 3.1 (M) Add `@coderline/alphatab` + its Vite plugin; lazy-load the Guitar Songs view; keep alphaTab's chunks and soundfont out of the precache. Verified by: `npm --prefix app run build` succeeds; precache is 7 entries / 1.9 MB with no alphaTab file in it.
- [x] 3.2 (M) `loadGuitarNotation`: Guitar Pro / alphaTex / MusicXML via `ScoreLoader`, MXL via `unzipMxl`, MIDI via `midiToMusicXml` (notation only until 3.6). Verified by: `app/tests/guitarNotation.test.js` loads the built-in song in Node.
- [x] 3.3 (M) Built-in song: House of the Rising Sun arpeggio as MusicXML with `<staff-tuning>` and string/fret on every note (also fills the missing seed file). Verified by: the test in 3.2 finds six-string standard tuning and string/fret on every note.
- [x] 3.4 (M) `GuitarScore.jsx`: alphaTab tab + standard notation, alphaSynth play/pause/stop with cursor, click to seek, upload. Verified by: headless Chrome — both staves render, Play advances the clock and cursor; the exported `.gp` re-uploads with its tab.
- [x] 3.5 (M) `exportGuitarNotation`: MIDI via `MidiFileGenerator` (original bytes for MIDI sources) and Guitar Pro 7 via `Gp7Exporter`. Verified by: round-trip test — exported MIDI re-parsed with `@tonejs/midi` has the song's pitches and onsets.
- [ ] 3.6 (S, after M2) `assignFrets` DP + opt-in `tablature` option in `midiToMusicXml`. Verified by: E minor → 0-2-2-0-0-0; no string reused in a chord; span ≤ 4; Vocal converter output unchanged with the option off.
- [ ] 3.7 (C) Plain-text tab import → alphaTex with guessed rhythm. Verified by: a sample ASCII tab renders with the right frets.

## 4. Integration and M2

- [x] 4.1 (M) `GuitarTab.jsx` sub-navigation: Tuner | Song, Tuner first. Verified by: both views reachable; Vocal tab unchanged.
- [ ] 4.2 (M) `npm run ci` green. Verified by: the command exits 0 locally and in GitHub Actions.
- [x] 4.3 (M) Docs: architecture diagram and decisions, M2 stack lines, README. Verified by: review on the PR.
- [ ] 4.4 (M) Phone check: iPhone Safari over HTTPS — worklet frames arrive and each string is detected; go/no-go written in `tests/audio/README.md` (N1, N2). Verified by: the written note.
