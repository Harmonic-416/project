# Spec Delta

## Purpose
AlphaTab tab + standard-notation rendering (source of truth for expected notes) with alphaSynth/Tone.js reference playback on the single transport clock. It owns the countdown, click/drag-to-seek, per-song persisted tempo, the solfège toggle, and Tonal.js random melody / chord-progression generation.

## ADDED Requirements

### Requirement: Tab and standard notation side by side (F5)
The system SHALL render, via AlphaTab, guitar tablature and standard notation side by side, and the parsed score SHALL be the single source of truth for the expected notes consumed by scoring.

#### Scenario: Both staves render for a song
- **WHEN** a user opens a practice piece
- **THEN** its tab and standard-notation staves render together
- **AND** the expected-note sequence handed to scoring derives from that same parsed score

### Requirement: Toggleable reference playback (F6)
The system SHALL provide reference-audio playback the user can toggle on or off during practice.

#### Scenario: Reference audio can be toggled during practice
- **WHEN** a user turns reference playback on during a run
- **THEN** it plays in sync with the playhead
- **WHEN** the user turns it off
- **THEN** reference audio stops while the run continues

### Requirement: Single transport clock (F6)
The system SHALL drive playback, playhead, countdown, seek target, and scoring's timing base from ONE transport clock, so detected and expected notes share a single non-drifting timeline.

#### Scenario: One clock times everything
- **WHEN** playback is running
- **THEN** the playhead, expected-note timings, and analyzer event timestamps all derive from the same clock
- **AND** there is no second independent timeline

### Requirement: Click/drag to seek (F7)
The system SHALL let the user click or drag anywhere in the rendered music to start playback from that point.

#### Scenario: Click seeks the playhead
- **WHEN** a user clicks a position in the rendered music
- **THEN** playback and the playhead move there and can start from it

### Requirement: Pre-run countdown (F8)
The system SHALL play a countdown before a practice run begins.

#### Scenario: Countdown precedes the run
- **WHEN** a user starts a practice run
- **THEN** a countdown plays before the first expected note is scored

### Requirement: Per-song tempo control, persisted (F37)
The system SHALL provide a 50-100% tempo control on the practice screen, scale the single transport clock accordingly, and persist the chosen tempo per song.

#### Scenario: Tempo scales the clock within range
- **WHEN** a user sets tempo to 60%
- **THEN** playback, playhead, and scoring windows all run at 60% of written tempo
- **AND** values below 50% or above 100% are not allowed

#### Scenario: Tempo persists per song
- **WHEN** a user sets a tempo for a song and later reopens it
- **THEN** the previously chosen tempo is restored

### Requirement: Solfège notation-label toggle (F15)
The system SHALL let the user toggle solfège labels on the notation for voice sight-reading.

#### Scenario: Solfège labels toggle on and off
- **WHEN** a user enables the solfège toggle
- **THEN** solfège labels are shown
- **WHEN** the user disables it
- **THEN** the labels are hidden

### Requirement: Random melody generation (F20)
The system SHALL generate random voice sight-reading melodies via Tonal.js as a renderable expected-note sequence.

#### Scenario: Generated melody is renderable and scorable
- **WHEN** a user requests a random sight-reading melody
- **THEN** a melody is generated and rendered as notation
- **AND** its expected-note sequence is available to scoring

### Requirement: Random chord-progression generation (F36)
The system SHALL generate random chord progressions drawn only from the user's unlocked chords, at a chosen tempo, as a renderable expected-note sequence.

#### Scenario: Progression uses only unlocked chords
- **WHEN** a user requests a random chord progression at a chosen tempo
- **THEN** the progression contains only unlocked chords
- **AND** it renders as notation with expected timing at the chosen tempo
