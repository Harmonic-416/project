## Purpose

Restore a saved passage through the existing guitar score, loop, and tempo controls.

## ADDED Requirements

### Requirement: Restore a saved practice range and tempo (F37)

Opening a saved passage SHALL highlight the stored bar range, place the cursor at its start, and apply the saved tempo through the existing tempo control and transport clock. It SHALL restore the saved loop setting where the current practice mode supports looping. Selecting a passage SHALL leave the practice mode unchanged and SHALL await the player's Play command.

#### Scenario: Tab lines change after resize

- **WHEN** the player opens a saved passage after a resize changes the rendered staff lines
- **THEN** the same numbered bars are selected and the saved tempo and supported loop setting are restored without starting playback

### Requirement: Keep passage tempo separate from song tempo (F37)

The transport SHALL use the saved passage tempo while that passage is selected. Manual tempo changes in a saved passage SHALL take effect immediately. Returning to Full song SHALL restore the normal per-song tempo preference.

#### Scenario: Switch between a passage and the full song

- **WHEN** the player opens a passage saved at 65% in a song normally practiced at 80%, then selects Full song
- **THEN** playback first uses 65% for the passage and then returns to 80% for the full song
