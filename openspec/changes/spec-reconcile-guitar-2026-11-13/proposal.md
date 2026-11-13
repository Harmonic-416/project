# Spec reconciliation — the Case 1 edits that touch guitar

**Item:** `fix_plan.md` S2. **Date:** 2026-11-13. **Status:** drafted by an agent, NOT APPLIED.
**Authority:** `docs/spec-reconciliation.md` §4, each row citing the master design document's §7.1
row of the same F-number.

## Why

`openspec/specs/**` was written at M1 and still mandates five behaviours the team removed on
purpose after testing. An agent reading it today would rebuild them. The urgent one:

> `specs/scoring-engine/spec.md`, Requirement "Guided mode soft gate (F13, F28)":
> *"SHALL advance anyway after N=3 attempts (a soft gate)"* — and a whole requirement for
> three-miss auto-skip (F29).

That is the exact behaviour CLAUDE.md invariant 4 and master §7.2 forbid: *"the microphone never
advances a lesson on its own. There is no auto-skip — it was removed on purpose after testing."*
The spec does not merely lag the code here; it is **inverted**, and it is the one M2 teaching
promise that survived every milestone.

## What this is not

Not an implementation change. **No application code moves.** The code is right and the spec is
wrong; only the spec changes. Nothing here is a feature.

## The edits

| Capability | Requirement | Form | Why |
|---|---|---|---|
| `scoring-engine` | Guided mode soft gate (F13, F28) | MODIFIED | Inverted. The gate never advances on its own; it surfaces Hint, Skip and Unlock anyway |
| `scoring-engine` | Three-miss auto-skip … (F29) | REMOVED | Removed after testing: on real guitars it advanced past wrong notes |
| `scoring-engine` | Instrument-agnostic hit/**late**/missed (F11) | REMOVED → ADDED | Shipped verdicts are hit / close / missed. No early-late rating per note |
| `scoring-engine` | Chord cleanliness / **fuzziness** (F17) | REMOVED → ADDED | Binary per string. Leftover buzz and a wrong note are indistinguishable from a mic |
| `scoring-engine` | **Strumming pattern** and timing score (F18) | REMOVED → ADDED | Timing only. A down-strum and an up-strum sound alike |
| `scoring-engine` | Post-run analysis "**early/on/late**" (F14, F33) | MODIFIED | Same reason as F11 |
| `ui` | Lesson flow display (F3) | MODIFIED | No concept → drill → play sequence; Exercises are their own section |
| `ui` | Practice **playlist** (F4) | REMOVED → ADDED | Superseded by the library, search, uploads and drafts |
| `notation-rendering` | **Random** melody (F20) + chord progressions (F36) | REMOVED → ADDED | The player picks what to train; Play mode uses chords they have cleared |
| `progress-tracking` | Unlocking Lesson **Map** with Prerequisites (F2) | REMOVED → ADDED | Chords still unlock in order; the map and its prerequisite graph are gone |
| `song-storage` | Seeded Song Library — "**3 songs**" (F4) | REMOVED → ADDED | 3 guitar + 7 vocal built-ins, plus a catalog readable without an account |

### A note on form

Where only the text is wrong, the delta is `## MODIFIED Requirements`, repeating the
`### Requirement:` header **exactly** as `specs/` has it today.

Where the requirement's **name** is itself the error — "hit/late/missed", "cleanliness /
fuzziness", "Strumming pattern", "playlist", "Random", "Map" — a MODIFIED block cannot express it,
because MODIFIED is keyed by that header. Those are written as `## REMOVED Requirements` (header
plus a one-line reason) followed by `## ADDED Requirements` carrying the corrected name and the
full new text. The net effect is a rename; `docs/spec-reconciliation.md` §4 calls it MODIFY.

### Four hand edits the delta form cannot carry

