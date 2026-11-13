# loop-log.md — one entry per iteration

Appended by the loop, never rewritten. One line of header per entry, then what it needs to
say: what moved, what the gate reported with its real numbers, and anything a human has to
decide. `fix_plan.md` holds the status; this holds the history.

---

## 2026-11-13 · S1 · rewrite `openspec/config.yaml`'s context block

**Files touched:** `openspec/config.yaml` (+154 / -91, context block only; the `rules:` block
produced no diff lines), `fix_plan.md` (S1 → DONE), `loop-log.md` (new).

**Gate:** `bash scripts/gate.sh` — **GREEN, exit 0**, full run (not `--fast`).

```
1. lint · typecheck · backend tests · app lint · app tests · build
     app tests   69 passed | 3 skipped (72 files) · 627 passed | 7 skipped (634 tests)
     build       2.76 s · 10 precache entries, 3493.63 KiB
                 (one chunk over 500 kB: index-*.js 3,431.96 kB / 898.67 kB gzip)
2. ratchet   hexLiterals 148 · untokenisedSheets 5 · breakpointVariants 4
             appTestFiles 72 · largestInScopeComponent 850   (all PASS, none moved)
3. frozen files      clean (14 entries)
4. never-touch       clean
5. scope             clean
6. placeholders      clean
```

No test was added: this item changes no application code and the gate's step 1 does not read
`openspec/config.yaml`. The ratchet is unchanged by design — S1 touches no stylesheet.

**What changed.** The `context:` block was M1-era and is injected into every artifact an agent
generates. Rewritten from the master design document (§1.1, §4.1, §5, §7.1, §7.2) per
[spec-reconciliation.md](docs/spec-reconciliation.md) §3, correcting its twelve listed errors:

| Was | Now |
|---|---|
| "short guided lessons on an unlocking (Duolingo-style) map" | a learning path per instrument, chosen by the player; no map, no prerequisite graph |
| "Design spine: teach the theory first, THEN the technique" | dropped; Exercises are their own section |
| "a 3-song practice playlist" | 3 guitar + 7 vocal built-ins, the catalog, the user's own files |
| "Single-player only" | asynchronous social: send a run to friends, who hear it and comment |
| "NO custom Node/Express server in V1" | no custom **API** server; `worker/arranger/` is the one process outside the browser, and why |
| "native Web Audio AnalyserNode FFT" for chords | score-informed judge with a JS FFT; lessons use chroma templates |
| "a cleanliness/'fuzziness' proxy" | binary per string (rang clean, or buzzed or wrong), and why a score would be a guess |
| "miss counting + soft auto-skip" | the soft gate that **never advances on its own**; NO auto-skip |
| "strumming/timing score" | timing only (early / on time / late), in Strum on the beat |
| "'couldn't hear you' state" | guitar only; on vocal, quiet moments are left unscored |
| "target <=100 ms mic-to-score" | target deliberately traded for correctness; 0.2 s strum, 0.3 s ring |
| F38 and F26 listed as OUT of V1 | both built — listed as "do not re-propose" instead |

**A thirteenth error, not in the report:** the locked stack named **Tonal.js** as the theory
helper. It is not a dependency and never was — chord naming and intervals are written by hand
(`practice/chordNames.js`). Replaced with "no theory library", plus "do not introduce it, or any
other new dependency, inside a change."

**Two deliberate removals from the OUT list,** because they are no longer true: "full-song
playthroughs" (Songs *is* full-song practice) and "advanced guitar technique
(slides/bends/hammer-ons/pull-offs)" — slides and hammer-ons/pull-offs *are* judged, from the
pitch change; bends, dead notes and harmonics are drawn but deliberately not scored
(`songTimeline.UNSCORED_TECHNIQUES`). The new text says exactly that.

**Three things added that the report did not ask for,** because every artifact an agent writes
should inherit them:

- the six inviolable principles from CLAUDE.md / master §7.2, verbatim and marked inviolable;
- "Specs that exist today: …" naming the nine spec files, with "do not assume any other spec
  file exists: check the directory" — `openspec/README.md` still advertises `specs/tuner` and
  `specs/ear-training`, neither of which exists;
- "NO NEW FEATURES … `openspec/specs/**` is READ-ONLY to agents. When a spec is the obstacle,
  write a change request under `openspec/changes/` and stop."

**Not committed.** Three harness prerequisites are still open (see below), one of which is
"commit the harness before the first iteration, so the agent's first diff is reviewable on its
own." Committing S1 now would bundle it with the uncommitted harness. The working tree holds the
change for review.

**For the human, before the next item:**

