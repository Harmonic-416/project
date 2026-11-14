# Notation Rendering

## Purpose
Notation rendering and reference playback, one renderer per instrument: alphaTab for guitar (tab and standard notation together, and the source of the guitar timeline's ticks), OpenSheetMusicDisplay for voice (its cursor gives the timing model), with alphaSynth and Tone.js playback on the single transport clock. It owns guitar notation conversion in and out, generated tab for files that carry no string or fret data, the countdown, click-and-drag seek, the per-song tempo control, the solfège toggle, and drawing the exercise material the player chose or has already learned.

## Requirements

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

### Requirement: Exercise material comes from what the player chose or learned (F20, F36)
The system SHALL draw the material for a generated exercise from what the player has chosen to train or has already learned, never from random generation. The chord-recognition exercises SHALL ask only the chords the player picked, or the chords of the song they last opened, and SHALL weight a chord they keep missing to come up more often. The lesson play-through SHALL use the chords the player has most recently cleared, falling back to a fixed beginner progression until four have been cleared. Generated material SHALL render as notation or as a chord diagram, with its expected notes available to scoring wherever the exercise is scored.

Random chords a beginner has not learned yet are not practice (master design document §7.1, F20/F36).

#### Scenario: A chord-recognition round asks only chosen chords
- **WHEN** a player starts a chord-recognition round
- **THEN** every chord asked comes from the set they picked, or from the song they last opened
- **AND** no chord outside that set is asked

#### Scenario: Missed chords come up more often
- **WHEN** a player has answered one chord wrongly more often than another
- **THEN** the chord they miss more is more likely to be asked

#### Scenario: The play-through uses cleared chords
- **WHEN** a player has cleared four or more chords and starts the lesson play-through
- **THEN** its chords are ones they have cleared

#### Scenario: Before four are cleared, a fixed beginner progression is used
- **WHEN** a player has cleared fewer than four chords and starts the lesson play-through
- **THEN** a fixed beginner progression is used instead
- **AND** no unlearned chord is introduced at random
