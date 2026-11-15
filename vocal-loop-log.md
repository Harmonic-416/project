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

## 2026-11-15 · V3 · take summary card
`practice/takeSummary.js` (pure): hit/total from judgeNotes, `starsFor`, honest headline ("Every note!" only at
100%), missed notes grouped into runs of touching bars (bar numbers from new `scoreModel.bars`, pickup = 0), top 3
by size in score order, direction from per-note medians (majority side; ≥⅓ each way = "unsteady"; none = "not
heard"), distance in singer words (`howFar`: cents < 90, then half step / whole step). `TakeSummary.jsx` card with
▶ Hear it (stop → seek → play). Old frame-count row removed; record-panel steps back around the card (no double
border). sfx.perfect only at 100%; `recordStars('song:<fingerprint>')` for V4's cards.
**Note for V18:** the judge counts a note after 3 on-pitch frames within 100¢ — a take alternating ±170¢ still
scores 28–29/32. That leniency is the threshold question already parked for Eddie.
Tests: +7 (`takeSummary.test.js`). Lint clean. Screenshots light/dark, desktop/phone.

## 2026-11-15 · V13 · kind octaves
Meter: verdict `octave` → "Octave below/above — that counts", ✓, sky colour (was "Right note, other octave").
Take card: pitch line shows the octave-folded accuracy (already computed by scoreAttempt) when it is higher, with
"(an octave away counts)". Verified with the fake mic one octave below: meter calm blue; take = 32/32, 93%.
Tests updated (pitchReading). Lint clean.

## 2026-11-15 · V14 · starting note + quiet mic
Dock: 🎵 <first note> next to 🎤 Sing (Learn's `tapNote`, now with a length; 1.2 s). sfx: `setMicLive` set by
useMicPitch on listening/stop; chime + wrong-thud skip while live (no current call sites fire during listening —
this guards future ones and keeps app sounds out of recordings). Test `sfxMicLive.test.js` mocks Tone.

## 2026-11-15 · V15 · part-mix ladder
`LISTEN_MIXES` (solo / lead / others / all) + `mixSchedule(notes, mix)` with per-event `velocity`
(useMidiPlayback passes it to `triggerAttackRelease`; default 1). Listen → ladder; Wait / Trouble → existing
ACCOMPANIMENTS (a Listen-only rung reads as "With all parts" there). `withOthers = accompaniment !== 'solo'`, so
runs / shared attempts keep solo|all. Settings label "What plays" in Listen. Tests: `partMix.test.js` (4);
practiceLogic / practiceScoring / songFollow 48 pass. Not verified by ear (headless) — velocity path unit-tested.

## 2026-11-15 · V16 · loop a trouble spot (d8b71b0)
`useMidiPlayback` gains `loop` / `setLoop({start,end,label})` on Tone.Transport.loop (ticks via scoreTicks), a
'loop' listener that moves the cursor back (`cursorTo`, split out of `seek`), Play starting inside the loop, and a
clear on score change. Take summary spots: 🔁 Loop it (end = next bar's start, `endTime`, null → song end). Dock
chip "🔁 Bars 3–4 ✕". Cleared on Sing and on mode change. Tests: takeSummary endTime (+1).
**NOT verified in a browser:** the Mac's audio clock stalled mid-session (AudioContext 'running' but currentTime
frozen, in headless and the MCP Chrome alike; reproduced with the V16 change stashed) — coreaudiod needs a restart
(`sudo killall coreaudiod`), which is Eddie's call. Re-verify looping by ear once audio is back.

## 2026-11-15 · V5 · merged feat/mscz-import
Side agent's converter (`notation/musescore/`, JSZip already in the app; 15 tests vs MuseScore 4's own export on 4
fixtures). One conflict (hero subtitle) → Jamie's hero kept, now "MIDI, MusicXML or MuseScore". Verified:
`satb-features.mscz` renders with the MuseScore chip, key, pickup, repeat, two verses, p + hairpin; part tabs
S/A/T/B/Piano. Not supported yet (agent): MuseScore ≤2, chord symbols, tremolos, ottavas, transposing instruments
at concert pitch. PR #57's loadNotation test expects .mscz to be rejected — reconcile whichever merges second.

## 2026-11-15 · V4 · song cards with facts
`songs/songInfo.js`: fetch each built-in once per visit; MIDI via @tonejs/midi (non-percussion tracks with notes =
parts, first = tune, duration), MusicXML by regex (score-parts, first part's pitches, measures). `voicesThatFit`
uses the transpose agent's COMFORTABLE_RANGES (±1 st grace). `SongCardMeta` renders 👥 N parts / 🎤 Solo, length,
range · voices, best stars (`song:<title>`). SongLibrary's `renderMeta` is opt-in (Guitar unchanged). Not done:
the "Continue" row (needs a last-song store) — folded into V8's pass if cheap. Tests: songInfo (4).
Full suite after V5: 16 failures all from load (avg ~15, arranger experiments running models); arrange +
midiToMusicXml pass alone (50/50).

## 2026-11-15 · V17 · easier score
SheetMusicViewer: `LyricsHeight` 2.5; notes of parts ≠ 0 get `sheet-note--other-part` (opacity .4) when the score
has several parts, re-applied in the render override; `RenderPartNames/Abbreviations` only with several parts.
Verified: SATB .mscz "Everyone" → Soprano black, Alto dimmed; Amazing Grace on phone without "Voice" label.
Not done (bigger change): page/line layout instead of the sideways strip, current-syllable highlight, dimming the
other parts' lyrics (OSMD exposes no per-staff lyric element).

## 2026-11-15 · V8 + V10 · phone / dark pass, tab bar
Shot Learn, Practice, Warm Up, Compose at 390×844 and 1280×800, light + dark. Dark mode holds on all four (tokens);
nothing overflowed at phone width. The one inconsistency: Practice and Warm Up opened with a plain sentence while the
others have a `vocal-hero` → both now have one ("Test your ear and voice", "Warm up your voice"). V10: the phone tab
bar hides labels by design (five tabs + streak + sound + account don't fit 390 px); labels stay in the DOM for screen
readers, streak and sound buttons already carry aria-labels, and every section now names itself in its hero — no
further change. Warm-up tests 10/10, lint clean.

## 2026-11-15 · V9 · meter in Wait for me / Trouble spots, Skip note
Both players accept `meterSlot` and portal `PitchMeter` (verdict = their own `liveVerdict(cents, STRICT_*)`, band =
`toleranceCents` prop, new on PitchMeter). Wait: "Skip note ›" (seek to the next note: scored, not charted). Not
done: auto-playing each note when Wait stops (would deafen the mic ~1.1 s per note and change the mode); "Hear
note" already exists. Practice tests 54/54, lint clean. **Browser check pending audio** (same coreaudiod stall).

## 2026-11-15 · backlog status
All items DONE except V18 (BLOCKED: strictness levels change thresholds — Eddie's call). Two DONE items still need a
by-ear check once audio works: V16 (looping) and V9 (meter in Wait / Trouble). The loop keeps running only to drive
the arranger experiment (3 strategy branches → Fable judge).

## 2026-11-15 · audio back — V16 and V9 verified
coreaudiod recovered on its own (AudioContext clock advancing again ~16:42).
- **V16 loop:** take with misses → "Bars 9–12 · 🔁 Loop it": transport 18.8 → 27.6 s then wraps to 19.1 s; cursor back
  on bar 9 ("was"); dock chip "🔁 Bars 9–12 ✕".
- **V9:** Wait for me at −70¢ → meter "A bit higher" with the 35¢ band, "Hear note" + "Skip note ›"; Trouble spots on
  phone → tuner strip agrees with the tally ("2 a half step off").
- Fix: a spot starting in the pickup is labelled "Pickup–bar 5" instead of "Bars 0–5" (`spotLabel`, +1 test).

## 2026-11-15 · arranger experiment — verdict
Research + bench (`exp/arranger-bench`, docs/arranger-research.md) → three branches: `exp/arranger-A-separation`
(RMVPE melody on the htdemucs vocal stem, chords from band + bass stems), `exp/arranger-B-texture` (bass-first
Viterbi + Sharon-style textures + voice-leading costs), `exp/arranger-C-llm-plan` (Claude plans textures, Viterbi
realizer). Fable judge (416-arr-bench/docs/arranger-verdict.md): **adopt A + B**, merged B first then A, after fixing
the `<harmony>` `<offset>` bug. Replayed A+B (solo_ttbb): tune RPA 0.701→0.807, note F1 0.603→0.739, symbols
0.780→0.836, sung root 0.903→0.925, parallels 49.1→0.60/100, backing 3.7 notes/bar; cost: harsh 0.071→0.083 from
A's held chromatic tune notes. C: most musical plans but tacet top voice 47% of bars, missing thirds, ±0.10 run-to-run,
~$0.19/song + API key → port its ideas into B's pattern library instead. Not merged anywhere yet (needs Eddie's OK:
the worker VM runs this code against production).

## 2026-11-15 · loop stopped
Every backlog item DONE except V18 (BLOCKED, thresholds = Eddie's call). Branch not pushed.