1. `PROMPT.md` encoding is still corrupted (mojibake at lines 1, 15, 26 + a stray BOM). The
   repair command is in handoff §7. An agent is denied Write/Edit on `PROMPT.md` on purpose —
   it is the loop's own prompt — so this one is yours.
2. `CLAUDE.md` now contradicts the gate. CLAUDE.md freezes
   `app/src/tabs/guitar/song/follow/` as a **folder** ("Scope" and "Never touch"), while
   `scripts/frozen-files.txt` and gate step 3 freeze **14 files** and deliberately leave the mode
   screens, `playerControls.js` and `GuitarFollow.css` writable. The file list is the one the
   backlog depends on: **G8 (loop an arbitrary range) is impossible under the folder freeze.**
   CLAUDE.md is the binding constitution, so it should be the thing that moves.
3. `scripts/baselines.json`'s `scope` string still reads "Excludes song/follow/ (frozen judge
   thresholds)". `SCOPE_EXCLUDE` is now empty, which is why `hexLiterals` is 148 and not 116 —
   `GuitarFollow.css` (32 hex literals, no dark mode) is measured and in scope. The numbers are
   right; the sentence describing them is stale.

**Next item:** S2 — the Case 1 spec edits that touch guitar. The soft-gate one is the urgent one:
`openspec/specs/scoring-engine/spec.md` currently *requires* auto-advance after N=3 attempts and
three-miss auto-skip, which CLAUDE.md invariant 4 forbids. That is a human edit to `specs/`
(denied to the loop by both CLAUDE.md and `.claude/settings.json`), so S2 cannot run as a loop
iteration — an agent can only draft it for a human to apply.

**Cost:** ~47k tokens, ~20 min wall clock, of which the gate was ~3 min.

---

## 2026-11-13 · harness errors fixed, and S2 drafted (not applied)

**Files touched:** `CLAUDE.md`, `fix_plan.md`, `scripts/baselines.json`,
`openspec/changes/spec-reconcile-guitar-2026-11-13/**` (7 new files), `loop-log.md`.

**Gate:** `bash scripts/gate.sh` — **GREEN, exit 0**, full run. Ratchet unmoved: hexLiterals 148 ·
untokenisedSheets 5 · breakpointVariants 4 · appTestFiles 72 · largestInScopeComponent 850.

### The three errors from the S1 entry

1. **CLAUDE.md** — Scope and the frozen-files paragraph had already been corrected to the file
   list; the leftover was the "Never touch" bullet, which still froze
   `app/src/tabs/guitar/song/follow/` as a folder. Replaced with a pointer to
   `scripts/frozen-files.txt` and an explicit "the rest of `song/follow/` is writable". This is
   what unblocks G8.
2. **`fix_plan.md`** — two places. The scope paragraph listed `song/follow/` as out of bounds and
   credited the freeze to gate step 5 (it is step 3; step 5 is scope). The "Not loop work, ever"
   bullet did the same. Both now name the 14-entry file list and say the rest is writable.
3. **`scripts/baselines.json`** — the `scope` string still read "Excludes song/follow/". Corrected,
   and it now records *why* `hexLiterals` is 148: `GuitarFollow.css` contributes 32 and is not
   frozen. No metric value changed.

**`PROMPT.md` is still outstanding and is still yours.** Confirmed corruption: a UTF-8 BOM
(`ef bb bf`) plus double-encoded `â€”` at lines 1 and 15 and `Â·` at line 26. The handoff §7 command
is correct for exactly this damage. Write/Edit on this file is denied to agents on purpose — it is
the loop's own prompt — and that guardrail should not be worked around with a shell command.

### S2 — drafted, NOT APPLIED

`openspec/changes/spec-reconcile-guitar-2026-11-13/` holds `proposal.md`, `tasks.md` and deltas for
`scoring-engine`, `ui`, `notation-rendering`, `progress-tracking`, `song-storage`. S2 cannot run as
a loop iteration: it edits `openspec/specs/**`, denied by CLAUDE.md and `.claude/settings.json`. An
agent can only draft it.

Form: `## MODIFIED Requirements` where only the text is wrong; `## REMOVED` + `## ADDED` where the
requirement's **name** is the error (a MODIFIED block is keyed by its header, so it cannot express a
rename). All 12 removed/modified headers were cross-checked byte-for-byte against `specs/` — all 12
match. All 36 scenarios use exactly four hashes, which `openspec/config.yaml` warns is the
difference between a scenario and silence.

**Three things the draft found that `docs/spec-reconciliation.md` §4 does not list:**

