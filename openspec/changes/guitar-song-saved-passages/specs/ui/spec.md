## Purpose

Let guitarists save, find, and resume focused practice from the existing section picker.

## ADDED Requirements

### Requirement: Manage saved passages from Practice section

Guitar Songs SHALL let a player save a named passage from a valid selected section or active loop. When the active loop spans parts of bars, the picker SHALL show the full range of touched bars before confirmation. The picker SHALL list saved passages by name and bar range, and SHALL let the player open, rename, update, or remove a saved passage. The UI SHALL report a storage failure without claiming the change was saved.

#### Scenario: Save a loop that starts partway through a bar

- **WHEN** the player saves a dragged loop covering parts of bars 9 through 12
- **THEN** the picker displays bars 9–12 for confirmation and lists that range under the name the player saves

### Requirement: Resume the last saved passage

Guitar Songs SHALL offer an explicit Resume last passage action when the open score has a valid most recently saved or opened passage. The action SHALL use the same behavior as selecting the passage from the picker. Shared-run playback SHALL keep personal saved-passage controls hidden.

#### Scenario: Return to a song with a saved passage

- **WHEN** the player reopens a song and chooses Resume last passage
- **THEN** Guitar Songs selects that passage in the picker and prepares it for practice
