# Spec Delta

## Purpose
A guitar tuner in the onboarding sound check, so that chord verdicts are never really an out-of-tune guitar: it names the string being played, shows how far it is from standard tuning, and confirms when it holds in tune — all client-side.

## ADDED Requirements

### Requirement: Standard tuning targets (F39)
The system SHALL tune against standard tuning with these open-string targets: E2 82.41 Hz, A2 110.00 Hz, D3 146.83 Hz, G3 196.00 Hz, B3 246.94 Hz, E4 329.63 Hz.

#### Scenario: Each open string maps to its target
- **WHEN** a steady tone at one of the six target frequencies is detected
- **THEN** the tuner selects that string and reports approximately 0 cents

### Requirement: Nearest-string detection with manual lock (F39)
The system SHALL select the string whose target is nearest to the detected pitch, within ±600 cents, unless the user has locked a string, and SHALL filter readings so that a single stray or harmonic reading does not switch strings.

#### Scenario: Auto-detect picks the nearest string
- **WHEN** no string is locked and a pitch 30 cents above A2 is detected
- **THEN** the tuner selects A2 and reports about +30 cents

#### Scenario: Locked string ignores other strings
- **WHEN** the user has locked low E and a pitch nearer to A2 is detected
- **THEN** the tuner still measures against low E

#### Scenario: A harmonic does not flip the string
- **WHEN** low E is being tuned and one reading jumps to its second harmonic
- **THEN** the selected string stays low E

### Requirement: Cents readout and in-tune state (F39)
The system SHALL show the deviation from the target in cents over at least a ±50 cent range, update it at least 20 times per second while a string sounds, and mark the string in tune once it stays within ±5 cents for 0.5 s, clearing that mark only after it leaves ±8 cents.

#### Scenario: Sharp string reads positive cents
- **WHEN** a pitch of 115 Hz is detected against A2
- **THEN** the readout shows about +77 cents (sharp)

#### Scenario: Holding in tune marks the string
- **WHEN** the reading stays within ±5 cents of the target for 0.5 s
- **THEN** the string is marked in tune
- **AND** small wobble within ±8 cents does not clear the mark

### Requirement: Too-quiet input is not measured (F39)
When input is below the level or clarity gate, the system SHALL show a "play a string" state and SHALL NOT move the readout.

#### Scenario: Silence shows play-a-string
- **WHEN** capture is running and no string is sounding
- **THEN** the tuner shows "play a string" and no cents value

### Requirement: Sound-check placement (F39)
The system SHALL offer the tuner from the Guitar tab and SHALL prompt for it before scored guitar runs, without ever blocking a run.

#### Scenario: Tuner reachable from the Guitar tab
- **WHEN** a user opens the Guitar tab
- **THEN** the tuner is one tap away and starts only after the user taps Start

### Requirement: Client-side tuning (F39)
The system SHALL analyze tuner audio on the device only; microphone audio SHALL NOT leave the device.

#### Scenario: No audio is uploaded
- **WHEN** the tuner is running
- **THEN** no request carries microphone audio