- **Four of the five `## Purpose` paragraphs are wrong,** and a Purpose is not a requirement, so no
  delta block can reach it. `notation-rendering` calls alphaTab the source of truth for expected
  notes (true of guitar only) and credits generation to Tonal.js; `progress-tracking` "drives the
  unlocking lesson map … including knowledge-only nodes" (three deleted concepts in one clause);
  `song-storage` says "V1 seeds 3 songs". They are listed in the proposal as hand edits. `ui`'s is
  correct.
- **`progress-tracking` F22 displays the last score "on the lesson map",** which this change
  deletes. Edited for coherence, beyond S2's enumeration, and its new text states what the code
  actually keys history on: song, mode, part, version, full runs only.
- **A word-grep cannot be the acceptance check,** and my first draft of `tasks.md` got this wrong.
  The corrected text deliberately *names* each cut behaviour in order to forbid it
  (`SHALL NOT produce a numeric cleanliness or "fuzziness" value`, `there is no lesson map`), so
  "the word is gone" fails on correct text. Meanwhile `prerequisite` appears innocently in
  `specs/deployment` and `specs/pwa-infra` ("prerequisite for N4"), which this change never touches,
  so that grep could never have come back empty. Task 7 now checks for the *mandate*, lists the
  greps that must still match, and carries measured before/after requirement counts
  (scoring-engine 10 → 9, notation-rendering 9 → 8, the rest unchanged).

**Two §4 rows deliberately left out,** both outside S2's enumeration and both flagged in the
proposal: `audio-pipeline` N1 (the sub-100 ms target — `config.yaml` has already been corrected on
this, so context and spec now disagree) and `scoring-engine` F21 (as written it is true of guitar,
which keeps the message; it is wrong only about vocal).

**Next:** a human applies the deltas, then S3 (`specs/ear-training/spec.md`). S3 to S6 are writable
by an agent — they create new files under `openspec/specs/`, which `.claude/settings.json` denies, so
they are drafted the same way, under `openspec/changes/`, and a human moves them into place. S6, the
presentation contract, is the one that makes G1 to G12 verifiable.

**Cost:** ~45k tokens, ~25 min wall clock, two full gate runs.

---

## 2026-11-13 · S2 · the Case 1 spec edits that touch guitar — APPLIED by a human

**Files touched by the human:** `openspec/specs/{scoring-engine,ui,notation-rendering,progress-tracking,song-storage}/spec.md`
(+190 / -111). **By the agent:** `fix_plan.md` (S2 → DONE), `loop-log.md`. The agent staged the
finished files outside the repo and did not write to `openspec/specs/**`, which remains denied to it.

**Verified after applying:**

```
requirements   scoring-engine 10 -> 9 · notation-rendering 9 -> 8 · ui 8 · progress-tracking 4 · song-storage 5
gone           "advance anyway" · "early/on/late" · "three hardcoded" · "at least the 3 V1" · tonal · auto-skip   (0 hits each)
present        "SHALL NEVER advance it on its own"                                                                 (scoring-engine)
scenarios      72, all at exactly four hashes
```

Invariant 4 and `specs/scoring-engine` now agree for the first time: the spec no longer requires the
microphone to advance a lesson on its own.

**Three coherence edits beyond `docs/spec-reconciliation.md` §4's list,** each caused by one of its
renames and each of which would have left the contract self-contradictory:

- `ui` F34 pointed at *"cleanliness data (F17)"*, which after the rename is a requirement that
  forbids a cleanliness score. Now reads from per-string verdicts, with the four real states.
- `progress-tracking` F22 displayed the last score *"on the lesson map"*, deleted by the same change.
  Its new text also states what the code actually keys history on: song, mode, part, version, and
  full runs only.
- Four of the five `## Purpose` paragraphs repeated a cut behaviour. A Purpose is not a requirement,
  so no delta block can reach one; all four were rewritten by hand. `ui`'s was already correct.

**Still open from §4, deliberately:** `audio-pipeline` N1 (the sub-100 ms target; `openspec/config.yaml`
is already corrected, so context and spec disagree until a human rules) and `scoring-engine` F21
(true of guitar, wrong only about vocal). Both are outside S2's enumeration and both are recorded in
the change's non-goals.

**The gate cannot be green until the spec edits are committed.** Step 4 runs
`git diff --quiet -- openspec/specs`, and `scripts/gate-allowlist.txt` only filters *untracked*
files, not tracked edits. So a human's legitimate spec change looks exactly like an agent's to the
gate — which is the intended behaviour, and it means Phase 0's spec work has to land as a commit
before any loop iteration runs. Commit, then re-run.

