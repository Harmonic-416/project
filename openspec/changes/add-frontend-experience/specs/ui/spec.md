# Spec Delta

## Purpose
The React app shell and all user-facing Harmonic screens. A thin reactive layer that renders scoring verdicts, notation, and progress/song data, and dispatches user intents.

## ADDED Requirements

### Requirement: Lesson flow display (F3)
The system SHALL present each lesson in three ordered stages — concept explanation, instrument-free drill, then played (mic) exercise — and SHALL support knowledge-only nodes (e.g. guitar anatomy) completable without microphone input.

#### Scenario: Concept precedes technique
- **WHEN** a user first opens a played-exercise lesson
- **THEN** the concept explanation shows first
- **AND** the instrument-free drill precedes the played exercise
- **AND** the played exercise is not reachable until the earlier stages are presented

#### Scenario: Knowledge-only node needs no mic
- **WHEN** a user opens a knowledge-only node such as "Meet the guitar"
- **THEN** it completes with tap/selection interactions only
- **AND** no microphone permission or audio input is required

### Requirement: Practice playlist (F4)
The system SHALL display a playlist of practice pieces including at least the three hardcoded V1 songs, each openable on the practice screen.

#### Scenario: V1 ships three songs
- **WHEN** a user opens the practice playlist
- **THEN** at least three pieces are listed
- **AND** selecting one opens its practice screen

### Requirement: Live pitch / relative-pitch feedback display (F12)
During a played exercise the system SHALL display in real time the detected sung note or its relative pitch against the expected note, from the scoring engine's normalized events.

#### Scenario: Sung note shown against expected
- **WHEN** a user sings while a note is expected
- **THEN** the detected note or its relative pitch is displayed in the live-feedback area
- **AND** the display updates as the detected pitch changes

### Requirement: Live chord and per-string state display (F34)
During a guitar run the system SHALL display live chord state — expected, heard-something-else, or heard-nothing — and SHALL render per-string indicators when cleanliness data (F17) is available.

#### Scenario: Chord state reflects detection
- **WHEN** the scoring engine reports the expected chord verified
- **THEN** the diagram shows the expected/verified state
- **WHEN** the scoring engine reports nothing was heard
- **THEN** the diagram shows a heard-nothing state, not wrong or verified

#### Scenario: Per-string indicators when available
- **WHEN** per-string cleanliness data is provided for the current strum
- **THEN** each of the six string indicators reflects that string's state

### Requirement: Always-visible skip / override control (F30)
The system SHALL display a skip/override control at all times during a lesson exercise; activating it SHALL dispatch a skip intent to the scoring engine (which records the manual skip).

#### Scenario: Skip is always reachable
- **WHEN** a user is on any note or chord during a gated lesson
- **THEN** the skip/override control is visible and enabled
- **AND** activating it advances past the current item and records a manual skip

### Requirement: Hint presentation (F31)
On request the system SHALL invoke reference playback of the expected note/chord once and animate the corresponding finger positions onto the fretboard chord diagram.

#### Scenario: Hint plays and shows fingering
- **WHEN** a user requests a hint on a guitar chord
- **THEN** the expected chord plays once through reference playback
- **AND** its finger positions animate onto the fretboard diagram

### Requirement: Chord-diagram label toggle (F35)
The system SHALL let the user toggle chord-diagram labels between fret numbers, note names, and finger numbers.

#### Scenario: Toggle changes diagram labels
- **WHEN** a user selects "note names"
- **THEN** each diagram dot is labeled with its note name
- **WHEN** the user switches to "finger numbers"
- **THEN** the same dots are relabeled with finger numbers

### Requirement: Run-through summary with patchy-area highlighting (F24)
The system SHALL present a run-through summary and SHALL let the user click the rendered music to highlight the attempt's patchy/spotty areas.

#### Scenario: Clicking summary music highlights weak spots
- **WHEN** a user clicks within the rendered music of a completed summary
- **THEN** the areas scored as patchy/spotty for that attempt are highlighted
