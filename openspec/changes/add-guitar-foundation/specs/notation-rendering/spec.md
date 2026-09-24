# Spec Delta

## MODIFIED Requirements

### Requirement: Tab and standard notation side by side (F5)
The system SHALL render guitar songs through alphaTab with tablature and standard notation side by side, and voice songs through OSMD with standard notation; in both cases the renderer's parsed score SHALL be the single source of truth for the expected notes consumed by scoring.

#### Scenario: Both staves render for a song
- **WHEN** a user opens a guitar practice piece whose file carries string/fret data
- **THEN** its tab and standard-notation staves render together
- **AND** the expected-note sequence handed to scoring derives from that same parsed score

#### Scenario: Voice songs keep the voice renderer
- **WHEN** a user opens a song in the Vocal tab
- **THEN** it renders through OSMD exactly as before

## ADDED Requirements

### Requirement: Guitar notation conversion (F10)
The system SHALL load guitar songs from Guitar Pro 3–8, alphaTex, MusicXML/MXL and MIDI files, and SHALL export a loaded guitar song as a Standard MIDI File and as Guitar Pro 7. MIDI input SHALL be given tablature by assigning every note a playable string and fret in standard tuning (one note per string in a chord, fretted span of at most four frets), and notes outside the guitar's range SHALL be shifted by octaves with the shift reported, never silently dropped.

#### Scenario: Guitar Pro file shows its tab
- **WHEN** a user opens a Guitar Pro file
- **THEN** its tab renders with the file's own strings and frets

#### Scenario: Export MIDI keeps the notes
- **WHEN** a user exports a guitar song as MIDI
- **THEN** the downloaded file is a valid Standard MIDI File whose note pitches and onsets match the song
- **AND** a song that was loaded from MIDI exports its original bytes

#### Scenario: MIDI input gets playable frets
- **WHEN** a MIDI file containing an open E minor chord (E2 B2 E3 G3 B3 E4) is converted to tab
- **THEN** the chord is fingered 0-2-2-0-0-0 from low E to high E
- **AND** no string carries two notes of one chord
