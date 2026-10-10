# Fix Guitar Wait Mode

## Why

"Wait for me" on a guitar song should behave like the Vocal tab's: the song waits on each note or chord until the microphone hears it played. Trying it on a real guitar showed three ways it doesn't:

- **It moves on wrong notes.** It copied the chord lessons' rule: three misses mark the note red and skip it (F29). Vocal's Wait mode never skips; it waits for the right pitch.
- **It hears notes in any noise.** Every onset (a jump in level, new frequencies, a pitch change) gets a verdict, and nothing asks whether the sound was a guitar note at all. In a simulation of the real pipeline, ten seconds of typing near the microphone moved the cursor 13 entries and even scored false hits (against N6).
- **One strum counts twice.** A window is judged on whatever is still ringing, not on what was just played. Any later sound, such as a keystroke, a fret squeak or a strum that reaches the strings in two parts, re-matches the ringing chord against the next target. The built-in songs repeat targets back to back (Four-Chord Strum strums each chord four times; Ode to Joy opens E E).

The same research found the chord judge accepting near-miss chords. It needs only 80% of a chord's notes, so E major passes for E minor (one fret on the G string), and the reverse.

## What Changes

- **Song wait mode never auto-skips (scoring-engine, F13/F28/F29 modified).** Wrong attempts are counted and shown, and after a few the app points at Hint and Skip. Only a verified note/chord or a manual Skip moves on. The chord lessons keep their three-miss soft gate.
- **Every chord tone must sound (scoring-engine, F16).** In Wait mode a chord is verified only when every one of its notes sounds, measured with a gentler per-string threshold. Trouble spots keeps today's thresholds until its own follow-up.
- **One judgment per strum, fresh playing only (scoring-engine, new).** Onsets within 0.2 s are one gesture. A hit needs the expected notes to be louder than just before the gesture. A wrong verdict is held until the gesture is over, so a slow strum's first half isn't called wrong.
- **Clicks and taps are not notes (audio-pipeline, N6 modified).** Before judging, a sound must pass three checks: it is tonal (a peak that stands out in most frames), it keeps ringing (decays no more than 25 dB within 300 ms), and it is still above the room's noise floor. Anything else gets no verdict at all. The listening windows now carry the levels, the room floor and an earlier reference spectrum these checks need.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scoring-engine`: guided mode's soft gate and the three-miss auto-skip apply to the chord lessons only. Adds the one-judgment-per-strum, fresh-playing requirement for song wait mode.
- `audio-pipeline`: noise gating (N6) adds the clicks-and-taps scenario.

## Impact

- **Code:** `app/src/tabs/guitar/song/follow/` (`waitState.js`, `noteJudge.js`, `listenWindows.js`, `useGuitarListener.js`, `GuitarWaitMode.jsx`, new `waitListening.js`, `GuitarFollow.css`). New tests: `app/tests/waitListening.test.js` and its signal helper `app/tests/guitarSignals.js`.
- **Unchanged:** Trouble spots, the after-the-run basic-pitch check, latency calibration and the chord lessons. The new window fields are additive and they ignore them.
- **Specs repo:** F13 and F29 reworded so the auto-skip is the chord lessons' rule.

## Non-goals

- **Trouble spots.** It has the same listener and judge, so the noise gate and freshness check carry over; that's the follow-up change.
- **Changing the chord lessons' soft gate** (F28/F29). It is a deliberate lesson rule and stays.
- **Thresholds tuned on real recordings.** The numbers here come from simulated strings; tuning them by ear is follow-up work.
- Per the v1-scope OUT list: computer-vision finger placement (F25), group/social features (F26), YouTube play-along (F27), Changes mode (F38), piano.
