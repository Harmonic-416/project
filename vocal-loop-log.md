# vocal-loop-log.md — one entry per iteration (appended, never rewritten)

## 2026-11-15 · setup
Branch `feat/vocal-polish-loop` from `harmonic/main` (8054fc0) + clean merge of `harmonic/feat/ui-polish` (977e056).
App tests: 738 passed, 1 failed (guitar `songFollow` Four-Chord Strum — 5 s timeout under load, unrelated).
Side work: `feat/mscz-import`, `feat/auto-transpose`, `exp/arranger-bench` (+3 strategy branches to follow).

## 2026-11-15 · V1 · live pitch meter (9936c17)
**Before:** while recording, the only live cue was a small pill under the transport — "A4 · target G4 (+23¢)" — away
from the score and in cents. **After:** `PitchMeter` portals into a slot beside the score: SING + target note (big),
a lane with the in-tune band (= classifyCents' 50¢ tolerance, ±200¢ shown), the sung note as a gliding ball,
and words: On pitch / A bit higher / A bit lower / Go higher / Go lower / Right note, other octave. Phone (≤560px):
a horizontal tuner strip under the score so the staff keeps its width. Tried and dropped: lighting the current
note on the staff — it competed with the playback cursor's highlight, which sometimes sits on a different note.
Verified with a fake mic that follows the meter's target at +5 / −80 / +220 ¢ (light + dark, desktop + phone).
**Tests:** new `pitchReading.test.js` (5). Full app suite under load: 741 passed, 3 timed out (guitar beats /
songFollow / waitListening) — all 42 pass when re-run alone. Lint clean.
Screenshots: a private headless browser script (`scratchpad/shots-tool/shots.mjs`) — the shared Playwright MCP
browser is also driven by the side agents and got navigated away mid-shot.
