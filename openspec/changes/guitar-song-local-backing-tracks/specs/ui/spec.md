## Purpose

Let a guitarist import and manually line up a local recording with a passage on the tab.

## ADDED Requirements

### Requirement: Import and preview a local guitar backing track

Guitar Songs SHALL offer a local MP3 or WAV picker and audio preview while a song is open in Listen mode. The interface SHALL report unreadable or unsupported files and SHALL keep normal score playback available. The interface SHALL let the player deactivate or remove the backing track and return to score playback.

#### Scenario: A recording cannot be decoded

- **WHEN** the player selects a file the browser cannot decode
- **THEN** Guitar Songs reports the failure and the score remains available for normal practice

### Requirement: Set two manual alignment points

The player SHALL be able to select a start and end position on the tab and pair each with a timestamp in the preview. The interface SHALL reject reversed, equal, or out-of-bounds positions before enabling backing playback. Completing alignment SHALL leave playback stopped until the player presses Play.

#### Scenario: Align a passage in a take with a recorded intro

- **WHEN** the player pairs two positions on the tab with their corresponding times after the recording's intro
- **THEN** Guitar Songs shows the aligned passage and makes it available through the existing transport
