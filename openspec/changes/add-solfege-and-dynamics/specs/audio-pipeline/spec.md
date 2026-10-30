# Spec Delta

## MODIFIED Requirements

### Requirement: Dynamics detection (F19)
The system SHALL detect volume dynamics (rising/falling loudness) from the RMS level of the sung frames. While the microphone listens, it SHALL show the current level and whether it is rising, falling or steady. After a recorded attempt, it SHALL report the range from softest to loudest and the crescendos and diminuendos sung.

#### Scenario: Rising volume is detected
- **WHEN** the input's RMS energy increases over successive frames
- **THEN** the volume analyzer reports a rising-dynamics indication

#### Scenario: Falling volume is detected
- **WHEN** the input's RMS energy decreases over successive frames
- **THEN** the volume analyzer reports a falling-dynamics indication

#### Scenario: Note attacks are not crescendos
- **WHEN** a singer holds an even volume across a run of notes, each with a short attack
- **THEN** the attempt summary reports an even volume and no crescendos or diminuendos

#### Scenario: A breath splits phrases
- **WHEN** a soft phrase is followed, after a breath, by a loud phrase
- **THEN** no crescendo is reported across the breath