**Next:** S3 (`specs/ear-training/spec.md`), S4 (`guitar-learn`), S5 (`guitar-songs`), S6
(`presentation`). Same shape as S2: drafted outside the repo, applied by a human. S6 is the one that
makes G1 to G12 verifiable — until it exists, the ratchet is the only thing standing in for a
definition of "polished".

## 2026-11-13 · G1 · REPORT ONLY

Files touched this iteration: `loop-log.md` only. Read `CLAUDE.md`, then `PROMPT.md`; assessed G1 against `openspec/specs/presentation/spec.md` only. User's report-only constraint overrides implementation, test additions, backlog edits, branch/commit/PR and proposal creation. G1 remains TODO; no other item was worked.

**Findings:**

- NOT MET: `app/src/styles/tokens.css` (and its directory) does not exist. There is no central light/dark token set satisfying G1.
- NOT MET: `app/src/tabs/guitar/GuitarTab.css` contains 6 hex occurrences: border `#e2dfd8` once, muted `#6c6a72` twice, surface `#ffffff` once, accent `#128789` twice. It has neither token references nor dark-mode handling. Tokenising those declarations alone would reduce hexLiterals from 148 to 142 and untokenisedSheets from 5 to 4, assuming no concurrent changes.
- Existing reusable palette: `app/src/auth/authTheme.css` already defines light/dark `--hm-*` accent, surface, border, text, muted text and danger tokens. Its danger light value is `#b53a27`, whereas G1 explicitly seeds `#cf4b36`; avoid silently changing existing auth consumers. Existing practice verdict green is `#6a9f4e` (strong `#4f7d38`), red `#c8553d`. A future implementation should seed semantic verdict tokens from existing usage, supply dark counterparts for every introduced colour token, load the token sheet from GuitarTab.css, and replace only that sheet's colours. Preserve current layout and breakpoints for this item. No palette or contrast validation was performed.
- GATE OBSTACLE (static inspection, not an observed gate failure): step 5 of `scripts/gate.sh` excludes only app tests and Guitar paths from its out-of-scope diff. It does not permit `app/src/styles/tokens.css`, although CLAUDE.md expressly permits that path and G1 requires it. Once tracked/staged, the required new file would be rejected. PROMPT.md says to report a wrong gate and stop; a human must reconcile this before implementation can pass the full gate. No gate or allowlist changes made.
- The checkout already contained unrelated tracked/untracked work when this iteration started. None was altered. The presentation spec exists as untracked human work; it was read without modification.

**Validation:** `node scripts/assert-baseline.mjs --all` exited 0: hexLiterals 148; untokenisedSheets 5; breakpointVariants 4; appTestFiles 72; largestInScopeComponent 850. These are current measurements, not the stale 116/4 values in fix_plan.md's introductory baseline. Full `bash scripts/gate.sh` NOT RUN: this report-only iteration avoids its build outputs and generated files. No test/build pass or full gate green is claimed; no consecutive gate failures occurred. HEAD inspected: `e69a1f1`.

**Tokens and wall-clock:** exact token usage is not exposed; approximately 3 minutes wall-clock. Stopped after this G1 report, with no implementation, status change, commit or PR.
## 2026-11-13 · G1 · stopped under PROMPT.md's gate-obstacle rule

Selected G1, the highest-priority TODO, after re-reading CLAUDE.md, PROMPT.md, fix_plan.md and the presentation spec. The prior report-only constraint applied to the previous iteration; this stop is independently required by PROMPT.md: "If the gate is wrong, say so in loop-log.md and stop; a human will decide."

Reconfirmed the gate defect: G1 and CLAUDE.md explicitly require/permit app/src/styles/tokens.css, but scripts/gate.sh step 5's git diff against HEAD only excludes app/tests and the listed Guitar paths. A staged tokens.css would be reported out of scope. scripts/gate-allowlist.txt does not list it. No gate weakening, allowlist edit, spec edit or workaround applied. A human must reconcile the gate with the authorized token path before this item can complete.

Read-only ratchet run: node scripts/assert-baseline.mjs --all, exit 0; hexLiterals 148, untokenisedSheets 5, breakpointVariants 4, appTestFiles 72, largestInScopeComponent 850. Full bash scripts/gate.sh not run because the explicit gate-obstacle stop rule was reached before implementation. No full gate result claimed, no implementation/test changes, no commit or PR, no spec-change request (the obstacle is the gate, not the spec). G1 remains TODO; the three-failure BLOCKED rule was not triggered. Only loop-log.md edited; all pre-existing work preserved. Exact token usage unavailable; wall-clock approximately 1 minute. No other item taken.