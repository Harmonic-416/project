# Add Frontend Experience

## Why

Harmonic's value — "learn the instrument and the language at the same time" — lives in the browser: everything a learner sees and every note they play is judged client-side, in real time, before any data leaves the device. The frontend must beat the three failures that sink competitors: **burnout** (skipping ahead into complexity), **no tempo control** (a verbatim complaint: "doesn't even let you choose the tempo"), and **wrong feedback / strict gating** (a false negative that traps a beginner for weeks). It also carries the biggest project risk — sub-100ms mic-to-score latency on a real phone in mobile Safari — which must be validated before anything is built on it.

## What Changes

- **New browser app shell (React + Vite PWA)** hosting all screens: the unlocking lesson map with knowledge-only nodes (Lesson 1 is guitar anatomy, no mic), the concept -> instrument-free drill -> played exercise flow, the 3-song practice playlist, and run-through summaries whose notation is clickable to highlight patchy areas.
- **Live-feedback display**: sung note / relative-pitch readout for voice, a chord diagram with live per-string state for guitar, an always-visible skip/override control, and a hint that animates finger positions onto the fretboard and invokes reference playback.
- **Audio capture pipeline**: getUserMedia + AudioWorklet raw-PCM capture on its own thread, feeding three pluggable analyzers (Pitchy pitch, AnalyserNode chord-FFT, RMS volume) that all emit ONE normalized `{note, timestamp, confidence}` event; with noise/volume gating, dynamics detection, and the make-or-break non-functionals (latency, mobile-Safari viability).
- **Notation, playback & generators**: AlphaTab tab + standard notation as the source of truth for expected notes, alphaSynth/Tone.js reference playback on ONE transport clock, pre-run countdown, click/drag-to-seek, per-song persisted tempo (50-100%), solfège label toggle, and Tonal.js random melody / chord-progression generation producing renderable expected-note sequences.
- **Instrument-agnostic scoring engine**: consumes normalized events, compares them to AlphaTab's expected notes on the one clock (hit/late/missed); owns guided (soft gate, N=3 auto-skip, silence-timeout misses) and play mode state machines, chord verification + cleanliness, strumming/timing score, post-run played-vs-score analysis, and the "couldn't hear you" state — never knowing which instrument produced an event.

## Capabilities

### New Capabilities

- `ui`: React app shell and all screens — lesson map / lesson flow (incl. knowledge-only nodes), practice playlist, run-through summaries with click-to-highlight, live-feedback display (sung note / relative pitch and live chord + per-string state), always-visible skip/override, hint (fretboard animation + reference playback), and chord-diagram label toggles. Owns F3, F4, F12, F24, F30, F31, F34, F35.
- `audio-pipeline`: getUserMedia + AudioWorklet raw-PCM capture and the pluggable pitch / chord-FFT / RMS-volume analyzers emitting one normalized `{note, timestamp, confidence}` event; noise/volume gating, dynamics detection, sub-100ms latency, mobile-Safari viability. Owns F19, N1, N2, N6.
- `notation-rendering`: AlphaTab tab + standard notation (source of truth), alphaSynth/Tone.js reference playback on the single clock, countdown, click/drag-to-seek, per-song persisted tempo, solfège toggle, and Tonal.js random melody / chord-progression generation. Owns F5, F6, F7, F8, F15, F20, F36, F37.
- `scoring-engine`: instrument-agnostic scoring — events vs expected notes on the one clock (hit/late/missed), guided + play mode state machines, miss counting + soft auto-skip, chord verification + cleanliness, strumming/timing score, post-run analysis, and the "couldn't hear you" state. Owns F11, F13, F14, F16, F17, F18, F21, F28, F29, F32, F33.

### Modified Capabilities

(None — greenfield; every capability is brand-new.)

## Impact

- **New code:** the entire browser application (`project/`), currently empty — React + Vite shell, AudioWorklet processor + analyzers, AlphaTab/alphaSynth/Tone.js integration, and the scoring engine.
- **Dependencies added:** React, Vite, AlphaTab (+ alphaSynth), Pitchy, Tone.js, Tonal.js. (vite-plugin-pwa/Workbox and the Supabase SDK are owned by devops and backend respectively.)
- **Consumes (cross-area contracts):** reads songs + MusicXML from song-storage; reads/writes per-user progress and run-through history via progress-tracking, which also owns the unlock rules for the map. Emits only scores/progress and optional compressed recordings — never live mic audio.
- **Architecture invariant preserved:** all real-time audio analysis stays client-side; adding an instrument later = one new analyzer emitting the standard event shape, with no change to capture, worklet, or scoring.

## Non-goals

Per the v1-scope OUT list, this change explicitly does NOT build (each a separate future change):

- **Computer-vision finger-placement feedback (F25)** — no MediaPipe / camera fret-mapping; the fretboard hint (F31) is a static/animated diagram only.
- **Group / social / collaboration / multi-instrument songs (F26)** — V1 is single-player.
- **YouTube play-along scoring (F27)**.
- **Guitar "Changes" mode (F38)** — depends on the gate + timing score landing first; deferred.
- **Piano** — semester scope is guitar + voice.
- **Full-song playthroughs** and a **sheet-music-reading curriculum** — V1 is lesson- and practice-piece-scale and renders notation without teaching it.
- **Advanced guitar technique** (slides, bends, hammer-ons, pull-offs).
- **Backend/devops concerns owned elsewhere:** auth, progress persistence, song/recording storage (backend); service worker, manifest, offline caching, deploy (devops). This change consumes their contracts, not implements them.
