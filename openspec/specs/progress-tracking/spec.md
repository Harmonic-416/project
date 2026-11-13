# Progress Tracking

## Purpose
Persists per-user progress: the guitar chord lessons, which open one at a time in teaching order, the run history with the last and best score per song, and the per-song tempo. Covers F2, F22 and the persistence side of F37. There is no lesson map and no prerequisite graph.

## Requirements

### Requirement: Per-User Progress Persistence (F2)
The system SHALL durably persist each user's lesson-node completion state against their account so progress survives across sessions and devices. (F2)

#### Scenario: Completion persists across sessions
- **WHEN** an authenticated user completes a lesson node and returns in a new session
- **THEN** that node is still recorded as completed
- **AND** their unlock state reflects that completion

#### Scenario: Progress is per-user
- **WHEN** two authenticated users complete different nodes
- **THEN** each user's completion state is stored independently
- **AND** neither user's progress is visible to the other

### Requirement: Ordered chord unlocking (F2)
The system SHALL open the guitar chord lessons one at a time in teaching order: the first is always open, and each later one opens once the lesson before it is cleared — either passed, or skipped via "Unlock anyway". It SHALL NOT model lessons as nodes in a graph with declared prerequisites, and there is no lesson map. Cleared state SHALL persist against the account while signed in and in the browser otherwise, and the two SHALL merge when a signed-out player signs in, a pass taking precedence over a skip for the same lesson.

#### Scenario: Clearing a lesson opens the next
- **WHEN** a player clears a chord lesson
- **THEN** the next chord in teaching order becomes available
- **AND** the one after it stays locked

#### Scenario: An uncleared lesson locks everything after it
- **WHEN** a chord lesson has not been cleared
- **THEN** every lesson after it in teaching order is unavailable

#### Scenario: Unlock anyway counts as cleared
- **WHEN** a player takes "Unlock anyway" on a chord
- **THEN** that chord is recorded as cleared by skip
- **AND** the next chord becomes available

#### Scenario: Local and account progress merge on sign-in
- **WHEN** a player who practised signed out signs in
- **THEN** their browser progress and their account progress are merged
- **AND** for a lesson cleared both ways, a pass takes precedence over a skip

### Requirement: Run-Through History with Last Score (F22)
The system SHALL record a per-user run history per song and SHALL retain the last and the best score among comparable runs, for display on the song and in its run summaries. Runs SHALL be comparable only within the same song, practice mode, part and version. A run SHALL count toward the history only if it was a full run — from the first scored note to the end — so a partial or looped pass cannot set a best. (F22)

#### Scenario: A full run enters the history
- **WHEN** a player finishes a run that judged every scored note from the first to the end
- **THEN** the run is recorded against that song
- **AND** the song shows the last and best score among comparable runs

#### Scenario: A partial or looped pass sets nothing
- **WHEN** a player stops a run early, seeks past notes, or loops a passage
- **THEN** that run does not set the last or the best score

#### Scenario: Only comparable runs are shown together
- **WHEN** a player switches practice mode, part or version
- **THEN** the history shown is that of the runs matching the new choice

#### Scenario: History scoped to the user
- **WHEN** a user requests a song's run history
- **THEN** only that user's runs for that song are returned

### Requirement: Per-Song Tempo Preference Persistence (F37)
The system SHALL persist a per-user, per-song tempo preference in the 50–100% range and return it on later visits, supporting the notation-rendering tempo control. (F37)

#### Scenario: Tempo preference persists per song
- **WHEN** a user sets a song's tempo to a value between 50% and 100% and later reopens that song
- **THEN** the stored tempo preference for that song is returned
- **AND** a different song keeps its own independent tempo preference

#### Scenario: Out-of-range tempo rejected
- **WHEN** a tempo preference outside the 50–100% range is submitted
- **THEN** it is rejected and the stored preference is left unchanged
