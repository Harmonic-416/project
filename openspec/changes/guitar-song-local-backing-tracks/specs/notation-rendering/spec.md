## Purpose

Keep imported backing audio and the tab synchronized through the existing Guitar Songs transport.

## ADDED Requirements

### Requirement: Backing audio follows the score transport (F6)

While backing audio is active in Listen mode, Guitar Songs SHALL map score positions to recording timestamps using the two alignment points and a constant ratio between them. Play, Pause, Stop, seeking, the tab cursor, and loop boundaries SHALL use the existing score transport. Synthesized accompaniment SHALL be muted while the backing recording supplies accompaniment. Backing playback SHALL stay within the aligned span and SHALL stop at its end unless an active loop is wholly inside the span. Seeks outside the span SHALL land at the nearest valid boundary.

#### Scenario: Seek and loop inside an aligned passage

- **WHEN** the player seeks to a bar inside the aligned span and enables a loop contained in that span
- **THEN** the recording seeks to the mapped timestamp and restarts at the mapped loop start on each repeat as the tab cursor returns there

#### Scenario: Switch to a scored practice mode

- **WHEN** the player leaves Listen mode
- **THEN** backing playback stops and the selected scored mode uses its existing audio path

### Requirement: Backing audio respects the existing tempo control (F37)

The existing tempo control SHALL scale backing playback from 50% to 100% of the aligned practice tempo while preserving pitch. The recording and tab SHALL stay aligned when the tempo changes or a loop repeats. If the combined playback rate cannot be supported with pitch preservation, Guitar Songs SHALL report the limitation and offer normal score playback.

#### Scenario: Slow down an aligned loop

- **WHEN** the player changes tempo from 100% to 75% and plays an aligned loop
- **THEN** the recording and tab take the longer time to traverse the passage, stay in sync on each repeat, and preserve the recording's pitch
