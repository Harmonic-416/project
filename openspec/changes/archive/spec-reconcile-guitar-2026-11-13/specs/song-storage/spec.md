# Song Storage

## REMOVED Requirements

### Requirement: Seeded Song Library (F4)
Replaced below by "Built-in songs and the public catalog (F4)". The error is in the name and in the
count: "at least the 3 V1 songs" is what rotted, so the replacement fixes no number. The library now
spans built-in songs for both instruments, a read-only public-domain catalog readable without an
account, and the user's own files — which are never uploaded.

## ADDED Requirements

### Requirement: Built-in songs and the public catalog (F4)
The system SHALL ship built-in songs for both instruments, each exposing renderable notation, and
SHALL make them playable with no account and no network. It SHALL also offer a read-only catalog of
public-domain songs curated by the team, readable without an account, each exposing renderable
notation. Built-in and catalog songs SHALL be read-only to clients. A song file the user opens from
their own device SHALL NOT be uploaded, for copyright reasons; it stays on that device.

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
