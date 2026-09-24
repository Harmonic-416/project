# Design

## Context

This change touches three frontend capabilities — `audio-pipeline` (capture), `tuner` (first consumer of capture) and `notation-rendering` (guitar renderer + conversion). It records the choices that cross them, plus the decisions made for M2 (2026-09-23): alphaTab for guitar only, a must-have standard-tuning tuner, and AudioWorklet capture for guitar.

## Decisions

### 1. Renderer per instrument

Guitar uses alphaTab; voice keeps OSMD. alphaTab is the only renderer that draws tab, and it also plays (alphaSynth) and exports (MIDI, Guitar Pro) what it renders. OSMD stays on voice because its cursor iterator already provides the voice timing model (`scoreModel.js`). Both read MusicXML, so the catalog stays one format for everything alphaTab can express.

- alphaTab (~1 MB view chunk, ~2 MB worker/worklet, ~1 MB soundfont) is lazy-loaded with the Guitar **Songs** view, so the tuner and the Vocal tab never download it. Those files stay out of the install-time precache and are cached on first use (Workbox `CacheFirst`).
- alphaTab's MusicXML importer turns standard notation off on any staff that has a tuning, so the loader switches tab and notation both on for stringed staves (F5).
- alphaTab 1.8 ignores `<beat-unit-dot/>` in metronome marks and adds a second, wrong tempo; our files write the mark in quarter notes.

### 2. Shared AudioWorklet capture

`app/src/audio/capture/` owns getUserMedia + AudioWorklet. The processor keeps a ring buffer and, every 512 samples (the hop), posts a transferable frame of the last `frameSize` samples, the frame's RMS, and — when frame energy jumps well above its recent average — an onset. The frame's position is its sample index, so `index / sampleRate` is time on the capture context's clock. Frames go to the main thread, where analyzers run (Pitchy today, an FFT for chords next).

- The hop/onset logic is a pure `FrameAssembler` class tested in Node. The worklet imports it and is loaded through a `?worker&url` import, so Vite bundles both into one self-contained ES module (workers are built with `worker.format: 'es'`).
- No `SharedArrayBuffer` (it needs COOP/COEP headers); `postMessage` with transferables is enough at a 512-sample hop.
- `createCapture({ context })` accepts an existing `AudioContext`, so the guitar scoring change can put capture on the same context as playback if that's the one-clock answer (see Open questions).
- The context is created/resumed inside a user tap (iOS requirement); the mic needs HTTPS on phones.

Why not keep polling an `AnalyserNode` as Vocal does: polling sees only the latest window each animation frame and is throttled in background tabs, so short strum transients can fall between polls. The worklet sees every sample.

### 3. Tuner detection

Pitchy (McLeod) on 4096-sample frames — long enough for several periods of low E (82.41 Hz). Readings pass through a median filter over the last 5 detections; the nearest string within ±600 cents is chosen (a manual lock overrides), so a louder second harmonic doesn't flip low E to the D string. "In tune" is ±5 cents held 0.5 s, and it stays in tune until the reading leaves ±8 cents (hysteresis) so the indicator doesn't flicker. Frames below the RMS or clarity gate produce the "play a string" state and do not move the needle.

### 4. Guitar notation conversion

- **In:** Guitar Pro 3–8, alphaTex and MusicXML load natively through alphaTab's `ScoreLoader`. MXL is unzipped with the Vocal tab's `unzipMxl` first. alphaTab shows tab only when the file carries string/fret data (it does not derive frets from pitch and cannot import MIDI).
- **MIDI → tab:** MIDI goes through the existing `midiToMusicXml` with a new opt-in `tablature: { tuning }` option (default off, so Vocal output is unchanged). A pure `assignFrets` picks string/fret per note by dynamic programming over chord groups — candidates on frets 0–15, one note per string, fretted span ≤ 4, cost = hand movement + high-fret penalty − open-string bonus — and out-of-range notes shift an octave with a recorded warning. Until it lands, MIDI loads render notation with a "tab not available yet" notice.
- **Out:** MIDI via `MidiFileGenerator` + `AlphaSynthMidiFileHandler(midiFile, true)` → `midiFile.toBinary()` (original bytes when the source was MIDI, the same rule as Vocal); Guitar Pro via `Gp7Exporter`.

## Risks

- **alphaTab bundle and soundfont size** — mitigated by lazy loading and runtime (not precache) caching of the `.sf2`.
- **Low-string detection on phone mics** — the phone check (task 4.4) is the go/no-go; a longer frame is the first fallback.
- **MIDI → tab fingerings** are playable but not always idiomatic; documented as a known simplification.

## Open questions

1. **One clock for guitar scoring.** alphaSynth plays through its own `AudioContext`. Options: capture on alphaSynth's context, map capture time to alphaTab's `timePosition`, or drive guitar playback from Tone.js the way Vocal does. Decide in the chord-verification change.
2. **Stored form of guitar songs.** alphaTab has no MusicXML exporter, so a Guitar Pro upload can't become MusicXML. Recommendation: store `.gp` as-is for Guitar Pro sources and MusicXML-with-tab for everything else (a `song-storage` decision).
