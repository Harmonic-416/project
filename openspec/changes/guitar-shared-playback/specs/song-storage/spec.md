# Spec Delta

## MODIFIED Requirements

### Requirement: Private Attempt-Recording Storage (F23, N5)
The system SHALL store a per-attempt audio recording, attach it to its run-through summary, and keep it private to the owning user by default via Supabase Storage with row-level security. (F23, N5) A guitar song run, Wait for me or Trouble spots, SHALL be recorded. When it is shared with its recording, the person opening it SHALL hear that recording and not the song's MIDI, and the tab's cursor SHALL follow the recording to the note being played at each moment.

#### Scenario: Recording attached to its summary
- **WHEN** an authenticated user completes an attempt with recording enabled
- **THEN** the recording is stored and linked to that attempt's run-through summary
- **AND** the owning user can retrieve it from that summary

#### Scenario: Recording private to owner
- **WHEN** a user other than the owner attempts to access a stored recording
- **THEN** access is denied
- **AND** no recording data or usable URL is returned to the non-owner

#### Scenario: Access requires authentication
- **WHEN** a recording is requested without a valid session
- **THEN** the request is denied

#### Scenario: A shared guitar run plays the player's recording
- **WHEN** a user opens a guitar run a friend sent them with its recording
- **THEN** the run's recording is offered to play
- **AND** the song's MIDI playback is not offered

#### Scenario: The cursor follows the recording
- **WHEN** the person opening a shared Trouble spots run plays its recording
- **THEN** the tab's cursor moves along the notes at the speed and tempo the run was played
- **AND** it stays put over a stretch where the player had paused

#### Scenario: A Wait for me run is recorded and followed note by note
- **WHEN** a user plays Wait for me to the end, pausing once, and sends the run to a friend
- **THEN** the friend hears one recording of the whole run
- **AND** while it plays, the cursor sits on each note until the moment it was played
