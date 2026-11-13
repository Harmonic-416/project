# Progress Tracking

## MODIFIED Requirements

### Requirement: Run-Through History with Last Score (F22)
The system SHALL record a per-user run history per song and SHALL retain the last and the best score
among comparable runs, for display on the song and in its run summaries. Runs SHALL be comparable
only within the same song, practice mode, part and version. A run SHALL count toward the history
only if it was a full run — from the first scored note to the end — so a partial or looped pass
cannot set a best. (F22)

Edited here because its previous text displayed the last score "on the lesson map", and the lesson
map is removed by this same change.

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

## REMOVED Requirements

### Requirement: Unlocking Lesson Map with Prerequisites (F2)
Replaced below by "Ordered chord unlocking (F2)". The map and its prerequisite graph were cut:
testers lost track of which stage they were on, so guitar became a flat path and vocal has no
progression to maintain (master design document §7.1, F2). Its scenario "Knowledge-only node clears
without audio" goes with it — no knowledge-only node ever shipped. The surviving promise, that an
activity which does not listen needs no microphone, is owned by `ui` (F3).

## ADDED Requirements

### Requirement: Ordered chord unlocking (F2)
The system SHALL open the guitar chord lessons one at a time in teaching order: the first is always
open, and each later one opens once the lesson before it is cleared — either passed, or skipped via
"Unlock anyway". It SHALL NOT model lessons as nodes in a graph with declared prerequisites, and
there is no lesson map. Cleared state SHALL persist against the account while signed in and in the
browser otherwise, and the two SHALL merge when a signed-out player signs in, a pass taking
precedence over a skip for the same lesson.

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
