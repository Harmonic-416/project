# Spec Delta

## MODIFIED Requirements

### Requirement: Solfège notation-label toggle (F15)
The system SHALL let the user toggle solfège labels on the notation for voice sight-reading. The setting SHALL be remembered on the device and SHALL default to off. The labels SHALL be movable do, read in the score's key, with minor keys read la-based. Labelling SHALL change only what is displayed: the score as exported or shared SHALL be unchanged.

#### Scenario: Solfège labels toggle on and off
- **WHEN** a user enables the solfège toggle
- **THEN** solfège labels are shown
- **WHEN** the user disables it
- **THEN** the labels are hidden

#### Scenario: Labels follow the key
- **WHEN** solfège is on for Ode to Joy in C major
- **THEN** its opening reads mi mi fa sol sol fa mi re, on a line under the lyrics

#### Scenario: A MIDI file without a key signature
- **WHEN** solfège is on for a MIDI song in E that converted with no key signature
- **THEN** do is E, worked out from the notes, and the hint says so

#### Scenario: The choice is remembered
- **WHEN** a user turns solfège on and later reopens the app on the same device
- **THEN** the labels are still on
