# Add Guitar Foundation

## Why

The Guitar tab is an empty stub while the Vocal tab already renders, plays and scores songs. Three gaps block every guitar feature in the plan (F16, F28–F37):

- **No tab.** The built client renders with OSMD, which cannot draw guitar tablature (F5).
- **No tuner.** An out-of-tune guitar makes every chord verdict false, and no spec covered tuning (the open gap in `guitar-learning-path.md`; now F39).
- **No capture layer to plug a chord analyzer into.** The Vocal prototype polls an `AnalyserNode` once per animation frame, which can miss the short strum onsets that open guitar's chord-detection window. The audio-pipeline spec already calls for AudioWorklet capture; nothing implements it yet.

M2 also asks for a minimal running prototype and a design doc tied to requirements, so this change produces the guitar heartbeat: a working tuner on the shared AudioWorklet capture, verified on a phone, plus a guitar song view with tab, playback and MIDI export.

## What Changes

- **Tuner (new, F39):** standard-tuning (EADGBE) tuner that auto-detects the nearest string, allows a manual lock, shows cents off target and an in-tune state, and handles too-quiet input without moving the needle. Opens from the Guitar tab; scored guitar runs will prompt for it without blocking.
- **Shared AudioWorklet capture (audio-pipeline, modified):** one reusable module — getUserMedia → AudioWorklet → hop-sized PCM frames, input level and onset events stamped on the audio clock — that the tuner uses first and the chord analyzer will reuse. The Vocal tab is not migrated in this change.
- **Renderer per instrument (notation-rendering, modified F5):** guitar songs render tab + standard notation with alphaTab; voice songs keep OSMD.
- **Guitar notation conversion (notation-rendering, new, supports F10):** load Guitar Pro 3–8, alphaTex, MusicXML/MXL (tab shown when the file carries string/fret) and MIDI; export MIDI (alphaTab `MidiFileGenerator`) and Guitar Pro 7. MIDI → tab via automatic fret assignment is specified here and lands right after M2.

## Capabilities

### New Capabilities

- `tuner`: guitar tuner in the onboarding sound check — string targets, nearest-string detection with manual lock, cents readout with in-tune hysteresis, too-quiet state, client-side only. Owns F39.

### Modified Capabilities

- `audio-pipeline`: the capture requirement now pins the shared AudioWorklet module's outputs (frames, level, onsets on the audio clock) and its context-injection seam.
- `notation-rendering`: F5 becomes renderer-per-instrument (alphaTab for guitar, OSMD for voice); adds the guitar notation conversion requirement (supports F10; storage of converted files stays with `song-storage`).

## Impact

- **New code:** `app/src/audio/capture/` (worklet, frame assembler, capture factory), `app/src/tabs/guitar/tuner/`, `app/src/tabs/guitar/notation/`, `app/src/tabs/guitar/song/`; new unit tests in `app/tests/`.
- **Dependencies added:** `@coderline/alphatab` and `@coderline/alphatab-vite` (both MPL-2.0). The Guitar Songs view is lazy-loaded so the tuner and Vocal tab never download alphaTab; alphaTab's chunks, soundfont and font are runtime-cached rather than precached.
- **Reused, unchanged:** Pitchy tracker and pitch math (`tabs/vocal/audio/pitchDetector.js`), MXL unzip and MIDI → MusicXML (`tabs/vocal/notation`, `tabs/vocal/midi`), download helpers (`exportNotation.js`).
- **Specs repo:** F39 added; F5/F10 annotated; tuning gap closed in `potential-problems.md`.

## Non-goals

- **Chord verification, Learn/Play modes, per-string state (F16–F18, F28–F34)** — the next guitar change, built on this capture layer.
- **Tying alphaSynth's clock to scoring** — alphaSynth runs its own `AudioContext`; the one-clock decision for guitar is recorded in design.md as open.
- **Alternate tunings** (Drop D, half-step down) — standard tuning only.
- **Cloud save of guitar songs** — depends on the storage-format decision in design.md.
- **Plain-text (ASCII) tab import** — could-have, later.
- Per the v1-scope OUT list: computer-vision finger placement (F25), group/social features (F26), YouTube play-along (F27), Changes mode (F38), piano.
