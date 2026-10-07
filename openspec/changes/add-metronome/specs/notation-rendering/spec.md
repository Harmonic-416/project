# Spec Delta

## ADDED Requirements

### Requirement: Metronome and count-in (F40)
The system SHALL offer a metronome on reference playback in both the Vocal tab and the Guitar Songs player. It SHALL provide:
- an optional click on every beat of the song's meter, with the downbeat marked;
- an optional one-bar count-in before playback starts;
- a click-volume control.

The clicks SHALL be driven by the same transport clock as playback and the playhead. The settings SHALL be remembered on the device.

#### Scenario: Clicks fall on the beats with the downbeat marked
- **WHEN** a user turns the metronome on and plays a song in 4/4 at quarter = 120
- **THEN** a click sounds every 0.5 s in step with the playhead
- **AND** every fourth click, on beat 1, is marked as the downbeat

#### Scenario: Pickup bars and compound meters
- **WHEN** a voice song in 3/4 opens with a one-beat pickup
- **THEN** the pickup clicks as beat 3 and the first full bar starts on the downbeat
- **AND** a voice song in 6/8 clicks twice a bar, on the dotted quarters

#### Scenario: Count-in precedes playback and is never scored
- **WHEN** count-in is on and the user presses Play
- **THEN** one bar of clicks sounds at the song's tempo before the first note
- **AND** no pitch heard during the count-in is recorded or scored against the song

#### Scenario: One clock through pause, seek and stop
- **WHEN** the user pauses, seeks or stops while the metronome is on
- **THEN** clicks stop and resume with the playhead and stay on the beat
- **AND** pausing during a count-in leaves the playhead where it was

#### Scenario: The click is not heard as a note
- **WHEN** the metronome clicks through the speakers during a recorded vocal attempt
- **THEN** the pitch tracker reports no pitch for the click

#### Scenario: Settings are remembered
- **WHEN** a user changes the metronome, count-in or volume and later opens another song in either tab
- **THEN** the same settings apply
