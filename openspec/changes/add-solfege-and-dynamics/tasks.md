# Tasks

## 1. notation-rendering (F15)

- [x] 1.1 Write the pure `solfege.js`:
  - `solfegeSyllable` handles movable do, chromatic syllables and enharmonics;
  - `scoreKey` keeps the signature when the notes fit it, and otherwise works the key out from the notes, breaking ties on the home chord;
  - `addSolfege` adds a lyric line after any words and before `<play>`. It skips rests, chord notes, grace notes and tied-over notes, and follows key changes.
  
  Verified by: `app/tests/solfege.test.js`.
- [x] 1.2 Add `SolfegeToggle` to the Vocal tab:
  - the setting is saved in localStorage;
  - one key covers the whole score, so every part shares do;
  - the switch is disabled while playback runs.
- [x] 1.3 Check in the browser: the switch toggles the labels, the setting survives a reload, and all seven built-in songs label correctly at desktop and phone widths without horizontal overflow.

## 2. audio-pipeline (F19)

- [x] 2.1 Write the pure `dynamics.js`:
  - the live tracker reports the slope trend, resets after a breath and reads null in silence;
  - `summarizeDynamics` groups levels into phrases and finds swings with a zigzag;
  - `describeDynamics` writes the result line.
  
  Verified by: `app/tests/dynamics.test.js`.
- [x] 2.2 Have `useMicPitch` expose `dynamics`. Add `DynamicsMeter` to Record attempt, Wait for me and Trouble spots, and the summary to the Record result.
- [x] 2.3 Check in the browser with a fake mic that swells and fades: the meter goes louder → softer in all three modes, and the result reports 2 crescendos and 2 diminuendos.
