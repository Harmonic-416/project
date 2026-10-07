# Spec Delta

## MODIFIED Requirements

### Requirement: Per-song tempo control, persisted (F37)
The system SHALL provide a tempo control from 50% to 100% of the written tempo, in 5% steps. It SHALL be available on the Vocal tab's follow-along playback and in the Guitar Songs player.

The chosen tempo SHALL scale the single transport clock. Playback, the playhead, the metronome clicks and count-in, and scoring's timing windows SHALL all run at that tempo, while recorded and scored times stay in score time.

The printed tempo marks on the rendered score SHALL show the effective tempo.

The chosen tempo SHALL be remembered per song on the device.

#### Scenario: Tempo scales the clock within range
- **WHEN** a user sets tempo to 60%
- **THEN** playback, playhead, and scoring windows all run at 60% of written tempo
- **AND** values below 50% or above 100% are not allowed

#### Scenario: The metronome follows the tempo
- **WHEN** a song written at quarter = 120 in 4/4 plays at 50% with the metronome and count-in on
- **THEN** the count-in and the beat clicks sound every 1 s, in step with the playhead
- **AND** changing the tempo mid-song changes the click spacing without stopping playback

#### Scenario: The printed tempo mark shows the tempo being played
- **WHEN** a song whose score is marked ♩ = 120 is set to 60%
- **THEN** the rendered score reads ♩ = 72 and the control reads 60% · ♩ = 72
- **AND** exported files keep the written ♩ = 120

#### Scenario: A slowed attempt lines up with the score
- **WHEN** a user records or shares a vocal attempt at 70%
- **THEN** each sung pitch is stamped with its time in the score, not the slowed clock
- **AND** the attempt is judged against the same notes it would be at full speed

#### Scenario: Tempo persists per song
- **WHEN** a user sets a tempo for a song and later reopens it
- **THEN** the previously chosen tempo is restored
- **AND** a different song keeps its own tempo
