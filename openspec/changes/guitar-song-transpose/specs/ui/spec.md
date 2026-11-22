## Purpose

Give guitarists the same manual semitone adjustment available in Vocal Songs.

## ADDED Requirements

### Requirement: Guitar Songs manual transpose control

Guitar Songs SHALL reuse the Vocal Songs manual semitone interaction and show the current shift, with zero labeled As written. The control SHALL apply only while a scored run or playback is inactive. It SHALL prevent changes while a local backing track is active, and backing-track activation SHALL require a zero shift. Incompatible controls SHALL explain how the player can return to the required setup. Opening a song for practice SHALL start As written.

#### Scenario: Player uses a local backing track

- **WHEN** a player tries to change the shift while local backing audio is active
- **THEN** the control displays the current shift and explains that backing audio must be turned off to change it
