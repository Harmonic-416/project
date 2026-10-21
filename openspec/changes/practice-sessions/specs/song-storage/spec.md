# Spec Delta

## ADDED Requirements

### Requirement: Recording Storage Budget (N3, N5)
The system SHALL keep an attempt's audio recording only when the user opts in for that attempt, with the option on by default while the recording fits the user's remaining budget. The system SHALL track the size of every kept recording, SHALL enforce a per-user cap of 100 MB at the database, SHALL expose the storage a user has used, and SHALL let the user delete a recording while keeping the attempt, its score and its feedback. Scores, pitch traces and feedback SHALL be stored regardless of the budget.

#### Scenario: Recording kept within budget
- **WHEN** a signed-in user finishes an attempt with "Keep recording" on and the recording fits their remaining budget
- **THEN** the recording is stored, its size is recorded on the attempt
- **AND** the storage used shown to the user grows by that size

#### Scenario: Over budget
- **WHEN** keeping a recording would take the user past 100 MB
- **THEN** the recording is refused with a message naming the budget
- **AND** the attempt's score, pitch trace and feedback are stored anyway

#### Scenario: Default follows the budget
- **WHEN** an attempt finishes and its recording would not fit the remaining budget
- **THEN** "Keep recording" is off by default for that attempt

#### Scenario: Delete the audio, keep the attempt
- **WHEN** the owner deletes an attempt's recording
- **THEN** the audio is removed and no longer counts toward the budget
- **AND** the attempt with its score, note and rating remains in its session
