# Tasks

The order follows dependencies:
1. the beat grid and click, which the Vocal tab schedules;
2. the Vocal wiring;
3. Guitar, which needs only the shared settings and control;
4. checks.

(M) is must and (S) is should.

## 1. notation-rendering

- [x] 1.1 (M) Write the pure `beats.js`:
  - `beatsFromMeasures` clicks once per `1/denominator`, or on dotted quarters in 6/8, 9/8 and 12/8;
  - a short first bar is a pickup aligned to the end of the bar;
  - a tempo change is honoured per measure;
  - `countIn` returns one bar of the meter at the playhead.
  
  Verified by: `app/tests/metronome.test.js`.
- [x] 1.2 (M) Build the score model's `beats` from one entry per enrolled measure in the existing OSMD walk: start seconds, actual `Duration`, `ActiveTimeSignature` and BPM.
  
  Verified by: headless Chrome. Amazing Grace's pickup flashes as a beat and bar 2 as the downbeat.
- [x] 1.3 (M) Write `click.js`: high-passed noise with a louder, duller downbeat; `silence()` drops clicks already scheduled.
  
  Verified by: `pitchDetector.test.js`, where a decaying high-passed noise burst returns no pitch.
- [x] 1.4 (M) Update `useMidiPlayback` so it:
  - schedules every beat on the Transport, gated live by `on`;
  - performs the count-in on the audio clock, then calls `Transport.start(at)` with the `'counting'` state;
  - lets pause and stop cancel a count-in in progress.
  
  Verified by: headless Chrome on Ode to Joy, with:
  - four count-in clicks 0.5 s apart, then downbeats every 2 s;
  - pausing during the count-in keeps 0:00;
  - turning the metronome off mid-song keeps playing.
- [x] 1.5 (M) Add `MetronomeControl` (Metronome and Count-in toggles, volume, beat light) and the shared settings in `localStorage`. The Vocal tab shows it outside Wait for me, and `PlaybackControls` shows "Count-in…".
  
  Verified by:
  - the settings tests in `metronome.test.js`;
  - headless Chrome, where Wait mode hides the control and a 400 px-wide page does not scroll sideways.
- [x] 1.6 (M) Wire the Guitar Songs player to alphaSynth's `metronomeVolume` and `countInVolume`; metronome MIDI events drive the light.
  
  Verified by: headless Chrome on House of the Rising Sun, with:
  - a flash every eighth note and the downbeat every six;
  - settings that survive "← Songs" and carry over to the Vocal tab.
- [ ] 1.7 (S) Phone check on iPhone Safari over HTTPS. The click must be audible while the mic is recording, and a recorded attempt must show no pitch dots on clicks.
  
  Verified by: a written note in `tests/audio/README.md`.

## 2. Integration

- [ ] 2.1 (M) `npm run ci` passes.
  
  Verified by: the command exits 0 locally and in GitHub Actions.
- [x] 2.2 (M) Add F40 to the specs repo and a metronome line to the README for each tab.
  
  Verified by: review on the PR.
