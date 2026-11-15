# vocal-fix-plan.md — the Vocal polish loop's backlog

Branch `feat/vocal-polish-loop` = `harmonic/main` + Jamie's `feat/ui-polish` (Duolingo-style reskin).
Goal: make the Vocal tab more intuitive, cleaner and more usable; parse MuseScore files natively;
make on-pitch / off-pitch feedback obvious while singing.

Rules (from CLAUDE.md, adapted — Eddie asked for this vocal cycle on 2026-11-15):
- Presentation only around scoring: thresholds in `pitchDetector.js` / `scoring.js` / judging are NOT changed
  (invariant 5, "right over fast"). Live audio never leaves the device (invariant 1).
- Guitar is the reference shape (invariant 7) — reuse its patterns/tokens where a control exists in both.
- No migrations, no workflow edits, no design-document edits. No hex literals outside token/theme files.
- One item per iteration, top down. Each iteration: screenshot before/after, `npm --prefix app test`,
  `npm --prefix app run lint`, commit, append to `vocal-loop-log.md`.

Status: `TODO`, `DOING`, `DONE`, `BLOCKED`.

| ID | Status | Item |
|---|---|---|
| V1 | DONE | **Live pitch feedback, glanceable.** Replace the tiny text pill ("A4 · target G4 (+23¢)") with a pitch meter beside the score while singing: target note name big, your pitch as a marker on a vertical lane with an in-tune band, colour state (in tune / close / off / octave), and plain-words direction ("a bit higher ↑"). Continuous trail line on the staff instead of loose dots; the current target note glows. |
| V2 | TODO | **Song screen hierarchy.** One sticky bottom action bar: primary "Sing" (record attempt) + secondary Play/Stop + progress; mode cards compact (segmented control); drop helper-text noise. |
| V3 | TODO | **Attempt result card.** Duolingo-style summary (stars, % in tune, notes hit, "trouble bars" chips that jump to the bar) instead of rows of jargon ("frames within 50¢"). |
| V4 | TODO | **Songs home.** Song cards show useful info (voice parts, key, range, best stars, length) instead of identical gradient + 🎵; "Continue" row for the last song. |
| V5 | TODO | **MuseScore import** — merge `feat/mscz-import` (side agent) and polish the upload UI copy ("MIDI, MusicXML or MuseScore"). |
| V6 | TODO | **Auto-transpose** — merge `feat/auto-transpose` (side agent) into the song screen settings. |
| V7 | TODO | Apply community research (`docs/vocal-community-research.md`) — re-rank this list when it lands. |
| V8 | TODO | Phone (390×844) and dark-mode pass on every Vocal screen. |
| V9 | TODO | Wait-for-me and Trouble-spots screens get the same pitch meter as V1. |
| V10 | TODO | Top tab bar: consistent icons, active state matches guitar; streak/sound buttons labelled. |
