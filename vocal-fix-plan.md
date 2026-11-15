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

Re-ranked 2026-11-15 after `docs/vocal-community-research.md` (R-refs = its recommendations).

| ID | Status | Item |
|---|---|---|
| V1 | DONE | Live pitch meter beside the score (tuner lane, words, phone strip). |
| V2 | DONE | Song screen hierarchy: compact modes, Settings in the header, 🎤 Sing in the dock. |
| V7 | DONE | Re-rank from community research (this table). |
| V11 | DONE | **Bug: pitch trail assumes a treble clef** (`useSheetOverlay.js`) — bass / treble-8 parts (every TTBB arrangement) draw at the wrong height. Read the staff's clef from OSMD. (R-P1) |
| V12 | DONE | **Grade each note on the staff as it ends**: ✓ green / amber ↑↓ / red ↑↓ (shape + colour), from the existing judge — no new thresholds; smooth the live trail and lift it in silence instead of dropping it. (R-P1, R-P3 presentation part, R-13) |
| V3 | DONE | **Take summary card**: plain sentences ("Flat in bars 9–12, about −30¢") with Loop / Hear the note actions; stars tied to the shown accuracy; drop "frames within 50¢" jargon. (R-5, R-6) |
| V13 | DONE | **Kind octaves**: meter says "An octave below — that counts" (direction-aware, calm colour); the result headline uses the octave-agnostic number already computed when that is what the singer did. (R-P2) |
| V14 | DONE | **Starting note + quiet mic**: one tap plays the first note (and its chord) before Sing; sound effects are muted while the mic is live and celebrate after. (R-7, R-6) |
| V15 | DONE | **Part-mix ladder** replaces "By myself / With all parts": My part only → My part louder → Others only → Everyone. (R-S2) |
| V6 | DONE | **Auto-transpose** — merge `feat/auto-transpose`; show "Key −2 (recommended for Tenor)" with override. (R-S3, R-9) |
| V5 | DONE | **MuseScore import** — merge `feat/mscz-import`; uploader copy "MIDI, MusicXML or MuseScore". |
| V16 | DONE | **Loop a passage**: drag across bars / "Loop this" on a trouble spot. (R-S3) |
| V9 | TODO | **Wait for me / Trouble spots**: same meter; Wait plays the note once when it stops and offers Skip. (R-12) |
| V4 | DONE | **Songs home cards** with useful info (parts, key, range, best stars) and a Continue row. |
| V17 | TODO | **Steadier score**: lyrics larger and higher-contrast, own staff highlighted in multi-part scores. (R-S1, partial — page layout is a bigger change) |
| V8 | TODO | Phone (390×844) + dark-mode pass on every Vocal screen. |
| V10 | TODO | Top tab bar: consistent icons; streak / sound buttons labelled. |
| V18 | BLOCKED | **Strictness levels** (Relaxed ±50¢ / Standard ≤25¢ / Choir ≤15¢, R-P3) and median-after-onset judging — these change verdict thresholds (CLAUDE.md invariant 5): needs Eddie's / the team's decision. |
