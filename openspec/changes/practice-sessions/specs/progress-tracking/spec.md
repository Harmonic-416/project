# Spec Delta

## ADDED Requirements

### Requirement: Practice Sessions (F22)
The system SHALL group a signed-in user's attempts at a song into practice sessions stored on the account. A session SHALL start when the user opens a song to practise and SHALL end when they leave it, or after 30 minutes without an attempt, in which case it ends at its last activity. Every attempt finished while a session is open SHALL belong to it. Sessions and their attempts SHALL be listed per song, most recent session first, with each attempt's time, score, part and feedback, and SHALL be visible only to their owner.

#### Scenario: Attempts join the open session
- **WHEN** a signed-in user opens a song in the Vocal tab and records two attempts
- **THEN** one session exists for that sitting with both attempts attached, in order
- **AND** the "This session" list under the score shows both

#### Scenario: Leaving ends the session
- **WHEN** the user goes back to the song library (or closes the tab and later returns)
- **THEN** the session's end time is set
- **AND** opening the song again starts a new session

#### Scenario: Idle for 30 minutes
- **WHEN** 30 minutes pass after the last attempt and the user records another
- **THEN** the earlier session ends at the time of its last attempt
- **AND** the new attempt is attached to a new session

#### Scenario: Sessions are listed per song and per user
- **WHEN** the user opens Practice sessions for a song from the song library or from Home's "Working on"
- **THEN** their previous sessions for that song are listed, newest first, each with its attempts and feedback
- **AND** another user's sessions and attempts are never returned

### Requirement: Owner Feedback on an Attempt
The system SHALL let the owner of an attempt keep a note and a rating from 1 to 5 on it. The note SHALL save automatically shortly after the owner stops typing, SHALL be editable later from the sessions view, SHALL survive across browsers and devices, and SHALL NOT be shown to anyone the attempt is shared with.

#### Scenario: Note autosaves and comes back
- **WHEN** the owner types a note under an attempt and stops typing
- **THEN** the note is saved without pressing a button
- **AND** opening the sessions view on another device shows the same note and rating

#### Scenario: Feedback stays private
- **WHEN** a friend opens an attempt that was sent to them, or anyone opens it by link
- **THEN** the attempt's note and rating are not included in what they receive
