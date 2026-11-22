# Guitar Songs review and recurring trouble spots

## Why

Guitar Songs already shows a shared recording in sync with the tab, but reviewers have to go to Home to leave feedback about the take. Players can see individual run results and their last and best scores, but they cannot see which measures repeatedly need work. This release uses the existing score, recording timing, and saved verdicts to make both workflows available from the song.

## What Changes

- **Comment on the tab.** In shared playback, an authorized commenter can select a spot on the score or leave a general comment. Selecting an anchored comment takes the reader to that spot and seeks the recording when the saved timing supports it. Home remains an entry point to the shared run. Existing general comments appear in the same thread.
- **Find recurring trouble spots.** The player's song view highlights measures that needed work in multiple comparable full runs. Each result shows how often it occurred among runs that scored that measure. Selecting a result jumps to the measure and sets the existing practice loop without starting playback.

## Capabilities

### New Capabilities

- `guitar-run-review` defines in-song feedback for existing asynchronous sharing (F26).

### Modified Capabilities

- `progress-tracking` adds a measure-level summary derived from the player's existing run history (F22).
- `ui` adds the recurring trouble spots display and its connection to the existing practice controls, alongside per-attempt highlighting (F24).

## Impact

- Reuse the existing comment thread, authorization, score navigation, and recording timing. Add optional anchor data to existing comment storage and validate it against the shared attempt. Preserve general comments and current access for links and invited recipients.
- Derive trouble spots on demand from saved verdicts. Use up to the ten latest eligible full runs for the same score revision, part, practice mode, and Easy setting. Surface measures with difficulties in at least two runs. These are proposed first-release defaults for review.
- Define difficulty using the active mode's existing results. Count a measure at most once per run and exclude unknown or unscored entries from the calculation. Keep personal history scoped to its owner.

## Non-goals

- Replies, resolution, notifications, new sharing permissions, and take comparison.
- Saved passages, speed training, original-audio practice, and band repertoire.
- CV finger placement (F25), live group sessions (F26), YouTube play-along scoring (F27), expansion of Changes mode (F38), and piano.
