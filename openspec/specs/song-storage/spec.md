# Song Storage

## Purpose
Manages the song library (V1 seeds 3 songs), MusicXML import plus best-effort MuseScore/MIDI transformation into renderable notation, and private-by-default compressed per-attempt recordings via Supabase Storage with row-level security. Covers F9, F10, F23, N3, N5 (and seeds the F4 library).

## Requirements

### Requirement: Seeded Song Library (F4)
The system SHALL provide a song library seeded with at least the 3 V1 songs, each exposing renderable notation to the notation-rendering capability. (F4 — the "3 hardcoded songs"; the playlist UI that lists them is owned by `ui`.)

#### Scenario: Seed songs available to authenticated users
- **WHEN** an authenticated user requests the song library
- **THEN** at least the 3 seeded songs are returned with their notation file references
- **AND** each seeded song's notation can be loaded for rendering

#### Scenario: Seed songs are read-only to clients
- **WHEN** a user attempts to modify or delete a seeded/public song through the client
- **THEN** the write is denied
- **AND** the seeded library remains intact

### Requirement: MusicXML Import (F9)
The system SHALL let an authenticated user import a MusicXML score, store it as a song they own, and make it available for rendering. (F9)

#### Scenario: Valid MusicXML imported
- **WHEN** an authenticated user uploads a valid MusicXML file
- **THEN** a new song owned by that user is created referencing the stored notation
- **AND** it appears in that user's library and can be rendered

#### Scenario: Invalid file rejected gracefully
- **WHEN** a user uploads a file that is not valid MusicXML
- **THEN** the import fails with a clear error and no song is created
- **AND** the existing library is left unchanged

### Requirement: Best-Effort MuseScore/MIDI Transformation (F10)
The system SHALL attempt, best-effort, to transform an imported MuseScore or MIDI file into renderable notation, and SHALL fail gracefully without corrupting the library when it cannot. (F10)

#### Scenario: Convertible file transformed and stored
- **WHEN** a user imports a MuseScore or MIDI file that can be transformed
- **THEN** it is converted to renderable notation and stored as a song owned by that user

#### Scenario: Unconvertible file reported, library intact
- **WHEN** a MuseScore or MIDI file cannot be transformed
- **THEN** the user is informed the file could not be converted
- **AND** no partial or corrupt song is added to the library

### Requirement: Private Attempt-Recording Storage (F23, N5)
The system SHALL store a per-attempt audio recording, attach it to its run-through summary, and keep it private to the owning user by default via Supabase Storage with row-level security. (F23, N5)

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

### Requirement: Compressed Audio Storage (N3)
The system SHALL store attempt recordings compressed for storage and transfer efficiency. (N3)

#### Scenario: Recording stored compressed
- **WHEN** an attempt recording is uploaded
- **THEN** it is stored in a compressed audio format rather than raw PCM
- **AND** the stored/transferred size is materially smaller than the equivalent uncompressed audio
