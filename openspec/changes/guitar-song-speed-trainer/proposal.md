# Guitar Songs speed trainer

## Why

Guitar Songs already lets players loop a difficult passage, slow it down, and see which notes they hit. Players still have to count clean repeats and change tempo by hand. A speed trainer would let them stay on the passage and increase the tempo when their playing is consistent.

## What Changes

- Offer an optional **Speed trainer** control alongside the existing loop controls in **Trouble spots** mode. It uses the selected loop and starts at the current tempo. The passage must contain at least one scoreable note.
- Advance by **5 percentage points after three consecutive clean repeats** at the same speed, up to **100%**. A clean repeat requires a final `hit` on every scoreable note in the passage. A close, miss, skip, or missing verdict on a required note breaks the streak. Notes already excluded from scoring, including notes omitted in Easy, stay excluded.
- Show the active tempo, progress toward the next increase, and a clear indication when the trainer reaches 100%. Apply an increase at the start of a subsequent repeat after the qualifying result is known, so the tempo stays steady within each pass.
- Keep the trainer off by default. Players can turn it off to return to their chosen tempo, or change tempo manually to exit the trainer and use the new value. Automatic increases are temporary, so reopening the song restores the player's chosen tempo.

The three-repeat threshold and all-hit rule are proposed first-release defaults. Both are deliberately visible to the player.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notation-rendering` adds an opt-in tempo ramp for the existing Guitar Songs practice loop (F37).
- `scoring-engine` defines repeat eligibility using the existing per-note verdicts.

## Impact

- Reuse the existing playback range, loop controls, 5-point tempo steps, and shared transport clock. This requires a boundary between repetitions and a way to apply a temporary rate through the existing tempo path.
- Reuse the existing scoring rules and verdict timing. Each repeat needs its own verdicts, including a chance for the last note's verdict to settle. Loop practice continues to follow existing run-history rules.

## Non-goals

- Custom ramps or thresholds, saved passages, inter-loop count-ins, and speed training in Listen or Wait for me.
- Changes to other instruments, scoring thresholds, or per-song tempo storage.
- CV finger placement (F25), live group sessions (F26), YouTube play-along scoring (F27), expansion of Changes mode (F38), and piano.
