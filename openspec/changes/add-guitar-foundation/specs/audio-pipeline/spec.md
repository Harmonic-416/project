# Spec Delta

## MODIFIED Requirements

### Requirement: Client-side raw-PCM capture pipeline (N1, N2)
The system SHALL capture microphone input via getUserMedia into an AudioWorklet producing raw PCM on its own audio thread; all analysis SHALL run client-side and mic audio SHALL never be streamed to a server. Capture SHALL be one shared module that delivers fixed-hop PCM frames, the input level, and onset events whose timestamps come from the capture context's audio clock, and it SHALL accept an existing AudioContext so it can share a clock with playback.

#### Scenario: Capture produces PCM frames on the worklet thread
- **WHEN** microphone permission is granted and capture starts
- **THEN** the AudioWorklet emits raw PCM buffers at the audio context's frame rate
- **AND** no microphone audio leaves the device

#### Scenario: Frames arrive at a fixed hop with audio-clock positions
- **WHEN** capture is running
- **THEN** a frame is delivered every hop (512 samples) together with its RMS level
- **AND** each frame carries the sample position it ends at, so its time is position ÷ sample rate on the capture clock

#### Scenario: A sudden rise in energy produces an onset
- **WHEN** input energy jumps well above its recent average, as on a strum
- **THEN** an onset event is emitted with the sample position where it was detected

#### Scenario: Permission denied is handled
- **WHEN** the user denies microphone permission
- **THEN** capture does not start and a mic-unavailable state is surfaced rather than a crash
