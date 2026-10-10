# Spec Delta

## MODIFIED Requirements

### Requirement: Noise and volume gating (N6)
The system SHALL reject input that is too quiet or too noisy rather than mis-scoring it, and SHALL signal the too-quiet condition so scoring can raise the "couldn't hear you" state. A sound SHALL count as a played note only if it is tonal and keeps ringing above the room's noise floor, so short transients such as typing SHALL be ignored.

#### Scenario: Too-quiet input is rejected, not scored
- **WHEN** captured input is below the volume gate threshold
- **THEN** the pipeline emits a too-quiet signal instead of a pitched note
- **AND** no note reaches scoring as a hit or wrong note

#### Scenario: Background noise does not produce a false note
- **WHEN** only background noise (no clear pitch/chord) is present
- **THEN** the analyzers emit no high-confidence note for the noise

#### Scenario: Clicks and taps are not notes
- **WHEN** a short sound with no sustained pitch occurs, such as typing near the microphone or a tap on the guitar body
- **THEN** no verdict is produced for it
- **AND** it does not count as an attempt
