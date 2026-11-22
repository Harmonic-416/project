## Purpose

Derive recurring guitar trouble spots from the player's comparable saved practice results.

## ADDED Requirements

### Requirement: Recurring difficult measures from guitar run history (F22)

Guitar Songs SHALL derive recurring difficult measures from up to the ten most recent eligible full runs owned by the current player. Eligible runs SHALL match the current score revision, part, scored practice mode, and Easy setting, and their verdicts SHALL map reliably to the current score. For each measure, the system SHALL count runs with at least one evaluated note and, among those runs, runs with a difficulty as defined by the mode's existing results. Difficulty SHALL count at most once per measure per run. A measure SHALL qualify after difficulty in at least two eligible runs.

#### Scenario: A measure repeatedly needs work

- **WHEN** a measure has evaluated notes in five eligible runs and difficulty in three of them
- **THEN** the result reports three out of five for that measure

#### Scenario: History contains incompatible or incomplete attempts

- **WHEN** history includes a looped run, a different part or mode, a different Easy setting, or a legacy attempt whose verdicts cannot be mapped reliably
- **THEN** those attempts contribute no counts
- **AND** an eligible run with zero evaluated notes in a measure contributes no count to that measure
