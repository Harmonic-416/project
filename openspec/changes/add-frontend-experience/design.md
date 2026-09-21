# Design

## Context

The frontend spans four capabilities forming one pipeline: `audio-pipeline` (capture) -> `notation-rendering` (expected notes + clock) -> `scoring-engine` (compare) -> `ui` (display + input). Motivation is in proposal.md; the tech stack (React+Vite PWA, AlphaTab/alphaSynth, Pitchy, native AnalyserNode FFT, Tone.js, Tonal.js, Supabase) is fixed context. This document pins only the choices that cross capability boundaries.

## Goals / Non-Goals

- **Goal:** Lock the one contract every capability depends on — the normalized event shape and the single transport clock — so the four can be built independently without drift.
- **Goal:** Keep scoring instrument-agnostic so "add an instrument = one new analyzer" holds.
- **Non-Goal:** Internal component structure, file layout, state-management library (local, deferred to implementation).
- **Non-Goal:** Server data model, auth, storage, PWA caching (owned by backend/devops).

## Decisions

### 1. Normalized analyzer event contract: `{note, timestamp, confidence}`

Every analyzer (pitch, chord-FFT, volume) emits the same event shape and nothing else crosses into scoring:

- `note` — the detected entity. Single-note analyzers emit a pitch (scientific notation, e.g. `E4`); the chord analyzer emits a verdict against the ONE expected chord (matched / not-matched, plus optional per-string cleanliness). The volume analyzer contributes gating + dynamics rather than a pitched note.
- `timestamp` — from the single transport clock (Decision 2), not `Date.now()`, so detected and expected notes share one time base.
- `confidence` — a normalized 0..1 clarity score scoring and the "couldn't hear you" state consume.

Rationale: scoring must never branch on instrument. A shared shape keeps it agnostic and makes new instruments additive. Per-instrument event types were rejected because they push instrument knowledge into scoring, breaking the modularity invariant.

### 2. One transport clock, no drift

AlphaTab's parsed score is the source of truth for expected notes; reference playback exposes ONE transport clock. Everything time-based — expected-note timing, playhead, countdown, seek target, event timestamps, and hit/late/missed windows — reads from it. `notation-rendering` owns the clock; `audio-pipeline` stamps events from it; `scoring-engine` compares on it. No capability keeps its own timeline.

Rationale: two clocks guarantee drift, making late/early scoring meaningless. Tempo changes (Decision 3) scale this one clock so scoring windows track tempo automatically.

### 3. Tempo scales the clock, persisted per song (F37)

Per-song tempo (50-100%) is applied by scaling the single clock, so expected-note timing and scoring windows move together. The value persists per song (via progress-tracking) so a returning user keeps their tempo. A must-have because chord changes require slowing down and "doesn't even let you choose the tempo" is a named competitor failure.

### 4. UI hint (F31) and skip (F30) surfaces are driven by other capabilities' state

The skip/override and hint are `ui` surfaces, but their behavior is not owned by `ui`:

- **Skip (F30)** dispatches a skip intent that `scoring-engine`'s state machine acts on (records a manual skip); `ui` only renders the control and dispatches the intent.
- **Hint (F31)** asks `notation-rendering` to play the expected chord/note once through the reference synth while `ui` animates the fingering — presentation over reference playback, not a new audio path.

Rationale: keeps mode logic in scoring-engine and playback in notation-rendering; `ui` stays a thin reactive layer that renders verdicts + mode state and dispatches intents.

### 5. Soft gate is a scoring-engine state machine, not UI enforcement (F13/F28/F29)

Guided-mode gating (hold until verified; advance after N=3 attempts; a miss = a failed attempt OR a silence-timeout with no onset) is a scoring-engine state machine. `ui` reflects the resulting state but never decides advancement. N=3 matches the miss count so a user never sees two different numbers.

## Risks / Trade-offs

- **Sub-100ms latency / mobile-Safari viability may not hold (N1, N2)** -> Validate on real iPhone Safari with a measured latency spike BEFORE building on top; one shared AudioWorklet buffer feeds all three analyzers; desktop-first is the documented fallback.
- **Wrong feedback is worse than no feedback** -> Gating rejects rather than mis-scores; the "couldn't hear you" state (F21) replaces scoring silence as a miss; the soft gate means a detection bug costs a point, not the session.
- **Polyphonic chord detection is hard** -> Scope is *verification* against the one expected chord (not arbitrary recognition), a handful of open chords, and cleanliness (F17) as a should, not a V1 guarantee.
- **Clock drift** -> Decision 2 mandates a single clock; no capability may keep an independent timeline.

## Open Questions

- A built-in tuner during onboarding is unspecified across the repo (pitch detection gives one nearly for free); flagged, not designed here, and outside this change's numbered requirements.
