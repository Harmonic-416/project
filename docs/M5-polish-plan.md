# M5 — Polish Implementation Plan

**Written for:** the team, and for Claude Code to execute from. **Date:** November 12, 2026.
**Horizon:** three weeks, to M5.

This is the plan that answers the professor's eight points. It is deliberately a *plan*, not a spec:
the specs it creates are the things an agent actually reads (Section 5). Nothing here adds a feature.
Everything here makes what exists feel like one finished product.

Companion documents: the [master design document](../harmonic-design-document/harmonic-master-design-document.md)
for what Harmonic is and where it is going, and [ai-iteration-research.md](ai-iteration-research.md)
for why the loop is shaped the way it is. **The loop protocol in Section 6 is that report's §3.7, and
it has not been changed.**

---

## 1. The complaints, against what the code actually says

Every row below is measured, not estimated.

| # | Professor's point | What the code shows |
|---|---|---|
| 1 | "Looks unpolished and prototypey" | **115 distinct hex colours, 586 uses** across 50 CSS files (7,447 lines). The app's entire global palette is **7 tokens**, defined in `app/src/auth/authTheme.css` — a file whose own header says it is "Colours for the sign-in and account screens," now quietly powering the tab bar. Three more uncoordinated token sets exist with different prefixes: `--hm-*`, `--hp-*`, `--fb-*` (94 definitions in total) |
| 2 | "Looks no different from M2 / no effort shown" | The chrome is what a viewer sees first, and the chrome is the least-touched code in the repo. Five different breakpoints (380, 440, 480, 560, 760 px) and **dark mode in 11 of 50 CSS files** — so 39 files render light-mode colours on a dark background. The features did change enormously since M2; the surface did not |
| 3 | "Biggest hurdle to actually using it" | Answered in Section 3. Short version: **you cannot practise a passage.** Vocal cannot seek or loop at all (F24, open since M1); guitar can only loop *the first bar containing a miss* |
| 4 | "Loop on implementation, not the spec" | Adopted exactly: Section 6. Blocked by Phase 0 — **13 OpenSpec changes are open, `changes/archive/` is empty, and `specs/ui/spec.md` still requires `F3` (concept → drill → play) and `F4`, both of which M4 §7.1 deliberately cut.** An agent reading `specs/` today would rebuild features you removed |
| 5 | "Don't add features; fix what you have" | Section 4 makes this a hard constraint with a deny list, not an intention |
| 6 | "Come out with a real-world product" | The direction is songs-first (master doc §8). This plan is its presentation and ergonomics half |
| 7 | "Presentations are last-minute" | Section 9: one rehearsed demo path, scripted, run three times before M5 |
| 8 | "Feels like two separate apps" | **The diagnosis is wrong in an encouraging way — see Section 2.** The logic is already deeply shared in both directions. What is duplicated is only the presentation |

---

## 2. Diagnosis: it is not two apps, it is one app with two skins

This matters because it changes the size of the job from a rewrite to a refactor.

**The logic is already bridged, bidirectionally.** Guitar imports vocal's pitch detector, MIDI
parser, lyric reader, quantiser, MusicXML loader, notation export and practice-session model.
Vocal imports guitar's chord recogniser, beat clock, score-XML writer, audio decoder and ONNX
runtime loader. Nine components under `app/src/tabs/vocal/components/` are used by the Guitar tab:
`PlaybackControls`, `ShareAttempt`, `SharedAttemptGate`, `AccompanimentToggle`, `PartTabs`,
`PracticeModeToggle`, `PracticeSessions`, `SongLibrary`, `OnlineSongs`.

So §5.1 of the design document is true: scoring, history and sharing really are
instrument-agnostic. **Three presentation-level facts are what make it read as two apps:**

1. **The folder structure lies.** Nine shared components live inside `tabs/vocal/`, so Guitar reaches
   across into Vocal's folder. Anyone reading the tree concludes vocal is the real app and guitar
   borrows from it.
2. **Two vocabularies for one concept.** Guitar calls them **views** (`guitar-tab__view`); Vocal calls
   them **sections** (`vocal-frame__section`), and Vocal also carries a second prefix,
   `vocal-tab__*`. The master design document inherited this split and uses both words.
