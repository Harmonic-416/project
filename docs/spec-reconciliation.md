# Spec Reconciliation — the one-time migration that makes the loop possible

**Date:** November 12, 2026. **Status:** report. No spec, config or code was changed to write this.
**Audience:** the team. Approve the Case 1 and Case 3 columns, then the loop can run.

---

## 1. How the design document actually gets fed to Claude Code

The short answer: **it doesn't, and it shouldn't.** The design document is prose, history and
rationale — 1,039 lines, half of it describing features we deliberately removed. Point an agent at
it and it will rebuild them.

The mechanism is three steps, and only the middle one is a loop:

```
  harmonic-master-design-document.md          ← prose, history, trade-offs. Read by humans.
            │
            │  ONE TIME, human-approved. §7.1 (what we cut, and why) and §9
            │  (the decision record) ARE the migration instructions: every row
            │  names a requirement and says DELETE or MODIFY.
            ▼
  openspec/config.yaml  +  openspec/specs/<capability>/spec.md
            │                ← SHALL statements with scenarios. The contract.
            │                  Read by the agent, one capability per iteration.
            │                  READ-ONLY to the loop, forever.
            ▼
  PROMPT.md + CLAUDE.md + ONE spec + ONE item from fix_plan.md + scripts/gate.sh
            │                ← what the agent actually sees. ~2,000 tokens.
            ▼
      the loop: fix the implementation until the spec is met
```

So "feed the design doc to Claude Code" resolves to: **use the design doc once, by hand, to make the
specs true; then feed the specs.** The design document's job after that is to be regenerated *from*
the specs at M5.

**Today the loop cannot run,** because the contract it would read is M1-era fiction. This document is
the complete list of what has to change first. It is one to two days of work, and nothing downstream
is worth starting until it is done.

---

## 2. The three cases

Every discrepancy between `openspec/specs/**` and the shipped app falls into exactly one of these,
and the case decides who fixes it. Sorting them this way is the whole point of the exercise.

| Case | Situation | Who fixes it | Where it goes |
|---|---|---|---|
| **1** | **Spec wrong, code right.** The spec mandates behaviour we deliberately cut | A human, once, now | Section 4 — edit `specs/` |
| **2** | **Spec right, code wrong.** The spec describes behaviour we agreed to and never finished | **The loop** | Section 5 — `fix_plan.md` |
| **3** | **No spec at all.** Shipped behaviour nothing describes | Agent drafts, human approves | Section 6 — new spec files |

**Case 2 is the loop's entire backlog.** That is the answer to "fix the implementation until it meets
the spec": there are only a handful of places where the spec is already right and the code has not
caught up, and those are exactly the places a loop is safe and useful.

Current totals: **52 requirements across 9 capabilities.** Of those, **12 are Case 1**, **6 are
Case 2**, and the shipped app has roughly **half of its surface in Case 3** — no spec of any kind.

---

## 3. `openspec/config.yaml` is the first thing to fix

This is more urgent than any spec file. `config.yaml`'s `context:` block is injected into **every**
artifact an agent creates — every proposal, every spec, every task list. It is M1-era and wrong in
twelve places, so every artifact generated from it inherits the errors.

| What `config.yaml` says | Reality | Source |
|---|---|---|
| "short guided lessons on an unlocking (Duolingo-style) map" | Cut. Guitar has a flat exercise path; vocal has no map | §7.1 (F2) |
| "Design spine: teach the theory first, THEN the technique that proves it landed" | Cut as a structure. The only survivor is vocal Learn, added Nov 2 and chosen by the singer | §7.1 (F3) |
| "a 3-song practice playlist" | Superseded: 3 guitar + 7 vocal built-ins, an online catalog, your own files, and three kinds of generated score | §2.2 |
| "Single-player only" | Social shipped: friends by name#tag, invite links, sending runs, comments | §2.10 |
| "NO custom Node/Express server in V1, and none unless a future need cannot be expressed in Supabase" | A Node worker exists in `worker/arranger/`. The need was real and is documented | §4.7 |
| "guitar chord verification: native Web Audio AnalyserNode FFT" | Songs use a score-informed judge with an FFT written in JavaScript; lessons use chroma templates | §4.1 |
| "a cleanliness/'fuzziness' proxy" | Cut. Binary per string: rang clean, or buzzed or wrong | §7.1 (F17) |
| "miss counting + soft auto-skip" | Auto-skip cut. The soft gate never advances on its own | §7.1 (F13, F29) |
| "strumming/timing score" | Direction and patterns cut; timing only, in Strum on the beat | §7.1 (F18) |
| "'couldn't hear you' state" | Guitar only. On vocal, quiet moments are simply not scored | §7.1 (F21) |
| "target <=100 ms mic-to-score" | Deliberately traded: right over fast. Guitar verdicts take 200–300 ms | §5.2, §7.1 (N1) |
| F38 "Changes mode" and F26 "group/social" listed as OUT of V1 | F38 was built without its tempo; F26 was built as asynchronous social | §9 |

