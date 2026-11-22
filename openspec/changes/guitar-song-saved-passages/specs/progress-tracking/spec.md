## Purpose

Retain named guitar passages and the last saved passage on the current device.

## ADDED Requirements

### Requirement: Persist saved passages for the exact score revision

Guitar Songs SHALL store each passage's name, inclusive bar range, chosen tempo, and loop setting on the current device for the current account or guest profile and the exact score revision. A successful save or open SHALL make that passage the last passage for that score. Removing that passage SHALL clear its resume entry. Passage records with invalid ranges SHALL be unavailable for opening or resuming.

#### Scenario: Same song title with a different score file

- **WHEN** the player opens a revised score with the same title as a score with saved passages
- **THEN** the revised score does not show or resume passages from the previous revision

### Requirement: Persist only explicitly chosen passage tempo (F37)

Saving or updating a passage SHALL capture the manually chosen tempo within the existing 50–100% range and 5-point steps. Automatic speed-trainer changes and temporary practice adjustments SHALL leave the stored passage tempo and the song's tempo preference intact.

#### Scenario: A speed trainer ramp is active when the passage is saved

- **WHEN** a player starts at a chosen 60%, the speed trainer reaches 70%, and the player saves the passage
- **THEN** the saved passage reopens at 60%
