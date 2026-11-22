# Local backing tracks in Guitar Songs

## Why

Guitar Songs can slow down and loop a tab against synthesized accompaniment. A local backing recording lets a guitarist practice the same passage with the phrasing and feel of a real performance. Manual alignment is enough to test that workflow on a passage with a reasonably steady beat.

## What Changes

- Add **Backing track** to the options for an open Guitar Song in **Listen** mode. The player selects a local MP3 or WAV and can preview it while aligning it to the tab.
- Use two manual alignment points. The player pairs the start of a passage on the tab with the same moment in the recording, then does the same at the end of the passage. The two points account for both an offset, such as a count-in on the recording, and a difference between the score tempo and the recorded performance.
- After alignment, use the existing Play, Pause, Stop, seek, loop, and tempo controls. Backing audio supplies the accompaniment for the aligned span, and the tab follows the same transport. The existing 50–100% tempo control changes practice speed while preserving the recording's pitch.
- Keep playback inside the aligned span while the backing track is active. The player can turn it off to return to normal score playback. Changing the score or leaving the song clears the imported track and alignment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ui` adds local import, preview, and manual alignment inside Guitar Songs.
- `notation-rendering` synchronizes local backing audio with the existing score transport, loop, and tempo control (F6, F37).
- `song-storage` keeps the imported audio and alignment on the device for the open song.

## Impact

- The score transport remains the timing reference. The recording follows the mapping between the two chosen score positions and the two audio timestamps. This release supports one aligned span and a constant timing ratio within it.
- The existing practice tempo applies on top of the recording's alignment rate. The implementation needs to confirm that the browser can play the combined rate at preserved pitch and report when it cannot.
- The first release is for unscored practice in Listen mode. Scored practice and shared-run review continue to use their current audio paths. Import and alignment require no server or database change.

## Non-goals

- Automatic alignment, tempo maps for recordings with noticeable tempo drift, stem separation, part isolation, or pitch transposition.
- Scoring, recording attempts, or sharing with backing audio active. Saving backing tracks or their alignment across song visits or devices.
- Streaming sources, CV finger placement (F25), live group sessions (F26), YouTube play-along scoring (F27), expansion of Changes mode (F38), and piano.
