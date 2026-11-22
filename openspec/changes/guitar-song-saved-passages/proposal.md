# Save and resume practice passages in Guitar Songs

## Why

Guitar Songs lets players choose bars, loop a passage, and slow it down. Returning to a difficult section later still means finding the bars and setting up practice again. A named passage gives players a stable target they can reopen even when the tab wraps differently.

## What Changes

- Add **Save passage** to the existing **Practice section** picker. Start from the chosen bars or the current loop. If a dragged loop starts or ends inside a bar, show the full bars that will be saved before the player confirms.
- Save a name, the inclusive bar range, the player's chosen tempo, and the loop setting. List saved passages in the picker by name and bar range. Let the player rename, update, or remove a saved passage through the same picker.
- Add **Resume last passage** when opening a song with a previously saved or opened passage. Opening or resuming a passage highlights its bars, moves the cursor to the start, and restores the saved tempo and loop setting. Playback waits for Play.
- Keep saved passages on the current device, scoped to the current account or guest profile and the exact score revision. Returning to **Full song** restores the song's usual tempo preference. A tempo change while practicing a saved passage applies immediately, and **Update passage** makes that choice part of the saved setup.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ui` adds save, open, resume, and management actions to the Guitar Songs practice section picker.
- `notation-rendering` restores saved bar ranges, loop state, and tempo through the existing transport (F37).
- `progress-tracking` persists named passages and the most recently used saved passage for each exact score on this device.

## Impact

- Reuse score bar numbers, the existing score fingerprint, section selection, and loop controls. Saved ranges use musical bar numbers rather than rendered staff lines.
- Reuse the existing 50–100% tempo control in 5-point steps. The saved passage captures the chosen tempo; the speed trainer's automatic increases stay temporary. Selecting a passage keeps the current practice mode and uses loop behavior where that mode supports it.
- Reuse the current single transport clock. The proposal needs local storage for passage records and no database migration.

## Non-goals

- Saving a partial bar, resuming at an exact note or playback timestamp, or opening a passage automatically.
- Cloud sync, sharing passages, attaching notes or recordings, and transferring passages to a different score revision.
- CV finger placement (F25), live group sessions (F26), YouTube play-along scoring (F27), expansion of Changes mode (F38), and piano.