Also stale: `openspec/README.md` lists `specs/tuner` and `specs/ear-training` in its
capability table. **Neither directory exists.** They live only as unarchived change deltas.

**Fix:** rewrite the `context:` block from the master design document's §1.1, §5 and §7.2. Keep it
short — it is injected every time. The four §7.2 principles (judging on the device, the soft gate,
right over fast, a run never goes out silent) belong in it verbatim, marked inviolable.

---

## 4. Case 1 — spec wrong, code right (12 requirements, human, one-time)

These mandate behaviour we removed on purpose. A loop reading them would re-add five cut features.
Each row's authority is the master doc §7.1 row of the same F-number.

| Capability | Requirement | Action | Why |
|---|---|---|---|
| `scoring-engine` | Guided mode soft gate (F13, F28) — *"SHALL advance anyway after N=3 attempts"* | **MODIFY** | **This is inverted, not merely stale.** The shipped soft gate *never* advances on its own; it surfaces Hint, Skip and Unlock anyway. The spec currently requires the exact thing §7.2 says we refused to cut |
| `scoring-engine` | Three-miss auto-skip (F29) | **DELETE** | Removed after testing: on real guitars it advanced on wrong notes |
| `scoring-engine` | Chord cleanliness / fuzziness (F17) | **MODIFY** | Leftover buzz is indistinguishable from a wrong note; a score would be a guess |
| `scoring-engine` | Strumming pattern and timing score (F18) | **MODIFY** | Down- and up-strums sound alike; timing only |
| `scoring-engine` | Explicit "couldn't hear you" (F21) | **MODIFY** | Guitar keeps the message; vocal leaves quiet moments unscored |
| `scoring-engine` | Instrument-agnostic hit/**late**/missed (F11) | **MODIFY** | Shipped: hit / close / missed, counted per run. No early-late rating per note |
| `scoring-engine` | Post-run analysis *"early/on/late"* (F14, F33) | **MODIFY** | Same reason; timing is rated only in Strum on the beat |
| `scoring-engine` | Purpose line: *"AlphaTab's expected notes"* | **MODIFY** | True for guitar only. Voice is OSMD. The purpose of this capability is that it does **not** know |
| `progress-tracking` | Unlocking Lesson Map with Prerequisites (F2) | **MODIFY** | Chords still unlock in order; the *map* and its prerequisites are gone |
| `ui` | Lesson flow display (F3) | **MODIFY** | No concept → drill → play sequence; Exercises are their own section |
| `ui` | Practice playlist (F4) | **MODIFY** | Superseded by the song library, search, uploads and practice sessions |
| `notation-rendering` | Random melody (F20) and chord progressions (F36) | **MODIFY** | The player picks what to train; Play mode uses chords they have learned |
| `song-storage` | Seeded Song Library (F4) — "3 songs" | **MODIFY** | 10 built-ins across two instruments, plus the catalog |
| `audio-pipeline` | Sub-100ms latency (N1) | **MODIFY** | Right over fast. State the real budget: a strum settles in 0.2 s, a note rings 0.3 s before judgement |

*(Fourteen rows, twelve requirements — F4 and N1 each appear in two capabilities.)*

---

## 5. Case 2 — spec right, code wrong: **this is the loop's backlog**

Six items. The spec already says the right thing and the implementation never caught up. This is
what "fix the implementation of the specs" means, concretely, and all six are gate-able.

| # | Capability | Requirement | What's missing | Tag |
|---|---|---|---|---|
| L1 | `ui` | Run-through summary with patchy-area highlighting (F24) | Guitar has **Loop bar N**; vocal summaries cannot be clicked at all. The spec requires highlighting for both | GATE |
| L2 | `notation-rendering` | Click/drag to seek (F7) | Vocal has a slider only — you cannot click the score to go somewhere. Guitar can click the tab | GATE |
| L3 | `progress-tracking` | Per-Song Tempo Preference Persistence (F37) | Shipped in `localStorage`, so it is per *device*. The spec says per user, and the spec is right | GATE |
| L4 | `audio-pipeline` | Noise and volume gating (N6) | Guitar has a tonal check, a ring check, a fresh-playing check and click rejection. Vocal has a clarity threshold and a level floor, and nothing else | GATE |
| L5 | `song-storage` | Private Attempt-Recording Storage (F23, N5) | A friend a run was sent to can read the owner's private note and rating with a hand-written query. The spec says private-by-default; the code leaks | **HUMAN** (migration) |
| L6 | `audio-pipeline` | Normalized event shape, no instrument branching | Holds in the scoring path. Worth one conformance test per analyzer so the loop can't quietly break it | GATE |

L1 and L2 together are the single biggest usability gap in the product and the reason the Vocal tab
feels like a different, lesser app than the Guitar tab. **Start the loop here.**

