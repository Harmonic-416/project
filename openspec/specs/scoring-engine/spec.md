# Scoring Engine

## Purpose
The instrument-agnostic scoring brain: it compares normalized `{note, timestamp, confidence}` events to AlphaTab's expected notes on the one clock to score hit/late/missed. It owns the guided and play mode state machines, chord verification and cleanliness, strumming/timing scoring, post-run analysis, and the "couldn't hear you" state.

## Requirements

### Requirement: Instrument-agnostic hit/late/missed scoring (F11)
The system SHALL score each expected note as hit, late, or missed by comparing normalized events against expected notes on the single transport clock, without any instrument-specific branching — it SHALL not know which analyzer produced an event.

#### Scenario: On-time correct note scores a hit
- **WHEN** an event with the expected note arrives within the on-time window
- **THEN** the note is scored as a hit

#### Scenario: Correct note after the window scores late
- **WHEN** an event with the expected note arrives after the on-time window but within the late window
- **THEN** the note is scored as late

#### Scenario: No matching event scores a miss
- **WHEN** no matching event arrives before the note's window closes
- **THEN** the note is scored as missed

#### Scenario: Scoring does not branch on instrument
- **WHEN** events are consumed for scoring
- **THEN** the same logic applies regardless of which analyzer produced the event

### Requirement: Guided mode soft gate (F13, F28)
The system SHALL run a guided-mode state machine that holds on the current note/chord until verified, and SHALL advance anyway after N=3 attempts (a soft gate), recording the outcome.

#### Scenario: Hold until verified
- **WHEN** the current item is unverified and fewer than 3 attempts have been made
- **THEN** the cursor does not advance

#### Scenario: Soft gate advances after N attempts
- **WHEN** 3 attempts have been made without a verified success
- **THEN** the state machine advances to the next item
- **AND** the outcome is recorded

### Requirement: Three-miss auto-skip with silence-timeout misses (F29)
The system SHALL count misses on the current item and after three SHALL auto-skip it and record the auto-skip; a miss SHALL be a failed attempt (wrong note/chord) OR a silence timeout with no onset within the item's window.

#### Scenario: Three misses trigger auto-skip
- **WHEN** the current item accumulates three misses
- **THEN** it is auto-skipped
- **AND** the auto-skip is recorded

#### Scenario: Silence timeout counts as a miss
- **WHEN** no strum onset or note event is detected within the item's window
- **THEN** a miss is counted even though no wrong note was played

### Requirement: Manual skip recorded in score (F13, F30)
The system SHALL accept a manual skip intent at any time, advance past the item, and record the manual skip.

#### Scenario: Manual skip advances and is recorded
- **WHEN** a skip intent is received for the current item
- **THEN** the state machine advances
- **AND** a manual skip is recorded for the skipped item

### Requirement: Guitar chord verification against the expected chord (F16)
The system SHALL verify a strummed chord against the single expected chord (match/no-match, not arbitrary recognition), using the chord analyzer's normalized event.

#### Scenario: Matching chord verifies
- **WHEN** a chord event matching the expected chord arrives within the detection window
- **THEN** the expected chord is marked verified

#### Scenario: Non-matching chord does not verify
- **WHEN** a non-matching chord event arrives
- **THEN** the chord is not verified and a failed attempt is counted

### Requirement: Chord cleanliness / fuzziness (F17)
When per-string cleanliness data is available, the system SHALL report chord cleanliness — flagging under-pressed or muted strings — alongside the verdict.

#### Scenario: Muted string flagged when data present
- **WHEN** cleanliness data indicates a muted or under-pressed string
- **THEN** the output flags that string as unclean while still reporting the overall verdict

### Requirement: Strumming pattern and timing score (F18)
The system SHALL score the played strumming pattern against the expected pattern and produce a timing/tempo score for the run.

#### Scenario: Strum timing scored against expected pattern
- **WHEN** a run with an expected strumming pattern completes
- **THEN** the played strums are compared to the expected pattern
- **AND** a timing/tempo score is produced

### Requirement: Play mode uninterrupted run (F14, F32)
The system SHALL run a play-mode state machine in which the piece plays straight through at tempo, the playhead advances regardless of detection, and nothing gates the run.

#### Scenario: Play mode never gates
- **WHEN** the user misses an item in play mode
- **THEN** the playhead keeps advancing without holding on the missed item

### Requirement: Post-run played-vs-score analysis (F14, F33)
After a play-mode run the system SHALL produce a played-vs-score analysis marking each item as verified/wrong/not-heard and early/on/late, suitable for marking on the notation.

#### Scenario: Per-item breakdown after a run
- **WHEN** a play-mode run completes
- **THEN** each item carries a verified/wrong/not-heard verdict and an early/on/late timing verdict
- **AND** the breakdown is available to mark on the notation

### Requirement: Explicit "couldn't hear you" state (F21)
The system SHALL raise a "couldn't hear you" state when input is too quiet to score (per the pipeline's volume gate) rather than scoring the silence as a wrong note.

#### Scenario: Too-quiet input surfaces couldn't-hear-you
- **WHEN** the pipeline signals input below the volume gate during a scored item
- **THEN** the scoring engine raises the "couldn't hear you" state
- **AND** the silence is not scored as a wrong note