A `## Purpose` paragraph is not a requirement, so **no delta block can reach one** — and four of
the five are wrong, each repeating a cut behaviour in the one paragraph an agent reads first. They
have to be edited by hand. (`specs/ui`'s is fine and stays.)

**1. `specs/scoring-engine/spec.md`.** It currently reads:

> The instrument-agnostic scoring brain: it compares normalized `{note, timestamp, confidence}`
> events to AlphaTab's expected notes on the one clock to score hit/late/missed. It owns the guided
> and play mode state machines, chord verification and cleanliness, strumming/timing scoring,
> post-run analysis, and the "couldn't hear you" state.

Replace with:

> The instrument-agnostic scoring brain: it compares normalized events to the expected notes the
> renderer parsed — alphaTab's for guitar, OpenSheetMusicDisplay's for voice — on the one transport
> clock, and scores each as hit, close or missed. It owns the guided, practice, play and changes
> state machines, chord verification, per-string verdicts, strum timing, post-run analysis, and the
> guitar "couldn't hear you" state. It never learns which analyzer produced an event.

Three errors in four lines: "AlphaTab's expected notes" is true for guitar only and contradicts the
capability's whole purpose; "hit/late/missed" and "cleanliness" are the cut behaviours.

**2. `specs/notation-rendering/spec.md`.** It currently opens "AlphaTab tab + standard-notation
rendering (source of truth for expected notes)" — true of guitar only, voice being OSMD — and ends
"and Tonal.js random melody / chord-progression generation", a cut behaviour named after a library
the project does not have. Replace with:

> Notation rendering and reference playback, one renderer per instrument: alphaTab for guitar (tab
> and standard notation together, and the source of the guitar timeline's ticks), OpenSheetMusicDisplay
> for voice (its cursor gives the timing model), with alphaSynth and Tone.js playback on the single
> transport clock. It owns guitar notation conversion in and out, generated tab for files that carry
> no string or fret data, the countdown, click-and-drag seek, the per-song tempo control, the solfège
> toggle, and drawing the exercise material the player chose or has already learned.

**3. `specs/progress-tracking/spec.md`.** It currently says it "drives the unlocking lesson map (a
node unlocks once its prerequisites clear, including knowledge-only nodes)" — all three of those
concepts are gone. Replace with:

> Persists per-user progress: the guitar chord lessons, which open one at a time in teaching order,
> the run history with the last and best score per song, and the per-song tempo. Covers F2, F22 and
> the persistence side of F37. There is no lesson map and no prerequisite graph.

**4. `specs/song-storage/spec.md`.** It currently says "the song library (V1 seeds 3 songs)" and
"(and seeds the F4 library)". Replace with:

> Manages the song library — built-in songs for both instruments, a read-only public-domain catalog
> readable without an account, and notation import (MusicXML, MXL, MIDI, Guitar Pro and alphaTex,
> best-effort) — plus private-by-default compressed per-run recordings via Supabase Storage with
> row-level security. A file the user opens from their own device is never uploaded. Covers F9, F10,
> F23, N3, N5 and the storage side of F4.

### One requirement edited for coherence, beyond S2's list

`progress-tracking` "Run-Through History with Last Score (F22)" displays the last score *"on the
lesson map"*. The lesson map is deleted by this change, so leaving F22 alone would strand a
reference to a concept that no longer exists. Its MODIFIED block also states what the code actually
keys history on — song, mode, part, version, full runs only — which S4 and S5 will otherwise have to
contradict.

## Non-goals

- **Case 2** (spec right, code wrong) — that is the loop's conformance backlog, and for guitar it is
  nearly empty. Not touched here.
- **Case 3** (no spec at all) — S3 to S6 write those: `ear-training`, `guitar-learn`,
  `guitar-songs`, `presentation`.
- **`audio-pipeline` "Sub-100ms latency and mobile-Safari viability (N1, N2)"** — a Case 1 row in
  §4 that touches guitar (the real budget is 0.2 s for a strum, 0.3 s for a ring) but is **not** in
  S2's enumeration, so it is left for a human to decide. Flagged because `config.yaml` has already
  been corrected on this point, so spec and context now disagree.
- **`scoring-engine` "Explicit 'couldn't hear you' state (F21)"** — also a §4 row, also outside
  S2's list. As written it is true of guitar, which keeps the message; it is wrong only about vocal,
  where quiet moments are simply left unscored. Out of a guitar-scoped pass.
- The `progress-tracking` scenario *"Knowledge-only node clears without audio"* disappears with the
  map requirement, because no knowledge-only node ever shipped. The spirit survives in `ui` F3:
  an activity that does not listen needs no microphone.
- No count of built-in songs is written into `song-storage` F4. Hardcoding "3" is what rotted the
  requirement in the first place.

## Open questions for the human

- [NEEDS CLARIFICATION] `ui` F24 ("click the rendered music to highlight patchy areas") is Case 2,
  not Case 1 — the spec is right and guitar implements only "Loop bar N". Backlog item G8 replaces
  that with an arbitrary range. Should F24's scenarios be tightened to say *range*, which would
  make G8 verifiable against a spec instead of against the ratchet alone?
- [NEEDS CLARIFICATION] F17's id now covers a different promise (per-string verdicts, not a
  cleanliness score). Keep the id for traceability to `specifications/2-scope/requirements.md`, or
  retire it and note the change there? This draft keeps it.
