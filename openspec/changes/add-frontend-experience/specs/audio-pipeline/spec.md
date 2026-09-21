# Spec Delta

## Purpose
The shared client-side audio foundation: getUserMedia + AudioWorklet raw-PCM capture feeding three pluggable analyzers (pitch, chord-FFT, RMS volume) that emit one normalized `{note, timestamp, confidence}` event. It owns gating, dynamics, and the make-or-break non-functionals — sub-100ms latency and mobile-Safari viability.

## ADDED Requirements

### Requirement: Client-side raw-PCM capture pipeline (N1, N2)
The system SHALL capture microphone input via getUserMedia into an AudioWorklet producing raw PCM on its own audio thread; all analysis SHALL run client-side and mic audio SHALL never be streamed to a server.

#### Scenario: Capture produces PCM frames on the worklet thread
- **WHEN** microphone permission is granted and capture starts
- **THEN** the AudioWorklet emits raw PCM buffers at the audio context's frame rate
- **AND** no microphone audio leaves the device

#### Scenario: Permission denied is handled
- **WHEN** the user denies microphone permission
- **THEN** capture does not start and a mic-unavailable state is surfaced rather than a crash

### Requirement: Pluggable analyzers emit one normalized event shape
The system SHALL feed the shared PCM buffer to three analyzers — pitch (single-note/voice), chord-FFT (guitar), and RMS-volume — and every analyzer SHALL emit the same `{note, timestamp, confidence}` event timestamped from the single transport clock, so scoring never learns which analyzer produced an event.

#### Scenario: Pitch analyzer emits normalized event
- **WHEN** a sustained single pitch is captured
- **THEN** the pitch analyzer emits a `{note, timestamp, confidence}` event with the detected note and a 0..1 confidence

#### Scenario: Chord analyzer emits the same shape
- **WHEN** a guitar chord is strummed
- **THEN** the chord-FFT analyzer emits a `{note, timestamp, confidence}` event of the identical shape (a chord verdict as `note`), not a different type

#### Scenario: Adding an analyzer does not change capture or scoring
- **WHEN** a new analyzer emitting the standard shape is registered
- **THEN** mic capture and the worklet are unchanged
- **AND** scoring consumes its events without instrument-specific code

### Requirement: Noise and volume gating (N6)
The system SHALL reject input that is too quiet or too noisy rather than mis-scoring it, and SHALL signal the too-quiet condition so scoring can raise the "couldn't hear you" state.

#### Scenario: Too-quiet input is rejected, not scored
- **WHEN** captured input is below the volume gate threshold
- **THEN** the pipeline emits a too-quiet signal instead of a pitched note
- **AND** no note reaches scoring as a hit or wrong note

#### Scenario: Background noise does not produce a false note
- **WHEN** only background noise (no clear pitch/chord) is present
- **THEN** the analyzers emit no high-confidence note for the noise

### Requirement: Dynamics detection (F19)
The system SHALL detect volume dynamics (rising/falling loudness) from the RMS-volume analyzer.

#### Scenario: Rising volume is detected
- **WHEN** the input's RMS energy increases over successive frames
- **THEN** the volume analyzer reports a rising-dynamics indication

### Requirement: Sub-100ms latency and mobile-Safari viability (N1, N2)
The system SHALL keep mic-to-score latency low enough for note-by-note feedback (target ≤100 ms), measured on a real phone in mobile Safari before dependent features are built on it.

#### Scenario: Latency is measured on real hardware
- **WHEN** a mic-to-score latency test runs on an iPhone in mobile Safari
- **THEN** the measured latency is recorded
- **AND** if it exceeds ≤100 ms, the desktop-first fallback is triggered rather than proceeding silently
