# Spec Delta

## ADDED Requirements

### Requirement: Vocal arranger (F42)
The system SHALL turn a recording of a song into a new arrangement for voices — TTBB, SATB or two parts — with the song's melody in one part and its chords sung by the others. The arrangement SHALL open in the Vocal tab like any other song, with playback, a tab per part, part practice and MIDI and MusicXML export. Arranging from an audio file SHALL run on the device without uploading the recording.

#### Scenario: A song with a band becomes TTBB
- **WHEN** a user arranges a recording of a solo singer with a band for TTBB
- **THEN** a four-part score opens with Tenor 1, Tenor 2, Baritone and Bass
- **AND** the melody is in Tenor 1, in a key that fits its range
- **AND** the other parts sing the chord on each beat in their ranges, without crossing the melody

#### Scenario: A YouTube link names the performance
- **WHEN** a user pastes a YouTube link and chooses an audio file
- **THEN** the arrangement is titled after the video and links back to it

#### Scenario: Team members arrange from the link alone
- **WHEN** a signed-in user on the arranger list asks for an arrangement of a YouTube link
- **THEN** the job is queued and its progress shown
- **AND** the arrangement opens when the server has finished it
- **AND** no audio is kept on the server or sent to the user
- **AND** the sung words are written under the notes, the published lyrics when they can be found

#### Scenario: Others can't queue server jobs
- **WHEN** a user not on the arranger list asks the server for an arrangement
- **THEN** the request is refused and the user is told to choose the audio file instead
