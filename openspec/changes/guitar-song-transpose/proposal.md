# Transpose and tuning shift in Guitar Songs

## Why

Vocal Songs already lets a player shift a song by semitones. Guitar Songs uses the written pitches even when all of the player's strings are tuned higher or lower. For example, a player tuned down a half step should be able to use the same tab fingerings and hear and be judged on the notes their guitar actually sounds.

## What Changes

- Reuse the Vocal transpose control's semitone buttons, current-shift readout, and **As written** setting in Guitar Songs. The Guitar control uses the score's written tuning as its baseline.
- Use one semitone setting for transpose and uniform tuning shift. At −1, every guitar string sounds a semitone below its written tuning. The tab keeps the same strings and frets, shows the adjusted tuning, and the standard notation displays the shifted pitches.
- Shift synthesized pitched accompaniment by the same amount, including other scored parts when enabled. Use the same shifted pitches for scoring, reference notes, and hints. Preserve the score's timing and unpitched percussion.
- Change the shift while practice is stopped or before it starts. Open each song **As written**. With a local backing track active, the user must turn it off before applying a shift. Activating a backing track likewise requires **As written**.
- Save a run's shift with its results so different tunings have distinct practice history. Shared playback opens with the shift used in the take. Existing attempts without a stored shift use **As written**.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ui` adds the shared semitone control to Guitar Songs.
- `notation-rendering` defines consistent displayed tuning, notation, and synthesized playback.
- `scoring-engine` uses the shifted expected pitches through its existing judging rules.
- `progress-tracking` scopes Guitar Songs history and recurring trouble spots by shift.
- `song-storage` records the shift used by finished and shared guitar runs.

## Impact

- Reuse the manual portion of the Vocal control and keep Vocal's range capture and recommendations in its own workflow. Start with Vocal's existing semitone limits, further constrained by the current score's playable pitch range. Reject a shift that would produce pitches outside the supported range before changing playback or scoring.
- Derive playback, notation, and expected pitches from the same shifted representation. The score file and its fingerprint remain the source identity for saved passages and run sharing.
- Practice history compares runs at the same shift. The attempt format needs optional shift metadata with zero as the legacy default. The original score remains the source for exports.

## Non-goals

- Drop D and other per-string retunings, capo or fret remapping, and automatic tuning detection.
- Pitch-shifting imported recordings, saving a transpose preference across visits, and exporting a transposed copy.
- CV finger placement (F25), live group sessions (F26), YouTube play-along scoring (F27), expansion of Changes mode (F38), and piano.
