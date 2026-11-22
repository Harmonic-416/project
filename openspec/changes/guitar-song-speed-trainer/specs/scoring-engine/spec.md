## Purpose

Determine clean Guitar Songs loop repeats using the existing Trouble spots verdicts.

## ADDED Requirements

### Requirement: Clean repeat eligibility for a guitar practice loop

A speed-training repeat SHALL qualify as clean only after a complete, uninterrupted pass through the loop at one tempo, with at least one scoreable note and a final hit on every scoreable note in the range. The system SHALL use the existing scoring eligibility and verdicts, including the current Easy setting. It SHALL allow the final note's scoring window to settle before evaluating the repeat. A required note with a close, miss, skip, or absent verdict after settlement SHALL break the streak. Verdicts SHALL belong to the repeat in which the notes were played.

#### Scenario: The final note is judged after the loop wraps

- **WHEN** the loop reaches its boundary before the final note's scoring window closes
- **THEN** the system waits for that window to settle before counting the repeat
- **AND** any tempo increase takes effect at a repeat boundary after the decision

#### Scenario: Easy omits notes in the passage

- **WHEN** the player hits all notes scored in Easy during a complete loop repeat
- **THEN** the repeat counts as clean even if the player did not play the omitted notes

#### Scenario: A required note is close

- **WHEN** a required note receives a close verdict after two clean repeats
- **THEN** the streak resets and the tempo holds
