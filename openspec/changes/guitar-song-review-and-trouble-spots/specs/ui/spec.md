## Purpose

Let guitarists identify recurring difficult measures and open them for focused practice.

## ADDED Requirements

### Requirement: Recurring trouble spots in Guitar Songs (F24)

Guitar Songs SHALL show qualifying measures with their bar numbers and difficult-run counts over evaluated-run counts. Selecting a measure SHALL highlight it, navigate to it, and set the existing practice loop to that measure without starting playback. When history is available but shows no recurring difficulty, the view SHALL communicate that state without displaying a zero score.

#### Scenario: Player practices a recurring trouble spot

- **WHEN** a player selects bar 12 from the recurring trouble spots
- **THEN** the tab highlights bar 12 and sets the loop to that bar
- **AND** playback waits for the player to start it