3. **The two shells are copy-paste twins.** `GuitarTab.css` and `VocalTab.css` define the same switch,
   the same top bar, the same body and the same three phone breakpoints, rule for rule, differing only
   in the prefix — including the identical comments ("Small phones: signed in, the account button
   shows just the picture"). Both hardcode `#e2dfd8`, `#6c6a72`, `#ffffff`, `#128789` rather than
   using the tokens that exist.

**Therefore:** bridging the two apps does not require architectural work. It requires one shared
presentation layer, one vocabulary, and one palette. That is mechanical, low-risk, and — crucially
for point 4 — **machine-checkable**, which is what makes it loop-able at all.

---

## 3. The biggest hurdle to actually using it

The professor asked for this in the design doc, so it belongs here first and then in the master doc.

> **You cannot practise a passage.** Practice is: find the hard four bars, play them slowly, play
> them again, speed up. Harmonic cannot do this. The Vocal tab has no seek and no loop — F24 has
> been open since M1, and the master doc §6 still lists it. The Guitar tab has one button,
> **Loop bar N**, which loops *the first bar containing a miss* — not a bar you choose, not a range.
> So the only way to practise bar 14 is to sing or play bars 1 to 13 first, every time.

That single gap is why none of us uses the app for three hours. Everything else on the three-hour
list is secondary to it:

| Hurdle | Evidence | Fix lands in |
|---|---|---|
| **1. No seek, no loop, no range** | F24 open since M1; vocal has neither; guitar loops only the first missed bar | W-B1, W-B2 |
| **2. No speed trainer** | Tempo is a manual 50–100% dial, reset by hand every pass. Soundslice's progressive speed training is the one competitor feature that is nearly free on top of what exists | W-B3 |
| **3. Dark mode is broken in 39 of 50 stylesheets** | Three hours of a half-dark UI is physically tiring | W-A2 |
| **4. Nothing remembers where you were** | Sessions resume within 30 minutes, but the *view*, the mode, the part and the tempo do not; tempo is per device, not per account | W-C1 |
| **5. Dead ends with no empty state** | New account, no files, no catalog hit: several screens render an empty box | W-C2 |

W-B1 to W-B3 are the three-hour bar. If only one workstream ships, ship that one.

---

## 4. Non-negotiables

These are constraints on the agent, enforced by hooks and the gate, not requests.

1. **No new features.** Every task in Section 8 is a *parity*, *consistency*, *continuity* or
   *correctness* task against behaviour the master design document already claims. If a task requires
   a feature decision, it stops and escalates (Section 6, Phase B).
2. **The spec is read-only to the loop.** The agent may never edit `openspec/specs/**`. When the spec
   is the obstacle, it writes a spec-change request and stops.
3. **Write access is scoped.** Allowed: `app/src/**`, `app/tests/**`, `src/lib/**`, `tests/**`,
   `scripts/**`, `fix_plan.md`, `loop-log.md`.
   **Denied by hook:** `supabase/migrations/**` (CD applies these to the live project on merge),
   `.github/workflows/**`, `openspec/specs/**`, `harmonic-design-document/**`, `package-lock.json`,
   `vercel.json`.
4. **Frozen paths — not loop work under any circumstances.** `app/src/tabs/guitar/song/follow/`
   (judge thresholds), the shared audio capture, and anything tuned by ear. The master doc §6 says
   guitar thresholds were first tuned on simulated strings; a loop optimising against synthetic
   signals will overfit to them and no gate will notice.
5. **Branch and PR only.** The loop never merges. Merging applies the test plan's definition of done,
   including physically testing with an instrument, which no gate can check.
6. **One item per iteration, fresh context.** State lives in `fix_plan.md` and `loop-log.md`.

---

## 5. Phase 0 — make polish checkable (do this first; no loop until it is done)

A loop needs a stop condition. "Looks polished" is not one. Phase 0 converts polish into numbers
that can only go down.

**P0-1 · Reconcile the specs.** *(half a day, interactive, human-approved)*
Have an agent produce a contradiction report — every requirement in `openspec/specs/**` against
shipped behaviour and master doc §7 — then **you** apply the fixes. Known contradictions: `specs/ui`
requires `F3` (concept → drill → play) and `F4`; `specs/scoring-engine` still mandates three-miss
auto-skip (F29), chord-cleanliness scoring (F17), strum direction (F18) and vocal "couldn't hear
you" (F21). All four were deliberately cut. Then `/opsx:sync` and `/opsx:archive` the shipped changes
so `openspec/changes/` holds only work in flight — today it holds 13 with an empty archive.
*Until this is done, every later step is built on sand.*

**P0-2 · Write `CLAUDE.md`.** ~100 lines, repo root. Commands (`npm run ci`,
`npm --prefix app test`), conventions (oxlint, vitest, tests in `app/tests/*.test.js` not beside
sources, the `@backend/*` alias), the invariants from master doc §7.2 marked *inviolable*, and the
deny list from Section 4. Short on purpose: if an agent could find it by reading the code, leave it
out.

**P0-3 · Create the real token file.** `app/src/styles/tokens.css` — the single source of colour,
spacing, radius, type scale and the **three** approved breakpoints (480, 768, 1024; the current five
are an accident). Seed it from the palette already in use: teal `#128789`, warm white `#ffffff`,
border `#e2dfd8`, ink `#24242c`, muted `#6c6a72`, danger `#cf4b36`, plus the verdict colours green
`#2e9e5b` / amber `#e0a100` / red `#cf4b36` that the marks already use. Every token gets a dark
value in the same file. `authTheme.css` becomes a two-line re-export so nothing breaks in one commit,
and is deleted at the end of W-A.

**P0-4 · Write `scripts/gate.sh` and the ratchet.** This is the heart of the plan. See Section 7.

**P0-5 · Commit today's baselines.** `scripts/baselines.json`: hex-literal count (586), non-tokenised
stylesheet count (39), breakpoint variants (5), app test count (run it and record), bundle size, and
the three benchmark numbers from `transcribeBenchmark`, `realSongBenchmark` and `guitarBandBenchmark`.
**The gate fails if any number gets worse.** That turns "polish it" into a measurable descent.

**P0-6 · Write `fix_plan.md`** from Section 8's table, one line per task, each tagged `GATE`
(a machine can check it), `HUMAN` (needs an instrument, a device or an eye) or `SPEC` (needs a
decision first).

---

## 6. The loop protocol

Taken unchanged from [ai-iteration-research.md](ai-iteration-research.md) §3.7, which is the
professor's point 4 formalised.

**Phase A — Conformance.** The loop runs:

```
item ← highest-priority UNMET item in fix_plan.md (one only)
implement the smallest change that satisfies it
run ./scripts/gate.sh
  fail → fix the implementation
         3 consecutive failures on the same item → mark BLOCKED, record the
         failure text, move on
  pass → a FRESH read-only verifier subagent re-reads the spec scenarios
         against the diff (not against the implementer's summary)
         MET     → tick, commit, append to loop-log.md, open a PR, stop
         NOT MET → back to implement, with the verdict as input
```

**Phase B — the spec is the obstacle.** The loop **stops** and writes
`openspec/changes/<id>/` as a spec-change request: conformance status, why the spec limits progress,
the proposed amendment *not applied*, and open questions. A human approves it. Then Phase A runs
again against the new spec. The agent never edits a spec — that is the one rule that stops it
legalising whatever the code already does.

**Phase C — new capability.** Never originates in a loop. For M5 the answer is simply: there are
none. Point 5 of the complaints is that we stop adding things.

**Staging.** Start at L1 (report-only: the loop writes what it *would* change, you read three and
tune `PROMPT.md`). Move to L2 (one PR per iteration, reviewed and physically tested) once three
consecutive reports would have been correct to apply. **Do not reach L3** (unattended) in three
weeks — and never for the frozen paths.

**Budget.** Cap iterations and `--max-turns`; log tokens and wall-clock per iteration in
`loop-log.md`. The one published data point for an unbudgeted loop is ~8 million tokens in 48 hours.

---

## 7. The gate

`npm run ci` is not a gate. A gate is `npm run ci` plus the assertions that make green *mean*
something.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. the existing pipeline, unchanged
npm run ci

# 2. anti-skip: the suite must have RUN, not just passed
node scripts/assert-baseline.mjs --key testCount --direction up-or-equal

# 3. the polish ratchet — these may only improve
node scripts/assert-baseline.mjs --key hexLiterals        --direction down-or-equal
node scripts/assert-baseline.mjs --key untokenisedSheets  --direction down-or-equal
node scripts/assert-baseline.mjs --key breakpointVariants --direction down-or-equal
node scripts/assert-baseline.mjs --key bundleKb           --direction down-or-equal

# 4. structural invariants (Section 2's three facts, as checks)
node scripts/assert-shell.mjs      # neither tab defines its own switch/top/body rules
node scripts/assert-vocabulary.mjs # no `vocal-frame__*`/`guitar-tab__view*` outside src/ui
node scripts/assert-tokens.mjs     # no hex literal outside styles/tokens.css

# 5. anti-gaming: the frozen paths must be untouched
git diff --exit-code -- app/src/tabs/guitar/song/follow/
git diff --exit-code -- app/src/audio/

# 6. accuracy floors, when the item touches transcription or scoring
node scripts/assert-baseline.mjs --key benchF1 --direction up-or-equal
```

Three things to notice. **(a)** The ratchet is the stop condition: the loop's job is to drive four
numbers to their floor, and "done" is when they reach it. **(b)** Freezing the judge paths with
`git diff --exit-code` is the cheapest defence against a loop loosening a tolerance to go green — if
an item legitimately needs that change, it is not a loop item. **(c)** Test the gate on a trivial
change before trusting it; a false-failing gate is worse than no gate.

---

## 8. The work

Three workstreams. **W-B is the one that decides whether we would use the app for three hours; if
time runs out, it is the one that ships.**

### W-A · One presentation layer — fixes points 1, 2 and 8

| ID | Task | Tag | Done when |
|---|---|---|---|
| A1 | Create `app/src/ui/` and move the nine shared components out of `tabs/vocal/components/` into it, updating imports. No behaviour change | GATE | `assert-shell` passes; no `tabs/guitar/**` file imports from `tabs/vocal/**` for a component; all 76 test files still pass |
| A2 | Replace all 586 hex uses with tokens from `styles/tokens.css`, one stylesheet per iteration, dark value for every token | GATE | `hexLiterals` → 0 outside `tokens.css`; `untokenisedSheets` → 0; every screen legible in dark mode |
| A3 | Extract one `InstrumentShell` component (top bar + section switch + body + account chip) and use it in both tabs; delete the duplicated rules from `GuitarTab.css` and `VocalTab.css` | GATE | `assert-shell` passes; the two shells share one stylesheet |
| A4 | Settle on **one vocabulary**: "sections" everywhere, in code, CSS and the design doc. Rename `guitar-tab__view*` and `vocal-frame__*` | GATE | `assert-vocabulary` passes |
| A5 | Collapse five breakpoints to three (480 / 768 / 1024) from `tokens.css` | GATE | `breakpointVariants` = 3 |
| A6 | Split `VocalTab.jsx` (928 lines) and `GuitarSong.jsx` (849 lines) along the seams the sections already imply. Mechanical extraction only | GATE | No file over ~400 lines; tests unchanged |
| A7 | One focus ring, one hover, one transition, one disabled state, defined once | GATE | Tokens only; `axe` clean on rendered components |

*Note on a11y:* the app is better here than expected — 15 distinct `aria-*` attributes, 11 roles,
26 `focus-visible` rules already in place. A7 is consistency work, not a rescue.

### W-B · The practice loop — fixes point 3 and the three-hour bar

| ID | Task | Tag | Done when |
|---|---|---|---|
| B1 | **Vocal seek** from the score and from the summary (F24). Clicking a marked note moves the cursor there without altering the saved attempt | GATE | The three scenarios in the research report's §2.5 worked example pass as tests |
| B2 | **Loop an arbitrary range,** both instruments: pick two points, loop between them, with the count-in. Replaces guitar's "first bar with a miss" with "the bars you chose" | GATE | Unit tests on the range state machine; parity between tabs |
| B3 | **Progressive speed trainer.** A pass loops at *n*%, and on a clean pass steps up by 5% to a target. Built entirely on the existing per-song tempo scaling | SPEC → GATE | Needs one spec-change request first (it is new behaviour, so it goes through Phase B); then testable |
| B4 | Tempo, mode, part and section remembered **per account**, not per device | HUMAN + GATE | Survives a device change while signed in |

B3 is the only item in this plan that adds behaviour. It is listed because it is the cheapest
possible answer to "would you use this for three hours," it is one competitor's headline feature, and
it is ~nothing on top of the tempo scaling that already exists. **It still goes through Phase B
escalation rather than being slipped in** — that is the protocol working as intended.

### W-C · Continuity and finish — fixes points 1 and 2 where a viewer looks

| ID | Task | Tag | Done when |
|---|---|---|---|
| C1 | Resume exactly where you left off: tab, section, song, mode, part, tempo | GATE | Reload returns to the same place |
| C2 | A real empty state for every list (no files, no catalog results, no sessions, no friends, no runs) with the action that fills it | GATE | No screen renders an empty box; snapshot tests |
| C3 | One loading treatment, one error treatment, one "couldn't reach the server" treatment | GATE | No bare `Loading…` strings; `assert-vocabulary` extended |
| C4 | A visible version string and a changelog | GATE | Rendered from `package.json` |
| C5 | Fix the private-note leak (master doc §6, N5): move owner note and rating to an owner-only table | **HUMAN** | Migration written and reviewed **by a person** — migrations are denied to the loop |

---

## 9. Presentation — fixes point 7

Not an afterthought; it is a graded artifact.

**One rehearsed path, scripted and timed.** It is the same path as master doc §8.4 item 5:

> sign in → import a file of your own → it gets tab → run Wait for me → keep the run → send it to a
> friend → open it as the friend and hear the recording with the cursor following → practise the bar
> you missed on a loop at 70% and step up to 100%.

That path touches every claim worth making and ends on the thing W-B just built. Rules: **on the
tablet, not a laptop**; files staged and signed in beforehand; no live arranger run (five and a half
minutes on CPU — show a prepared result); and one rehearsal each in week 2, week 3, and the day
before. If a step is not rehearsed, it is cut from the demo.

---

## 10. Three weeks

| Week | Focus | Exit condition |
|---|---|---|
| **1** | Phase 0 in full (P0-1 to P0-6). Then W-A1 → A5 at L1, moving to L2 once three reports would have been right | Specs reconciled and archived · `CLAUDE.md` · `tokens.css` · `gate.sh` green with baselines committed · the app is one palette and one shell |
| **2** | **W-B1, B2, B4**, plus B3's spec-change request through Phase B. W-A6, A7 in parallel at L2. First demo rehearsal | You can seek, loop a range you chose, and come back to where you were. The ratchet is at or near zero |
| **3** | W-C in full. C5 by hand. Second and third rehearsals. Regenerate the design document *from* the reconciled specs (research report Phase 4) and fold Section 3's hurdle answer into master doc §6 | A full pass through the demo path on the tablet, twice, with nothing staged mid-run |

**If a week slips, cut in this order:** W-C4, A6, C3, A7 — then stop cutting. W-B is not available
to cut; it is the answer to the professor's third question, and the third question is the one that
decides whether any of this was worth doing.

---

## 11. Explicitly out of scope

Stated so an agent cannot propose them and so we cannot drift into them:

- Any feature not already in the master design document. Streaks, badges, transpose, PDF export, a
  catalog deal, score following, teacher tools, group sessions — all out, and the Won'ts in master
  doc §8.5 still hold.
- Audio-judge thresholds, the noise gate, and anything tuned by ear (Section 4, frozen paths).
- Migrations and RLS by the loop (C5 is a human task).
- Rewriting the design documents by a loop. An agent may *draft* the M5 update interactively, read
  line by line by a person.
- Users. There will be none, and that was never the bar (master doc §8.4).

---

## 12. What to hand the agent

Not this file. This is for us. Per the research report §2.1, the agent's context is:

1. `CLAUDE.md` (always loaded, ~100 lines)
2. `PROMPT.md` (invariant, same bytes every iteration)
3. **one** `openspec/specs/<capability>/spec.md`
4. **one** item from `fix_plan.md`
5. `scripts/gate.sh` to run, and `loop-log.md` to append to

The master design document is a *source* for specs, never a prompt — at 1,039 lines it is mostly
history and rationale an agent cannot act on, and it describes features we cut, which would actively
mislead it.