L5 is listed for completeness and is **not loop work** — migrations are denied to the agent because
CD applies them to the live project on merge.

---

## 6. Case 3 — no spec at all (roughly half the app)

`specs/` describes the app as planned at M1. It does not describe:

| Shipped capability | Spec status | Suggested file |
|---|---|---|
| Tuner (F39) | README claims it exists; directory absent | `specs/tuner/` |
| Ear training (F41) | README claims it exists; directory absent | `specs/ear-training/` |
| Practice sessions, attempt history, notes and ratings, the recording budget | Nothing | `specs/practice-history/` |
| Sharing, friends, name#tag, invite links, comments | Nothing | `specs/social-sharing/` |
| Guitar run history, Easy/full-run, last-and-best, recording timing | Nothing | extend `practice-history` |
| The vocal arranger and its worker queue | Nothing | `specs/arranger/` |
| Generated tab (Viterbi fretting) and audio-to-tab | Nothing | `specs/tab-generation/` |
| Vocal Learn, Exercises, Warm Up | Nothing | `specs/vocal-learning/` |
| Solfège (movable do) and dynamics | One line in `notation-rendering` | extend it |
| Fretboard explorer | Nothing | `specs/fretboard/` |
| **Visual consistency, theming, dark mode, responsive layout** | **Nothing — see below** | `specs/presentation/` |

The last row is the one that matters most for M5, and it is the reason the app "looks unpolished."
**There is no spec anywhere for what the app should look like.** `specs/ui` holds eight functional
display requirements and says nothing about palette, spacing, type, dark mode, breakpoints or
interaction states. A loop cannot polish what nothing describes, so `specs/presentation/spec.md` has
to be written before any polish iteration — and written in checkable terms, which is what
`scripts/gate.sh` then enforces:

> *WHEN any stylesheet in `app/src` sets a colour THE SYSTEM SHALL resolve it through a token
> defined in `app/src/styles/tokens.css`.*
> *WHEN the device is in dark mode THE SYSTEM SHALL render every screen from the dark token set.*
> *THE SYSTEM SHALL use only the breakpoints defined in `tokens.css`.*
> *WHEN a user opens either instrument THE SYSTEM SHALL present the same shell: the same section
> switch, the same top bar, the same account control, in the same positions.*

Those four sentences are mechanically testable, which makes "polished" a stop condition rather than
an opinion.

### The product-level version of the same problem

`specs/` has no requirement anywhere stating that Harmonic is **one** app. A user today must decide
"am I a guitar person or a singer" before anything else, and then lands in one of two worlds that
solve the same problem by two different methods — two vocabularies, two shells, two sets of
practice controls that happen to share code underneath. Songs is where the two genuinely converge,
which is why the direction is songs-first (master doc §8).

So `specs/presentation/` should carry one requirement with real teeth:

> *THE SYSTEM SHALL present the song, not the instrument, as the entry point: a song names the
> instrument and part it is practised with, and every practice control, summary, history view and
> share surface SHALL be identical in shape across instruments, differing only where the instrument
> itself differs (frets versus pitch).*

That is the requirement the loop drives toward, and A1–A5 in the
[M5 polish plan](M5-polish-plan.md) are its implementation.

---

## 7. Order of operations

1. **Rewrite `config.yaml`'s context block** (Section 3). Nothing else is reliable until this is
   right, because it is injected into every generated artifact.
2. **Apply the 12 Case 1 edits** (Section 4) to `specs/` by hand, or agent-drafted and read line by
   line. Each edit cites its master doc §7.1 row as rationale.
3. **Sync and archive the 13 open changes.** `/opsx:sync` the shipped ones into `specs/`, then
   `/opsx:archive`, so `changes/` holds only work in flight. `changes/archive/` is empty today, which
   means an agent cannot tell finished work from pending.
4. **Write `specs/presentation/spec.md`** (Section 6) — the polish contract, in checkable sentences.
5. **Write the Case 3 specs** for the tuner and ear-training first, since the README already
   promises them, then the rest as time allows. Agent-drafted from the master design document,
   approved by a human.
6. **Seed `fix_plan.md`** with the six Case 2 items plus the polish plan's W-A/W-B/W-C tasks.
7. **Only now start the loop,** at L1 (report-only).

Steps 1–3 are the blocker and are about a day. Step 4 is half a day and is what makes M5's polish
work measurable. Steps 5–6 can proceed in parallel with the first loop iterations.

---

## 8. What the loop must never do

Repeated here because it is the rule that makes the rest safe: **the agent never edits a spec.**
When the spec is the obstacle, it writes a spec-change request under `openspec/changes/<id>/` and
stops. A loop that can rewrite its own contract will eventually rewrite the contract instead of
fixing the code, and every gate will be green forever.

The one-time migration in this document is a *human* act, authorised by the design document. After
it, `openspec/specs/**` is read-only to the loop for good.
