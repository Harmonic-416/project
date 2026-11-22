## Purpose

Compare guitar practice results only when the underlying pitch setup is the same.

## ADDED Requirements

### Requirement: Guitar run history distinguishes semitone shifts (F22)

Guitar Songs SHALL scope Last and best scores and recurring trouble spots to the selected shift in addition to the existing compatibility criteria. Attempts without shift metadata SHALL count as zero shift.

#### Scenario: Practice switches from standard tuning to a semitone down

- **WHEN** the player views practice history at −1 after recording runs at 0 and −1
- **THEN** only the compatible −1 runs contribute to those summaries
