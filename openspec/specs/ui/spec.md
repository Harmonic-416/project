# UI

## Purpose
The React app shell and all user-facing Harmonic screens. A thin reactive layer that renders scoring verdicts, notation, and progress/song data, and dispatches user intents.

## Requirements

### Requirement: Lesson flow display (F3)
The system SHALL present each instrument's learning activities as a list the player chooses from, each naming what it teaches and how far the player has got, and SHALL open any available activity directly. It SHALL NOT impose a concept → drill → played-exercise sequence, and SHALL NOT require microphone permission for an activity that does not listen.

The three-stage sequence was cut: it was hard to say where a drill belonged in the path, so players now choose when to do one, and Exercises are their own section rather than a stage inside a lesson (master design document §7.1, F3).

#### Scenario: Activities are listed with their progress
- **WHEN** a user opens an instrument's Learn section
- **THEN** each activity is listed with a description and the player's progress in it
- **AND** selecting one opens it directly

#### Scenario: An activity that does not listen needs no microphone
- **WHEN** a user opens an activity that does not listen, such as ear training
- **THEN** it completes with taps and selections alone
- **AND** no microphone permission is requested

### Requirement: Song library display (F4)
The system SHALL display the songs available to practise — the built-in songs, the files the user has opened on this device, and transcriptions drafted on it — each openable on the practice screen, and SHALL offer an upload at all times plus the online catalog and the user's practice sessions when the cloud is configured. It SHALL NOT be limited to a fixed playlist, and the built-in songs, uploads and playback SHALL work with no account and no network.

#### Scenario: Built-in songs are listed and open for practice
- **WHEN** a user opens the Songs section
- **THEN** the built-in songs are listed
- **AND** selecting one opens it on the practice screen

#### Scenario: The user's own material sits alongside the built-ins
- **WHEN** the user has files or transcription drafts kept on this device
- **THEN** they are listed alongside the built-in songs and open the same way

#### Scenario: Signed out and offline still practises
- **WHEN** the cloud is not configured, or the user is signed out
- **THEN** the built-in songs, the upload control and playback are still available
- **AND** the cloud-only entries (catalog search, practice sessions) are not shown

### Requirement: Live pitch / relative-pitch feedback display (F12)
During a played exercise the system SHALL display in real time the detected sung note or its relative pitch against the expected note, from the scoring engine's normalized events.

#### Scenario: Sung note shown against expected
- **WHEN** a user sings while a note is expected
- **THEN** the detected note or its relative pitch is displayed in the live-feedback area
- **AND** the display updates as the detected pitch changes

### Requirement: Live chord and per-string state display (F34)
During a guitar run the system SHALL display live chord state — expected, heard-something-else, or heard-nothing — and SHALL render an indicator for each of the six strings from the per-string verdicts (F17).

#### Scenario: Chord state reflects detection
- **WHEN** the scoring engine reports the expected chord verified
- **THEN** the diagram shows the expected/verified state
- **WHEN** the scoring engine reports nothing was heard
- **THEN** the diagram shows a heard-nothing state, not wrong or verified

#### Scenario: Per-string indicators reflect each string's verdict
- **WHEN** per-string verdicts are provided for the current strum
- **THEN** each of the six string indicators shows that string as rang-clean, buzzed-or-wrong, or not heard yet
- **AND** a string the chord does not use is shown as not played

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
