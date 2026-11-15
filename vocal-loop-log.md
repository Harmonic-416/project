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

## 2026-11-15 · V2 · song screen hierarchy (7271c2f)
**Before:** title row → 3 tall mode cards → hint line → Settings row → score → transport dock → a separate card with
"● Record attempt". **After:** modes are one compact row (icon, name, short blurb; hint on hover); Settings sits in
the header with its summary underneath (icon-only on phones); the dock holds 🎤 Sing (biggest, full-width on phones)
next to Play/Stop; during an attempt the dock shows only its ■ Stop + progress (the transport's own Stop competed);
the record card renders only with content. Guitar's song screen (transport by the score, modes compact) was the
reference. Format chip hidden on phones so the title fits.
**Tests:** lint clean; full suite 740 passed, 4 guitar timeouts under load (3 pass alone; songFollow's 5 s timeout
also failed on the untouched base).

## 2026-11-15 · V7 · community research landed (bf88c48)
`docs/vocal-community-research.md` (r/singing, r/Choir, HN OnKey, App Store, EarMaster/Smule/MuseScore forums,
Wilson 2008, Lin 2014). Backlog re-ranked: clef bug first (V11), per-note graded marks (V12), take summary (V3),
kind octaves (V13), starting note (V14), part-mix ladder (V15). Strictness levels BLOCKED (thresholds = human call).

## 2026-11-15 · V11 · clef-aware pitch trail
`useSheetOverlay.js` hard-coded a treble staff (bottom line E4). Each cursor stop now carries `bottom` = the top
staff's bottom-line diatonic index from OSMD's `InitiallyActiveClef` (G4/F3/C4 reference on its line, ±7 per
octave offset; percussion/tab/missing → treble). Verified on "Ive Got A Dream A Cappella" → Bass 2 with the fake
mic: the trail runs through the note heads. Tests: +4 in `pitchDetector.test.js` (treble, bass, treble-8, alto,
tenor, fallback, bass y-positions). Lint clean.

## 2026-11-15 · V6 · merged feat/auto-transpose
Side agent's 4 commits (keyFit.js scorer over −12..+12 with tessitura / out-of-range / move costs; MusicXML
transposition with proper respelling + treble-8 clef switch; voice ranges + "Measure my range"; arranger
`ensembleShift`). Conflicts in VocalTab.jsx resolved toward the polished layout: TransposeControl lives in the
Settings sheet under "Key"; Export uses the transposed `exportable`; summary shows "Key −3". 97 related tests pass.
Open questions from the agent (shared attempts don't store the shift — needs a migration; per-key run history;
fit weights by ear) left for Eddie.

## 2026-11-15 · V12 · per-note grades on the staff
Live `createTroubleTracker(melodyLine(notes))` (judgeNotes' own judge and defaults) runs inside RecordPanel; each
resolved note is marked (green/red head) and badged via `useSheetOverlay.addBadge` — ✓ / ↑ / ↓ / · in a disc
(colour + shape). Direction = median folded cents during the note body (after a 0.1 s attack) → `gradeNote`
(classifyCents: close → amber, wrong → red). finishAttempt re-grades the whole line from judgeNotes. Badge pop
animation sits on an inner <g> (a CSS transform would override the outer translate). Verified with a fake mic
alternating 0 / ±170 / −60 ¢: badges appear as notes pass; after the take all notes carry badges.
**Spotted for V3:** the result card says "45% in tune" (frames ≤50¢) next to "29 of 32 notes sung" (judge, 100¢)
on a green card — two inconsistent numbers and jargon. Tests: +4 gradeNote/median. Lint clean.
