# Song Storage

## Purpose
Manages the song library — built-in songs for both instruments, a read-only public-domain catalog readable without an account, and notation import (MusicXML, MXL, MIDI, Guitar Pro and alphaTex, best-effort) — plus private-by-default compressed per-run recordings via Supabase Storage with row-level security. A file the user opens from their own device is never uploaded. Covers F9, F10, F23, N3, N5 and the storage side of F4.

## Requirements

### Requirement: Built-in songs and the public catalog (F4)
The system SHALL ship built-in songs for both instruments, each exposing renderable notation, and SHALL make them playable with no account and no network. It SHALL also offer a read-only catalog of public-domain songs curated by the team, readable without an account, each exposing renderable notation. Built-in and catalog songs SHALL be read-only to clients. A song file the user opens from their own device SHALL NOT be uploaded, for copyright reasons; it stays on that device. (F4 — the library UI that lists them is owned by `ui`.)

No fixed number of songs is specified: the count is a product decision, not a contract.

#### Scenario: Built-in songs work with no account and no network
- **WHEN** a user with no account opens an instrument's song list
- **THEN** that instrument's built-in songs are listed with their notation
- **AND** each can be loaded and rendered

#### Scenario: The catalog is readable without an account
- **WHEN** anyone requests the public catalog
- **THEN** its songs are returned with their notation file references
- **AND** no sign-in is required to read them

#### Scenario: Public and built-in songs are read-only to clients
- **WHEN** a client attempts to modify or delete a catalog or built-in song
- **THEN** the write is denied
- **AND** the library remains intact

#### Scenario: The user's own songs are never uploaded
- **WHEN** a user opens a song file of their own
- **THEN** it is kept on their device
- **AND** no copy of the file is sent to the server

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
