# Guitar Loop — Handoff

**Date:** November 13, 2026. **Purpose:** everything a fresh session needs to run the iterative
polish loop on the Guitar tab. Self-contained; no prior conversation required.

## How to start the new chat

Open Claude Code in the repo and paste this:

```
Read docs/loop-handoff-guitar.md, then CLAUDE.md, then fix_plan.md.
We are running the guitar polish loop. Start with Phase 0 item S1.
```

Everything below is the context behind that.

---

## 1. The goal

Harmonic's Guitar tab works but looks unfinished — the professor's words were "unpolished and very
prototypie… looks no different from M2." The fix is not features. It is to drive the implementation
of **Guitar Songs, Learn and Exercises** to a standard any of us would use for three hours, using an
AI loop that **fixes implementation and never edits the spec**.

Two rules define the whole exercise:

1. **The loop changes code, never specs.** When a spec is the obstacle, the loop writes a
   spec-change request under `openspec/changes/` and stops. A human decides.
2. **"Polished" must be machine-checkable** or a loop has no stop condition. That is what
   `scripts/baselines.json` is: five numbers that may only move one way.

Background reading, in order of usefulness: [spec-reconciliation.md](spec-reconciliation.md) (why
the loop can't start yet), [M5-polish-plan.md](M5-polish-plan.md) (the three-week plan),
[ai-iteration-research.md](ai-iteration-research.md) (why the loop is shaped this way).

---

## 2. Scope — the three umbrellas, and everything under them

Gate step 5 enforces this. Writable: `app/src/tabs/guitar/{GuitarTab.*,song/,learn/,exercises/,practice/,notation/}`,
`app/src/styles/tokens.css`, `app/tests/`, `fix_plan.md`, `loop-log.md`.

### SONGS — `song/` + `notation/`

| Feature | Files |
|---|---|
| Song list, search, built-ins, catalog, uploads | `song/GuitarSong.jsx` (850 lines — the big one) |
| Tab + staff rendering (alphaTab) | `song/GuitarScore.jsx`, `GuitarScore.css` |
| Three practice modes: Listen · Wait for me · Trouble spots | `song/follow/modes.js`, `GuitarWaitMode.jsx`, `GuitarTroubleMode.jsx` |
| Per-note marks on the tab | `song/follow/useTabOverlay.js` |
| **Loop bar N**, seek, transport commands | `song/follow/playerControls.js`, `useAlphaTabPlayer.js` |
| Full / Easy version | `song/follow/EasyToggle.jsx` |
| Metronome, tempo, count-in | `song/follow/SongTransportExtras.jsx` |
| Latency calibration | `song/follow/LatencyCalibration.jsx` |
| Run history, last-and-best | `song/follow/runHistory.js`, `songTimeline.js` |
| Sharing a run with its recording + cursor | `song/follow/GuitarSharedPanel.jsx`, `recordingTiming.js` |
| Generated tab (Viterbi fretting) for MIDI/MusicXML | `notation/fretAssign.js`, `loadGuitarNotation.js`, `tidyMidi.js`, `tabReport.js`, `song/TabNotice.jsx` |
| Export MIDI / Guitar Pro | `notation/exportGuitarNotation.js` |
| Audio → tab, on the device | `song/TranscribePanel.jsx` + `song/transcribe/` (13 files: `pipeline.js`, `separate.js`, `chords.js`, `strums.js`, `beats.js`, `guitarPresence.js`, `onnx.js`, `voicings.js`, `ghostNotes.js`, `bleed.js`, `scoreXml.js`, `beatWarp.js`, `audio.js`) |
| Audio → tab on the worker (**in flight, uncommitted**) | `song/ServerTranscribePanel.jsx`, `supabase/migrations/0016_guitar_tab_jobs.sql`, `worker/arranger/tab-once.js` |
| My Transcriptions (drafts on the device) | `song/MyTranscriptions.jsx`, `song/drafts.js` |

### LEARN — `learn/` + `practice/`

`practice/` **is** Learn's implementation: `learn/LearnTab.jsx` imports `PracticeScreen`,
`chords.js` and `StrumDrill` from it.

| Feature | Files |
|---|---|
| Learn shell, the two activity cards | `learn/LearnTab.jsx`, `Learn.css` |
| Progress: local + account merge | `learn/learnProgress.js`, `useLearnProgressSync.js`, `progressEvents.js` |
| 20 chord lessons in teaching order | `practice/chords.js`, `chordNames.js`, `unlocks.js` |
| The chord lesson screen | `practice/PracticeScreen.jsx`, `PracticeScreen.css` |
| Guided mode | `practice/practiceState.js` |
| Practice mode (the soft gate: 3 clean strums, then **Unlock anyway**) | `practice/practiceState.js`, `practiceRunState.js`, `PracticeRun.jsx` |
| Play mode (chords every 5 s, score at the end) | `practice/playState.js`, `PlayRun.jsx`, `PlayRun.css` |
| Changes mode (one minute, two chords, counted) | `practice/changesState.js`, `changesCounter.js`, `ChangesRun.jsx`, `ChangesRun.css` |
| Chord diagram, barres, finger-order pulse, Frets/Notes/Fingers toggle | `practice/ChordDiagram.jsx`, `ChordDiagram.css`, `ChordTab.jsx` |
| Per-string lights (rang clean / buzzed or wrong) | `practice/StringStates.jsx`, `StringStates.css`, `lessonVerdicts.js` |
| Finger-transition diagram | `practice/ChordTransition.jsx`, `chordTransition.js` |
| Hint (plucked-string sound) | `practice/useChordPlayer.js`, `chordSound.js` |
| "Couldn't hear you" banner | `practice/CheckBanner.jsx`, `CheckBanner.css` |
| Strum on the beat — 5 steps | `exercises/StrumDrill.jsx`, `strumTiming.js`, `strumProgress.js`, `StrumLane.jsx` |

### EXERCISES — `exercises/`

| Feature | Files |
|---|---|
| Exercises shell | `exercises/Exercises.jsx`, `Exercises.css` (445 lines — largest sheet in scope) |
| Ear training: chord type · which chord · chords from my song | `exercises/EarTraining.jsx`, `earTraining.js` |
| Strum drill (shared with Learn) | `exercises/StrumDrill.jsx`, `StrumDrill.css`, `StrumLane.jsx`, `strumTiming.js` |

**Note:** `exercises/` imports `songClock.js`, `useGuitarListener.js` and `waitListening.js` from
`song/follow/` — all frozen. Reading them is expected; an Exercises item that needs one *changed* is
misclassified.

### Out of bounds

vocal, home, social, `fretboard/`, `tuner/`, `src/lib/`, `worker/`. Guitar currently imports three
components from `tabs/vocal/components/` (`PlaybackControls`, `ShareAttempt`, `AccompanimentToggle`
and others) — leave them there; moving them to `app/src/ui/` is deferred because it would touch
vocal files.

---

## 3. Frozen files — in scope but never writable

`scripts/frozen-files.txt`, 14 entries. These carry behaviour tuned by ear against real playing; a
loop cannot tell whether a change improved them and no test will catch a regression.

```
song/follow/  noteJudge.js  waitListening.js  listenWindows.js  troubleTracker.js
              waitState.js  easyMode.js  songClock.js  useGuitarListener.js
              matchTranscription.js  refineWithBasicPitch.js
practice/     chordDetect.js  useLessonListening.js
exercises/    strumHearing.js
app/src/audio/   (whole directory)
```

It is a **file** list, not a folder freeze. `song/follow/` also holds the mode screens,
`playerControls.js` (seek/loop commands) and `GuitarFollow.css`, which polish work needs. Changing a
mode screen is allowed; changing a threshold inside it is not.

---

## 4. The harness — what exists and what is verified

| File | What | Verified |
|---|---|---|
| `CLAUDE.md` | constitution: commands, layout, 7 invariants, scope, frozen + never-touch | — |
| `PROMPT.md` | the invariant loop prompt | ⚠ see §7 |
| `fix_plan.md` | the backlog, guitar-scoped | — |
| `scripts/gate.sh` | 6-step gate | ✅ syntax clean; steps 2–5 exercised |
| `scripts/assert-baseline.mjs` | the ratchet, scope-aware | ✅ runs, caught 3 bugs in itself |
| `scripts/baselines.json` | the five numbers | ✅ recorded 2026-11-13 |
| `scripts/frozen-files.txt` | 14 frozen paths | ✅ all exist; catch + allow both tested |
| `scripts/gate-allowlist.txt` | pre-existing human WIP the gate must not blame on the loop | ✅ tested |
| `docs/loop-settings.example.json` | harness deny rules | ⚠ see §7 |

### The gate — `bash scripts/gate.sh`

```
1. npm run ci                lint · typecheck · backend tests · app lint · app tests · build
2. the ratchet               five metrics, each may only move one way
3. frozen files              git diff must be clean on all 14
4. never-touch paths         migrations, workflows, specs, design docs (+ new untracked files)
5. scope                     no diff outside Guitar Songs/Learn/Exercises
6. no placeholders           no TODO/FIXME added in the diff
```

`npm run ci` **passed** on `main` in a full run on Nov 12. Build: 2.83 s, 3,493 KiB precached, with
at least one chunk over 500 kB — worth a performance-budget metric later.

### The ratchet — baselines at 2026-11-13

| Metric | Now | Target |
|---|---|---|
| `hexLiterals` | **148** | 0 — every colour via `app/src/styles/tokens.css` |
| `untokenisedSheets` | **5** | 0 — of 17 in-scope sheets |
| `breakpointVariants` | **4** | 3, defined once |
| `largestInScopeComponent` | **850** | ~400 (`GuitarSong.jsx`) |
| `appTestFiles` | **72** | may only grow — whole-app, so a guitar fix can't break a vocal test |

Re-record an improvement with `node scripts/assert-baseline.mjs --write`; that tightens the ratchet
so the next iteration can't regress it.

---

## 5. The blocker — do Phase 0 first

**The specs currently contradict the shipped app, so a loop pointed at them would re-add five
deliberately-cut features.** Most urgent: `openspec/specs/scoring-engine/spec.md` requires the soft
gate to *"advance anyway after N=3 attempts"* — the exact behaviour CLAUDE.md invariant 4 forbids. It
also still mandates three-miss auto-skip, chord-cleanliness scoring, strum-pattern scoring and
per-note early/late ratings.

Also: `openspec/config.yaml`'s `context:` block is injected into every artifact an agent generates
and is wrong in twelve places. `openspec/specs/ear-training/` is promised by the README and does not
exist — and Exercises is in scope. 13 changes sit open in `openspec/changes/` with an empty archive.

Full detail and the per-requirement sort: [spec-reconciliation.md](spec-reconciliation.md).

**Guitar is the more finished tab,** so the conformance backlog (spec right, code wrong) was almost
all on the vocal side. For guitar the loop is a **polish engine, not a conformance engine**: its stop
condition is the ratchet hitting its floor plus the scenarios in the specs Phase 0 writes.

### Phase 0 (human, interactive — S1–S6 in `fix_plan.md`)

1. **S1** rewrite `config.yaml`'s context block
2. **S2** apply the Case 1 spec edits touching guitar (the soft gate first)
3. **S3** write `specs/ear-training/spec.md`
4. **S4** write `specs/guitar-learn/spec.md` — Learn as shipped
5. **S5** write `specs/guitar-songs/spec.md` — Songs as shipped
6. **S6** write `specs/presentation/spec.md` — the polish contract, in checkable sentences

S6 matters most: nothing in the backlog is verifiable without it. Suggested requirements:

> WHEN any in-scope stylesheet sets a colour THE SYSTEM SHALL resolve it through a token in
> `app/src/styles/tokens.css`.
> WHEN the device is in dark mode THE SYSTEM SHALL render every in-scope screen from the dark tokens.
> THE SYSTEM SHALL use only the breakpoints defined in `tokens.css`.
> THE SYSTEM SHALL present one shell across Guitar's sections: same switch, same top bar, same
> account control, same positions.

---

## 6. The loop

### Protocol

**Phase A — conformance.** One item per iteration, fresh context:

```
item ← highest-priority TODO in fix_plan.md (ONE)
read ONLY the spec that item names
implement the smallest change satisfying its named scenarios
add a test in app/tests/ that fails before and passes after
bash scripts/gate.sh
  red  → fix implementation; 3 consecutive failures → BLOCKED, log, stop
  green→ fresh read-only verifier subagent checks scenarios vs the diff
         MET → tick, commit on loop/<item-id>, open PR, STOP (never merge)
```

**Phase B — the spec is the obstacle.** Stop. Write
`openspec/changes/spec-change-<capability>-<date>/proposal.md` with conformance status, why the spec
limits progress, the proposed amendment *not applied*, and open questions. A human approves.

**Phase C — new capability.** Never from a loop. For M5 there are none; the instruction is to stop
adding features.

### Staging

Start **report-only**: the loop writes what it would change, you read three, tune `PROMPT.md`. Then
**PR-only**, one item per iteration, reviewed and physically tested before merge. **Do not reach
unattended** in three weeks, and never for the frozen files.

### Running it

```powershell
bash scripts/gate.sh                       # must be green before starting
```

First iteration, by hand, in a fresh session:

```
Read CLAUDE.md, then PROMPT.md, and follow PROMPT.md exactly.
Work item G1 from fix_plan.md, and only G1.
This iteration is REPORT ONLY: edit nothing but loop-log.md. Then stop.
```

Then, for the repetitive tokenising work:

```
/loop Follow PROMPT.md. Take the single highest-priority TODO item from
fix_plan.md, implement it, run `bash scripts/gate.sh`, open a PR, and stop.
Never edit openspec/specs/** — write a spec-change request and stop instead.
```

Per iteration, you: read the diff (not the summary) · confirm the ratchet moved ·
`--write` to re-record · physically test anything touching practice · merge.

### The backlog (G1–G12, full text in `fix_plan.md`)

G1–G4 tokenise the 17 in-scope stylesheets, one per iteration · G5 dark mode for the 5 unthemed ·
G6 breakpoints 4 → 3 · G7 split `GuitarSong.jsx` · **G8 loop an arbitrary range** (replaces "Loop
bar N", which only loops the first bar with a miss) · **G9 resume where you left off** · G10 empty
states · G11 one loading/error treatment · G12 focus/hover/disabled consistency.

**G8 and G9 decide the three-hour question. G1–G7 are what stop it looking like M2.** If time runs
short: G8, G9, G1, G5.

---

## 7. Open items and traps

**Two things still pending:**

1. **`PROMPT.md` encoding is corrupted** at lines 1, 15 and 26 — em-dashes and middots are mojibake,
   plus a stray BOM, from a PowerShell `Get-Content | Set-Content` round-trip. Repair:
   ```powershell
   $t = [IO.File]::ReadAllText('PROMPT.md', [Text.Encoding]::UTF8)
   $fixed = [Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding(1252).GetBytes($t))
   [IO.File]::WriteAllText('PROMPT.md', $fixed, (New-Object Text.UTF8Encoding $false))
   ```
2. **Copy the deny rules into place:** `cp docs/loop-settings.example.json .claude/settings.json`.
   An agent cannot write this file (self-modification), so a human must. Without it the deny list is
   prose, not enforcement.

**Traps already hit — don't repeat them:**

- **Never round-trip a file through `Get-Content | Set-Content`** in Windows PowerShell 5.1. It
  silently corrupts every non-ASCII character. Use `[IO.File]::ReadAllText`/`WriteAllText` with an
  explicit encoding, or edit in VS Code. This repo's docs are full of em-dashes.
- **Run the gate as `bash scripts/gate.sh`.** `./scripts/gate.sh` fails in PowerShell; `chmod`
  doesn't exist on Windows and isn't needed.
- **Never wrap the gate in a command chain that can swallow its exit code.** Running it as
  `gate.sh > log; echo $?; tail log` reported success while the gate had exited 1 — verifier theater
  in miniature. In CI, give it its own step.
- **Pre-existing dirty files break the gate** unless listed in `scripts/gate-allowlist.txt`. It
  currently covers the in-flight server-transcribe work (`src/lib/arrangements.ts`,
  `worker/arranger/*`, `tests/backend/arrangements.test.ts`) and three untracked files
  (`supabase/migrations/0016_guitar_tab_jobs.sql`, two design docs). Remove a line once committed.
- **Commit the harness before the first iteration** (`scripts/`, `CLAUDE.md`, `PROMPT.md`,
  `fix_plan.md`), so the agent's first diff is reviewable on its own.
- **A blanket folder freeze blocked the best item.** `song/follow/` holds both thresholds and
  presentation; freezing the folder made G8 impossible. Hence the file-level list. If you widen the
  freeze again, re-check the backlog against it.

**Deferred by the guitar-only scope:** vocal seek (F24) and click-to-seek (F7) — the biggest
usability gaps in the whole product; vocal noise gating (N6); moving the nine shared components to
`app/src/ui/`; one shared `InstrumentShell`; tempo per account (F37); the private-note leak (N5,
needs a migration — human only); the progressive speed trainer (new behaviour, needs Phase B first).

Guitar is being made the **reference implementation**: build the shape you'd want both tabs to have,
and bring vocal up to it after M5.
