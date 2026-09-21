# Spec Delta

## Purpose
Persists per-user progress, drives the unlocking lesson map (a node unlocks once its prerequisites clear, including knowledge-only nodes), retains run-through history with last score per song, and persists per-song tempo preferences. Covers F2, F22, and the persistence side of F37.

## ADDED Requirements

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

### Requirement: Unlocking Lesson Map with Prerequisites (F2)
The system SHALL model lessons as map nodes where a node is locked until all its declared prerequisites are cleared, and SHALL unlock it exactly when they clear. (F2)

#### Scenario: Node unlocks when prerequisites cleared
- **WHEN** a user clears a locked node's last outstanding prerequisite
- **THEN** that node's state becomes unlocked
- **AND** the change appears in the map the UI reads

#### Scenario: Node stays locked with unmet prerequisites
- **WHEN** a node has one or more uncleared prerequisites
- **THEN** the node remains locked
- **AND** the UI receives it as unavailable

#### Scenario: Knowledge-only node clears without audio
- **WHEN** a user completes a knowledge-only node (e.g. "Meet the guitar") that needs no microphone
- **THEN** the node is recorded as cleared via the same mechanism as play-along nodes
- **AND** it can satisfy downstream nodes' prerequisites

### Requirement: Run-Through History with Last Score (F22)
The system SHALL record a per-user run-through history per song and retain the last score per song for display on the lesson map and run-through summaries. (F22)

#### Scenario: Attempt is added to history
- **WHEN** an authenticated user finishes a run-through and submits its result
- **THEN** a new entry with its score and timestamp is stored for that song
- **AND** it appears in that song's attempt history for the user

#### Scenario: Last score is retained and returned
- **WHEN** a user has completed one or more run-throughs of a song
- **THEN** the most recent run-through's score is retrievable as that song's last score
- **AND** a newer attempt replaces the previously returned last score

#### Scenario: History scoped to the user
- **WHEN** a user requests a song's run-through history
- **THEN** only that user's attempts for that song are returned

### Requirement: Per-Song Tempo Preference Persistence (F37)
The system SHALL persist a per-user, per-song tempo preference in the 50–100% range and return it on later visits, supporting the notation-rendering tempo control. (F37)

#### Scenario: Tempo preference persists per song
- **WHEN** a user sets a song's tempo to a value between 50% and 100% and later reopens that song
- **THEN** the stored tempo preference for that song is returned
- **AND** a different song keeps its own independent tempo preference

#### Scenario: Out-of-range tempo rejected
- **WHEN** a tempo preference outside the 50–100% range is submitted
- **THEN** it is rejected and the stored preference is left unchanged
