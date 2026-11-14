# UI

## MODIFIED Requirements

### Requirement: Lesson flow display (F3)
The system SHALL present each instrument's learning activities as a list the player chooses from,
each naming what it teaches and how far the player has got, and SHALL open any available activity
directly. It SHALL NOT impose a concept → drill → played-exercise sequence, and SHALL NOT require
microphone permission for an activity that does not listen.

The three-stage sequence was cut: it was hard to say where a drill belonged in the path, so players
now choose when to do one, and Exercises are their own section rather than a stage inside a lesson
(master design document §7.1, F3).

#### Scenario: Activities are listed with their progress
- **WHEN** a user opens an instrument's Learn section
- **THEN** each activity is listed with a description and the player's progress in it
- **AND** selecting one opens it directly

#### Scenario: An activity that does not listen needs no microphone
- **WHEN** a user opens an activity that does not listen, such as ear training
- **THEN** it completes with taps and selections alone
- **AND** no microphone permission is requested

### Requirement: Live chord and per-string state display (F34)
During a guitar run the system SHALL display live chord state — expected, heard-something-else, or
heard-nothing — and SHALL render an indicator for each of the six strings from the per-string
verdicts (F17).

Edited for coherence, beyond S2's list: its previous text rendered per-string indicators "when
cleanliness data (F17) is available", and after this change F17 is the requirement that forbids a
cleanliness score. Leaving it would have pointed one requirement at the negation of another.

#### Scenario: Chord state reflects detection
- **WHEN** the scoring engine reports the expected chord verified
- **THEN** the diagram shows the expected/verified state
- **WHEN** the scoring engine reports nothing was heard
- **THEN** the diagram shows a heard-nothing state, not wrong or verified

#### Scenario: Per-string indicators reflect each string's verdict
- **WHEN** per-string verdicts are provided for the current strum
- **THEN** each of the six string indicators shows that string as rang-clean, buzzed-or-wrong, or not heard yet
- **AND** a string the chord does not use is shown as not played

## REMOVED Requirements

### Requirement: Practice playlist (F4)
Replaced below by "Song library display (F4)". The name and its "three hardcoded V1 songs" are the
error: the playlist was superseded by the library, search, uploads and transcription drafts.

## ADDED Requirements

### Requirement: Song library display (F4)
The system SHALL display the songs available to practise — the built-in songs, the files the user
has opened on this device, and transcriptions drafted on it — each openable on the practice screen,
and SHALL offer an upload at all times plus the online catalog and the user's practice sessions when
the cloud is configured. It SHALL NOT be limited to a fixed playlist, and the built-in songs,
uploads and playback SHALL work with no account and no network.

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
