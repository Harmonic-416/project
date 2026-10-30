# Spec Delta

## MODIFIED Requirements

### Requirement: Run-Through History with Last Score (F22)
The system SHALL record a per-user run-through history per song and retain the last score per song for display with the song and in run-through summaries. For a guitar song, every finished Wait for me run and Trouble spots run of a signed-in user SHALL be stored as an attempt in that song's practice session. Each attempt SHALL record its mode, whether it was played in the song's Easy version, whether it went from the first scored note to the end (a full run), its per-note verdicts and its score. The song SHALL show the last and the best score of the user's full runs at that song, mode, part and version. A run that is checked again after it was saved SHALL replace its stored verdicts and score. (F22)

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

#### Scenario: A guitar run joins the song's practice session
- **WHEN** a signed-in user opens a guitar song and finishes a Trouble spots run, then plays Wait for me to the end
- **THEN** both runs are stored in one practice session at that song, each with its mode
- **AND** the Guitar tab's Practice sessions view lists that session with both runs

#### Scenario: Last and best of full runs
- **WHEN** a user has finished two full Trouble spots runs at a song, scoring 60% and then 80%, and then loops one bar
- **THEN** the song shows "Last run 80% · best 80%" for Trouble spots
- **AND** the looped bar is kept as an attempt but does not change the last or best score
- **AND** switching to the Easy version or to Wait for me shows that version's or mode's own last and best

#### Scenario: A re-checked run is corrected
- **WHEN** the user runs the note-by-note check on a saved Trouble spots run
- **THEN** the stored attempt's verdicts and score are replaced by the checked ones

#### Scenario: Each tab lists its own sessions
- **WHEN** the user opens Practice sessions in the Guitar tab, or from a guitar song on Home
- **THEN** only guitar sessions are listed, and Practise reopens the song in the Guitar tab
- **AND** the Vocal tab's Practice sessions lists no guitar sessions
