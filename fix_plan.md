# fix_plan.md — the loop's backlog

**Scope: the Guitar tab only — Songs, Learn, Exercises.** (`practice/` is in scope because it *is*
Learn's implementation.) Out of bounds: vocal, home, social, fretboard, tuner, `src/lib`, the
worker. `scripts/gate.sh` step 5 enforces that. The files in `scripts/frozen-files.txt` are frozen
on top of it — a file list, not a folder freeze, so the rest of `song/follow/` (the mode screens,
`playerControls.js`, `GuitarFollow.css`) is writable; step 3 enforces that.

One item per iteration, top down. Status is `TODO`, `DONE` or `BLOCKED`.
The loop updates this file; nothing else writes to it.

**Tags.** `GATE` = a machine can check it, so a loop may do it. `HUMAN` = needs an instrument, a
device or an eye. `SPEC` = needs a spec written or amended first.

---

## Read this before taking an item

Guitar is the **more finished** tab. The conformance backlog — places where a spec is right and the
code never caught up — was almost entirely on the vocal side (vocal can't seek, can't loop, has no
noise gating). Scoping to guitar removes those, which means:

> **For guitar, the loop is a polish engine, not a conformance engine.** Its stop condition is the
> ratchet in `scripts/baselines.json` reaching its floor, plus the scenarios in the three new specs
> below. There is no backlog of unmet guitar scenarios to grind through, because guitar already
> meets what the specs ask — and where it differs, the *spec* is the thing that is wrong.

So Phase 0 is not optional here. It is most of the value.

---

## Phase 0 — before any loop iteration (human, interactive)

| ID | Status | Tag | Item |
|---|---|---|---|
| S1 | DONE | SPEC | Rewrite `openspec/config.yaml`'s `context:` block. It is injected into every artifact an agent generates and is wrong in twelve places (see [spec-reconciliation.md](docs/spec-reconciliation.md) §3) |
| S2 | DONE | SPEC | Apply the Case 1 edits that touch guitar: `scoring-engine` (the inverted soft gate, auto-skip F29, cleanliness F17, strum pattern F18, hit/late/missed F11, early-on-late F33), `ui` (F3 lesson flow), `notation-rendering` (F20/F36 random generation), `progress-tracking` (F2 unlocking map), `song-storage` (F4 "3 songs"). **The soft-gate one is urgent: the spec currently requires auto-advance, the exact thing CLAUDE.md invariant 4 forbids** |
| S3 | TODO | SPEC | Write `openspec/specs/ear-training/spec.md`. The README promises this capability and the directory does not exist. It governs Exercises, which is in scope |
| S4 | TODO | SPEC | Write `openspec/specs/guitar-learn/spec.md` for Learn as shipped: 20 chords in teaching order, unlock-on-clear, the four modes, the soft gate's real behaviour, the five strum steps |
| S5 | TODO | SPEC | Write `openspec/specs/guitar-songs/spec.md` for Songs as shipped: the three modes, Full/Easy, last-and-best from full runs of the current mode, run history, generated tab |
| S6 | TODO | SPEC | Write `openspec/specs/presentation/spec.md` — the polish contract, in checkable sentences (tokens, dark mode, breakpoints, one shell). Scoped to guitar for now. **Nothing else in this file can be verified until this exists** |

## The loop's work — polish, driven by the ratchet

Baselines as of 2026-11-13: `hexLiterals` 116 · `untokenisedSheets` 4 · `breakpointVariants` 4 ·
`largestInScopeComponent` 850 · `appTestFiles` 72 (may only grow).

| ID | Status | Tag | Item | Metric it moves |
|---|---|---|---|---|
| G1 | TODO | GATE | Create `app/src/styles/tokens.css` with a dark value for every token, seeded from the palette already in use (teal `#128789`, border `#e2dfd8`, ink `#24242c`, muted `#6c6a72`, danger `#cf4b36`, verdict green/amber/red). Then tokenise `GuitarTab.css` only | `hexLiterals` ↓ |
| G2 | TODO | GATE | Tokenise `song/GuitarSong.css`, `song/GuitarScore.css`, `song/TranscribePanel.css` — one file per iteration | `hexLiterals` ↓ |
| G3 | TODO | GATE | Tokenise `learn/Learn.css` and the seven `practice/*.css` sheets — one file per iteration | `hexLiterals` ↓ |
| G4 | TODO | GATE | Tokenise `exercises/Exercises.css` (445 lines, the largest in scope) and `exercises/StrumDrill.css` | `hexLiterals` → 0 |
| G5 | TODO | GATE | Give the 4 in-scope sheets that have neither a dark value nor a `var()` their dark-mode handling | `untokenisedSheets` → 0 |
| G6 | TODO | GATE | Collapse the 4 in-scope breakpoints to 3, defined once in `tokens.css` | `breakpointVariants` → 3 |
| G7 | TODO | GATE | Split `song/GuitarSong.jsx` (850 lines) along the seams its sections already imply. Mechanical extraction, no behaviour change | `largestInScopeComponent` ↓ |
| G8 | TODO | GATE | Loop an arbitrary range in Songs: pick two points, loop between them with the count-in. Replaces "Loop bar N", which loops only the first bar containing a miss | — |
| G9 | TODO | GATE | Resume where you left off within Guitar: section, song, mode, Full/Easy, tempo | — |
| G10 | TODO | GATE | A real empty state for every in-scope list — no songs, no transcriptions, no sessions, no runs — each naming the action that fills it | — |
| G11 | TODO | GATE | One loading treatment and one error treatment across Songs, Learn and Exercises | — |
| G12 | TODO | GATE | One focus ring, one hover, one disabled state in scope, from tokens | — |

**G8 and G9 are the two that decide whether you'd use it for three hours.** G1–G7 are what make it
stop looking like M2. If time runs short, G8, G9, G1, G5 — in that order.

---

## Deferred by the scope decision

Not abandoned; out of bounds while the loop is guitar-only. Guitar is being made the reference
implementation, and the vocal side is brought up to it afterwards.

| Item | Why it's deferred |
|---|---|
| Vocal summary seek (F24) and click-to-seek (F7) | Vocal files. These are the biggest usability gaps in the product and the main reason the two tabs feel unequal |
| Vocal noise gating (N6) | Vocal files |
| Moving the nine shared components to `app/src/ui/` | Touches `tabs/vocal/components/`. Until then, guitar keeps importing three of them from the vocal folder |
| One shared `InstrumentShell` | Needs both tabs. Guitar's shell becomes the canonical shape that vocal later adopts |
| Tempo per account (F37) | Needs `src/lib` and a migration |
| The private-note leak (N5) | Needs a migration — human work, never the loop's |
| Progressive speed trainer | New behaviour. Needs a spec-change request through Phase B first |

---

## Not loop work, ever

- the 14 entries in `scripts/frozen-files.txt` — judged by ear, never by a loop. **Note that
  `exercises/` imports `songClock.js`, `useGuitarListener.js` and `waitListening.js`, all frozen.**
  Reading them is fine; changing them is not. An Exercises item that needs a listener change is
  misclassified. The rest of `song/follow/` is writable, which is what makes G8 possible
- `app/src/audio/` — the shared capture
- `supabase/migrations/**` — CD applies these to the live project on merge
- `openspec/specs/**` — write a spec-change request instead
- `harmonic-design-document/**` — graded artifacts
- Anything outside the Guitar Songs/Learn/Exercises scope (gate step 5)
