## Purpose

Use the pitches shown and played by the shifted guitar score as the judging targets.

## ADDED Requirements

### Requirement: Guitar scoring follows the selected semitone shift

Guitar Songs SHALL feed expected notes, chord tones, and pitched practice hints from the same shifted score representation used by playback and notation. It SHALL apply the existing scoring rules to those pitches and SHALL keep the shift fixed for the duration of a scored run.

#### Scenario: Judge a retuned open string

- **WHEN** the player starts a scored run at −1 and plays the expected open string in tune with the displayed shifted tuning
- **THEN** scoring compares the input with the shifted pitch at the original score position
