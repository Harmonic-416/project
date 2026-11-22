## Purpose

Make feedback on a shared guitar performance available alongside its score and recording.

## ADDED Requirements

### Requirement: Comments on shared guitar notation (F26)

Guitar Songs SHALL display the existing comment thread in shared guitar playback. A user with permission to comment on the shared run SHALL be able to post a general comment or anchor a comment to a valid score position belonging to that attempt. The server SHALL enforce the existing comment access rules and reject invalid anchors.

#### Scenario: Reviewer leaves feedback on the score

- **WHEN** an authorized reviewer selects a scored position and submits a comment
- **THEN** the comment appears in the thread and is marked at that position on the tab

#### Scenario: Existing comments and permissions carry over

- **WHEN** a reader opens a shared guitar run containing an older comment without an anchor
- **THEN** the comment appears as general feedback
- **AND** users without comment permission cannot post through the song view or its API

### Requirement: Navigation from anchored comments (F26)

Selecting an anchored comment SHALL move the score to its stored position and seek the shared recording when that position maps to the recording. An unavailable recording or timing map SHALL still allow score navigation when the anchor can be resolved. An unresolvable anchor SHALL leave the comment readable without offering a seek action.

#### Scenario: A shared recording contains a pause

- **WHEN** a reader selects an anchored comment on a note played after a pause
- **THEN** the tab moves to the note and the recording seeks to the corresponding recorded moment using the attempt's timing

#### Scenario: A legacy run has no timing map

- **WHEN** a reader selects a resolvable anchor on a run without recording timing
- **THEN** the tab moves to the score position without jumping the recording
