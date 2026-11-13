# Using AI to Build, Feed and Iterate a Design Document
### A research report for polishing Harmonic into a real-world product

**Written for:** James (Harmonic's developer), as something to read and decide from — not a spec, and not something to hand to an agent as-is.

**Date:** November 11, 2026. **Status:** research only. Nothing in Harmonic's code, specs or design documents was changed to write this.

**Scope:** (1) what a design document actually is, (2) how to feed one to an LLM, (3) what "AI iteration" / auto-mode loops are and how they really work, (4) how real products like Harmonic are built and what features they ship, (5) a concrete, honest plan for applying all of this to Harmonic.

---

## 0. The short version

Six findings, in the order they matter.

1. **You don't have one document, you have two kinds of document, and conflating them is the whole problem.** A *design document* in the Google sense is a record of **decisions and trade-offs**, written for humans, expected to go stale. An *executable spec* is a set of **testable statements of required behaviour**, written for machines and kept current. Harmonic's `M4-design-document.md` is the first kind and is good at being the first kind. An agent loop needs the second kind. You already have the second kind too: `openspec/specs/*/spec.md`. The work is wiring them together, not rewriting either.

2. **Feeding a design doc to an LLM is not "paste the doc."** Context is a finite resource with diminishing returns, and recall degrades as the window fills ("context rot"). What works: a small always-loaded rules file, specs split one capability per file with stable IDs, and just-in-time retrieval of everything else. Your 457-line, 48 KB M4 document is a *source* for specs, not a prompt.

3. **The loop you're describing exists, has a name, and has a research literature as of three months ago.** Practitioners call it the *Ralph loop* (Geoffrey Huntley, July 2025: `while :; do cat PROMPT.md | claude-code ; done`); the academic framing is *loop engineering* (Lulla et al., arXiv 2608.21884, August–October 2026). Its one hard requirement is a **machine-checkable stop condition** — Anthropic's own phrasing is "give Claude something it can run that comes back pass or fail."

4. **The evidence for big gains is weak; the failure modes are documented.** The 2026 survey paper looked at 36,487 repositories, confirmed 217 running autonomous loops, and found that **essentially none committed a verifier, a stop condition, a budget or a cost record.** It says plainly that the claimed benefits rest on self-reports and anecdotes. Named failure modes include "verifier theater" (a checker that approves without checking), infinite fix loops, review fatigue turning the human gate into a rubber stamp, one case of roughly 8 million tokens in 48 hours, and "comprehension debt." One practitioner line is worth taping to your monitor: a loop **satisfies the gate you wrote, not the goal behind it**.

5. **Your protocol — "fix the implementation, never the spec, until the spec is met; then and only then change the spec" — is the right instinct, and it needs one addition: the agent must never edit a spec, it must *request* a spec change and stop.** That turns "now it needs new specs" from a judgement call inside a loop into an explicit escalation to you. OpenSpec's change-delta model already gives you the file shape for exactly this.

6. **Harmonic's hardest features are precisely the ones a loop cannot verify, and that is the main constraint on this whole idea.** CI never plays audio into a browser — your own test plan says so. Pitch judging, strum timing, guitar thresholds, iOS Safari: a loop can't tell whether those got better. What a loop *can* do well in Harmonic: pure state machines, notation/MusicXML conversion, the Supabase layer and RLS, UI component behaviour, and the three opt-in benchmarks, which are already the seed of a real eval harness. Split the backlog by verifiability and the plan writes itself.

---

## Part 1 — What a design document actually is

### 1.1 Five artifacts people all call "the design doc"

Confusion here causes most of the pain, so here is the taxonomy, with where Harmonic already sits.

| Artifact | Question it answers | Audience | Lifespan | Harmonic's version |
|---|---|---|---|---|
| **Requirements / PRD** | What must be true for users, and how important is each thing? | Product + eng | Versioned per release | `F1–F39`, `N1–N6` with MoSCoW, in the separate `specifications` repo |
| **Design document** | How will we build it, what did we consider, what did we trade away? | Engineers, reviewers, graders | Goes stale after ship; amended | `harmonic-design-document/M4-design-document.md` |
| **Executable spec** | What behaviour is required, in checkable statements? | Engineers **and agents** | Kept current forever | `openspec/specs/<capability>/spec.md` |
| **ADR** (decision record) | Why did we choose X over Y, on what date? | Future you | Immutable once accepted | Scattered inside §5 and §7 of the M4 doc |
| **Test plan** | How do we know it works? | Engineers, testers | Current | `M4-test-plan.md` |

### 1.2 The canonical anatomy (Google's version)

The reference text is Malte Ubl's *Design Docs at Google* (July 2020). Its rule #1 is "Write them in whatever form makes the most sense for the particular project," but it then gives a structure that has "established itself as really useful":

- **Context and scope** — objective background only. "This isn't a requirements doc. Keep it succinct!"
- **Goals and non-goals** — short bullets. Non-goals are things that *could* reasonably be goals but were deliberately excluded (his example: ACID compliance for a database), not negations like "it shouldn't crash."
- **The actual design** — overview first, then detail. The key line: the design doc is "*the place to write down the trade-offs* you made in designing your software." Optional subsections: system-context diagram; APIs (sketch them, don't paste interface definitions, which "quickly get out of date"); data storage (rough form, not schema dumps); code or pseudo-code only for novel algorithms; and *degree of constraint* — how much freedom the solution space actually has.
- **Alternatives considered** — he calls this one of the most important sections. Rejected options can be brief.
- **Cross-cutting concerns** — security, privacy, observability. Google requires a separate privacy design doc that the main one references.

Practical numbers from the same source: **10–20 pages for a larger project**; a **1–3 page "mini design doc"** for an incremental improvement; and a warning sign — "A clear indicator that a doc might not be necessary are design docs that are really *implementation manuals*." If there are no trade-offs and no alternatives, skip the doc and write the program. His checklist test: answer yes to three or more of "is the design uncertain / contentious / cross-cutting / does it need senior review / is the legacy system undocumented," and a doc is probably worth it.

### 1.3 The lifecycle — and why design docs are *supposed* to rot

Ubl's four phases: **creation and rapid iteration → review (possibly several rounds) → implementation and iteration → maintenance and learning.** Two points from that section matter enormously for the AI-loop question:

- During implementation, plans meet reality, and "it is strongly recommended to update the design doc in this case… If the designed system hasn't shipped yet, then definitely update the doc."
- After that: "In practice we humans are bad at updating documents," so change lands in *new* documents, making the record "more akin to the US constitution with a bunch of amendments." Design docs "tend to get out of sync with reality over time," but "they still often present the most accessible entry point" to a system's design thinking.

**So a design document is a historical, narrative, trade-off-bearing artifact that is allowed to drift.** That is a feature, not a bug — and it is exactly why you should not point an autonomous loop at one and say "make the code match this."

### 1.4 Honest assessment of Harmonic's current documents

What's strong — don't let an agent "improve" these:

- **§7 Trade-offs is textbook.** "What we cut" with a *why* per row, and "What we refused to cut" (on-device judging, the soft gate, right over fast, a run never goes out silent). That's the section most student projects lack, and the one Ubl calls most important. It also encodes **product principles**, which, as Part 2 explains, is what an agent's constitution file should be built from.
- **§6 Known Gaps and Next Steps is a ready-made backlog**, and it's honest: iPhone Safari untested, vocal noise rejection is only a threshold, the arranger confuses relative major and minor, audio-to-tab has no accuracy measure on real songs.
- **Traceability exists end to end.** F-IDs appear in the requirements, in the implementation-status doc, in OpenSpec specs ("Requirement: … (F11)") and in tasks ("Verified by: …"). This is rarer than you'd think and it is the single most valuable asset you have for agent work.
- **A real definition of done** in test plan §5: CI passes, the owner physically tested it with an instrument or voice, new logic has new tests.

What's weak, specifically with respect to feeding this to an AI:

1. **No goals/non-goals section, and no explicit non-goals list.** §7 implies them, but an agent can't read implications. "Live group sessions are a non-goal in v1" needs to be a line, or a loop will eventually propose building one.
2. **Prose carries normative force that machines can't test.** "Guitar verdicts take a few hundred milliseconds" — is 400 ms conformant? Is 900? Nothing says. Same for "about fifty times a second," "a clarity threshold and a level floor," "about 0.5–1 MB a minute."
3. **The documents are milestone-shaped, not system-shaped.** M2 → M3 → M3-guitar → M4, plus two "changes since" docs. Perfect for grading; bad for an agent, which has no way to know the M3 doc is dead except one sentence at the top of the M4 one.
4. **No ADRs with dates and status.** The rationale in §5 and §7 is excellent but not addressable: you can't write "per ADR-007, judging is on-device" in a spec and have anything to point at.
5. **No `CLAUDE.md` in the repo at all.** I checked: `.claude/` holds only the six OpenSpec skills and the `opsx` commands. Everything an agent needs about conventions — oxlint, vitest, the `@backend/*` alias, "tests live in `app/tests/*.test.js`, not beside sources," the shared AudioWorklet capture, migrations are numbered and already deployed — is currently in your head or buried in a 464-line `architecture.md`.
6. **OpenSpec's canonical specs lag the code, and in places contradict it.** `specs/scoring-engine/spec.md` still mandates things §7 says you deliberately cut: a three-miss auto-skip ("the system SHALL … after three SHALL auto-skip"), chord-cleanliness scoring, strum-direction and pattern scoring, the "couldn't hear you" state on vocal. There is no `specs/ear-training/` or `specs/tuner/` in the canonical tree at all — those exist only as unarchived change deltas — and **thirteen changes sit open in `openspec/changes/` with nothing at all in `changes/archive/`**, including `guitar-run-history`, `guitar-shared-playback` and `practice-sessions`, all of which shipped weeks ago. **This is the single biggest blocker to any loop:** today, an agent reading `specs/` would faithfully re-implement features you intentionally removed.

### 1.5 What a design document for a *real-world product* adds

Harmonic's M4 doc is written for a course rubric. The same document for a shipping product would add five sections it currently lacks, and these are the ones that turn "a working app" into "a product":

- **Non-goals and scope boundaries**, as above.
- **Service-level objectives with numbers**: verdict latency budget, false-accept and false-reject rates for the judge, time-to-first-render, cold-start size, crash-free session rate. Right now Harmonic's quality bar lives in prose and in your ears.
- **Observability**: what is logged, what is measured, how you'd know the pitch judge regressed in production. Harmonic has *no* telemetry story, which is defensible given on-device privacy, but it has to be a stated decision with a chosen alternative (for example, opt-in anonymous accuracy counters).
- **Privacy and data handling as its own section** (Google would require a separate doc). You have unusually good material here: nothing but small rows and optional compressed recordings leaves the device; songs are never uploaded for copyright reasons; audio is capped at 100 MB per user by a trigger.
- **Rollout, support and lifecycle**: migrations are already auto-applied to production on merge to `main`, which is a real operational risk worth a paragraph, plus how a user deletes their data, how you'd revert a bad deploy, and what happens to shared links when a user leaves.

---

## Part 2 — How to feed a design document to an LLM

### 2.1 The constraint everything else follows from

Anthropic's *Effective context engineering for AI agents* (September 2025) states the operating principle: "Context, therefore, must be treated as a finite resource with diminishing marginal returns." Two mechanisms matter here:

- **Context rot**: "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases." It is a gradient, not a cliff, and it holds across models.
- **The goal is not completeness**: "find the smallest set of high-signal tokens that maximize the likelihood of your desired outcome."

The four techniques it recommends map directly onto what a spec system has to look like:

| Technique | What it means | Harmonic implication |
|---|---|---|
| **Just-in-time retrieval** | Keep lightweight identifiers (paths, IDs) in context; load content with tools at runtime | Specs must be *addressable by ID*, one capability per file, so the agent loads `specs/scoring-engine/spec.md` and nothing else |
| **Compaction** | Summarize near the limit and restart from the summary | A long loop iteration should end, not compact; see Part 3 |
| **Structured note-taking** | The agent writes durable notes outside the context window | `fix_plan.md` / progress log — the loop's memory between iterations |
| **Sub-agent isolation** | Subagents work in clean windows and return 1,000–2,000-token summaries | "Did the test suite pass, and which tests failed?" should come back as a summary, not 4,000 lines of vitest output |

Practically: **never paste `M4-design-document.md` into a prompt.** At 48 KB it's roughly 12–15k tokens of narrative prose, most of it history ("At M3 … at M4 …"), figures and rationale the agent cannot act on, and it includes dropped-feature descriptions that will actively mislead an agent. Use it as the *source* from which specs are written, and as something a human-facing agent reads a *section* of on request.

### 2.2 What makes a spec machine-usable

Four properties, drawn from the three mainstream spec-driven toolkits:

**1. Testable sentence patterns.** AWS's Kiro writes acceptance criteria in **EARS** (Easy Approach to Requirements Syntax) — a small set of fixed sentence shapes, the common one being `WHEN <trigger> THE SYSTEM SHALL <response>`, with `WHILE <state> THE SYSTEM SHALL <action>` for state-driven behaviour. The point is purely discipline: a sentence in that shape can be mechanically turned into a test case. One reviewer's caveat is worth keeping — EARS is requirements-syntax discipline, *not* a behavioural test you can run.

Harmonic's OpenSpec specs are already in a near-identical form, which is a genuine head start:

```
### Requirement: Instrument-agnostic hit/late/missed scoring (F11)
The system SHALL score each expected note as hit, late, or missed …

#### Scenario: Correct note after the window scores late
- **WHEN** an event with the expected note arrives after the on-time window but within the late window
- **THEN** the note is scored as late
```

What's missing from that example is the number. "The on-time window" is undefined, so no test can be derived without reading the code — which inverts the whole point. **Every threshold in a spec must be a named constant with a value**, or a reference to one place in code where it lives.

**2. WHAT, not HOW.** GitHub's Spec Kit splits this across files: `spec.md` is instructed to focus "on WHAT users need and WHY" and to avoid "HOW to implement (no tech stack, APIs, code structure)," with the technical plan living in `plan.md`, which "should remain high-level and readable," and detailed algorithms pushed into an `implementation-details/` file. The reason is practical: a spec that names React components goes stale on the next refactor, and a stale spec is worse than none because an agent trusts it.

**3. Explicit ambiguity markers.** Spec Kit mandates `[NEEDS CLARIFICATION: specific question]` markers in both spec and plan templates, with the instruction "Don't guess: If the prompt doesn't specify something, mark it," and a checklist item "No [NEEDS CLARIFICATION] markers remain." This is the mechanism that stops an agent inventing requirements, and it's the one you most need: an agent reading "vocal noise rejection is only a clarity threshold and a level floor (N6)" should be forced to write `[NEEDS CLARIFICATION: what false-accept rate on keyboard-click noise counts as conformant?]` rather than picking a number and defending it for three iterations.

**4. A constitution / rules layer above the specs.** Spec Kit calls `memory/constitution.md` "the architectural DNA of the system," holding nine articles, where some are deliberately left for each project to define, and amendments require "explicit documentation of the rationale for change." Claude Code's equivalent is `CLAUDE.md`, and its docs are blunt about scope: **keep it short**, and the test for a line is "could it find this by reading the code?" If yes, leave it out.

For Harmonic the constitution writes itself from §7.2 of your design doc — those four "refused to cut" items are inviolable principles, and an agent that doesn't know them will eventually "improve" performance by sending audio to a server or "fix" the soft gate by making a lesson advance automatically.

### 2.3 The three-layer context stack

This is the shape I'd recommend, and it's close to what Harmonic already has:

```
Layer 1  CLAUDE.md + .claude/rules/        ~100 lines, always loaded
         invariants, conventions, commands, "never do this"
            |
Layer 2  openspec/specs/<capability>/spec.md    loaded on demand, by capability
         current required behaviour, EARS-style, F-ID traceable, numbers included
            |
Layer 3  openspec/changes/<id>/{proposal,design,tasks}.md + specs deltas
         the work in flight: one change, one branch, one loop run
            |
Reference (read a section of, never loaded whole)
         harmonic-design-document/M4-*.md, docs/architecture.md, specifications repo
```

The crucial property is **direction of truth**: Layer 2 is what the code must satisfy; Layer 3 is the only place where proposed *change* to Layer 2 is written; the design document is downstream narrative, regenerated or amended at milestones from layers 1–3 plus your own judgement.

Spec Kit states the ideology in its strongest form — "Specifications don't serve code—code serves specifications," and "the key is treating specifications as the source of truth, with code as the generated output." I'd treat that as aspiration rather than description; the same document admits "Today, practicing SDD requires assembling existing tools and maintaining discipline throughout the process." For a brownfield app with 601 passing tests and a deployed user base, the honest version is: **specs are the source of truth for *intended behaviour*; the code and its tests are the source of truth for *actual behaviour*; the loop's job is closing the gap and reporting where the gap means the spec is wrong.**

### 2.4 The tool landscape, and what Harmonic should use

| Tool | Shape | Artifacts | Brownfield fit |
|---|---|---|---|
| **GitHub Spec Kit** | CLI layer, agent-neutral (reported 30+ agents) | `constitution.md`, `spec.md`, `plan.md`, `tasks.md`, plus `research.md`, `data-model.md`, `contracts/`, `quickstart.md` | Weak natively; per-feature artifacts don't roll up into system-level specs. Community add-ons exist |
| **AWS Kiro** | Agentic IDE, three-phase with human approval gates | `requirements.md` (EARS) → `design.md` → `tasks.md` in `.kiro/specs/` | Editor-bound, credit-priced |
| **OpenSpec** | Change-delta model on top of canonical specs | `specs/<capability>/spec.md` + `changes/<id>/` with ADDED/MODIFIED/REMOVED deltas | **Designed for it.** Deltas record what a change adds, modifies or removes, which stops an agent inventing requirements for existing behaviour; deltas merge into the main specs on ship |
| **BMAD-METHOD / Tessl / Cursor plan mode** | Role-based agents / spec-as-contract / IDE plan step | varies | Mixed |

**Recommendation: stay on OpenSpec.** It's installed, your specs are already in its format, the delta model is exactly right for a 601-test brownfield app, and it has the one workflow step the others lack — `sync`, which folds deltas into canonical specs without archiving. Switching toolkits now would cost you a week and buy nothing. What you're missing is not a tool; it's (a) the `CLAUDE.md` layer, (b) reconciled canonical specs, and (c) a gate script.

### 2.5 Worked example: turning design-doc prose into a loop-feedable spec

Take one line from §6 of your M4 doc:

> **Vocal summaries can't be clicked** to jump to a spot (F24). Guitar has Loop bar.

That is a perfect design-doc sentence and a useless agent instruction. Here's the same thing in each layer.

**Layer 3 — `openspec/changes/add-vocal-summary-seek/specs/notation-rendering/spec.md`:**

```markdown
## ADDED Requirements

### Requirement: Seek from a vocal run summary (F24)
After a recorded vocal attempt, the system SHALL let the singer jump playback
to any scored note by selecting that note's marker in the attempt summary,
using the same transport clock as playback.

#### Scenario: Selecting a missed note seeks to it
- **WHEN** the singer selects a note marked missed in the summary
- **THEN** the cursor and the transport are positioned at that note's score time
- **AND** playback begins from that position if it was playing

#### Scenario: Seeking does not alter the saved attempt
- **WHEN** the singer seeks within a finished attempt
- **THEN** the stored verdicts, score and recording are unchanged

#### Scenario: Seek respects the per-song tempo setting
- **WHEN** the song's tempo slider is below 100% and the singer seeks to a note
- **THEN** the cursor lands on that note and playback continues at the set tempo

[NEEDS CLARIFICATION: should seeking in a *shared* attempt also seek the
player's recording, as the guitar shared-run cursor does (#46)?]
```

**`tasks.md` — each task names its own gate, in your existing style:**

```markdown
- [ ] 1.1 Extract the summary→score-time mapping from the attempt's verdicts.
      Verified by: unit test in app/tests/ — a verdict list yields the right
      score time per note, including tied and chord notes.
- [ ] 1.2 Wire note selection to the shared transport seek used by Loop bar.
      Verified by: component test — selecting a marker moves the cursor.
- [ ] 1.3 Guard the saved attempt against mutation on seek.
      Verified by: unit test — verdicts and score are byte-identical after seek.
```

**Layer 1 — the `CLAUDE.md` lines that keep this honest:** "There is exactly one transport clock; never introduce a second timeline." "Scoring is instrument-agnostic; it must not branch on instrument." Both are already architectural invariants in your specs and architecture doc — they just aren't anywhere an agent reads by default.

Notice what happened: one sentence of prose became three testable scenarios, one explicit open question for you, and three tasks each with a machine-checkable gate. **That conversion is the actual work of "feeding a design document to an LLM,"** and it is also the step people skip, which is why their loops flail.

### 2.6 Can the AI do that conversion for you?

Partly, and with a specific division of labour that the brownfield literature agrees on:

- **Good use of an agent:** draft the spec from the code *and* the design doc, flag every contradiction between them, and mark every unspecified threshold. On Harmonic this would be genuinely valuable right now: point it at `specs/scoring-engine/spec.md`, `M4-design-document.md` §7 and `app/tests/practiceScoring.test.js`, and ask for a reconciliation report with no edits.
- **Bad use of an agent:** let the generated specs become the new baseline unreviewed. The strongest objection in the literature is that a reverse-engineered spec is a *derived* artifact and shouldn't become the foundation for future development — if the code has a bug, the spec now blesses the bug. The practical mitigation that recurs: **write specs only for the area you're about to change**, not the whole system at once.
- **Non-negotiable:** you review and correct, then it's truth. Kiro's workflow builds this in as human approval gates between requirements, design and tasks, and that's the part worth copying regardless of toolkit.

---

## Part 3 — AI iteration: the auto-mode loop

### 3.1 Definitions, and where your idea sits

The academic definition, from *Loop Engineering: Building Blocks, Adoption, and Impact* (Jai Lal Lulla, Vahram Nersesyan, Seyedmoein Mohsenimofidi, Christoph Treude, Sebastian Baltes; arXiv 2608.21884, submitted August 22, 2026, revised October 22, 2026):

> "Loop engineering is the practice of designing automated control structures that repeatedly invoke coding agents, triggered on a schedule or by events, with each agent loop bounded by a machine-checkable stop condition."

And the standard it sets:

> "A well-engineered loop persists state across agent loops, verifies results independently of the implementation agents, bounds inference costs, restricts what an unattended agent loop may change without approval, and defines when humans should intervene."

The paper distinguishes **harness engineering** (designing one agent turn well) from **loop engineering** (repeated turns). It cites Addy Osmani's four-level classification by how much you hand off: **turn-based → goal-based → time-based → proactive.** What you described — "have it iterate through the design doc until it has met the specs" — is a **goal-based loop with a machine-checkable goal**, which is the level where this technique is most defensible.

### 3.2 The Ralph loop, as actually documented

The original is Geoffrey Huntley's "Ralph Wiggum as a 'software engineer'" (July 14, 2025). The mechanism is deliberately stupid:

```bash
while :; do cat PROMPT.md | claude-code ; done
```

The non-obvious parts, which are where all the value is:

- **Fresh context every iteration.** One process, one task per loop, one repository. He explicitly rejects multi-agent setups as unnecessary at this stage. The reason is context rot: "approximately 170k of context window," and "the more you use the context window, the worse the outcomes you'll get."
- **State lives in files, not in the conversation.** `PROMPT.md` (the invariant instruction), `fix_plan.md` (the backlog — the agent is told to keep it up to date and remove resolved items), `specs/*` (one spec per file), `AGENT.md` (operational learnings, "keep it brief", and explicitly *not* status reports). His principle: "deterministically allocate the stack the same way every loop."
- **Back pressure instead of trust.** "After implementing functionality or resolving problems, run the tests for that unit of code that was improved." Then: "Anything can be wired in as back pressure to reject invalid code generation" — tests, builds, type checkers, static analysers, security scanners. And "the wheel has got to turn fast": a slow gate kills the technique.
- **Subagents for cheap breadth, capped for expensive work.** His published prompt allows hundreds of parallel subagents for search and file writes but **only one** for build/test, to avoid thrashing. Subagents also summarize ("did the suite pass?") to keep the main window lean.
- **Prompt lines that exist purely to counter known model behaviour.** "Before making changes search codebase (don't assume an item is not implemented)" — he calls duplicate implementations "the Achilles' heel of Ralph." And a no-cheating clause: "DO NOT IMPLEMENT PLACEHOLDER OR SIMPLE IMPLEMENTATIONS," because "Claude has the inherent bias to do minimal and placeholder implementations."
- **His own honest framing:** "the technique is deterministically bad in an undeterministic world," you should expect that sometimes "you'll wake up to a broken codebase" (remedy: `git reset --hard` and restart, or write rescue prompts), "each time Ralph does something bad, Ralph gets tuned," and engineers are still needed with "senior expertise guiding" it.

**The caveat that matters most for Harmonic:** Huntley limits the technique to greenfield bootstrapping, and the post carries the line "There's no way in heck would I use Ralph in an existing code base." Harmonic is a deployed brownfield app with 601 passing tests, auto-applied migrations and real testers. **Do not run an unbounded `while :` loop on it.** What transfers is the *architecture* of the loop — file-based state, fresh context, one task per iteration, back pressure — not the unbounded autonomy.

### 3.3 What the evidence actually supports

From the loop-engineering paper, because this is the part nobody blogs about:

- They analysed 36,487 repositories, inspected 256 candidates and confirmed **217 running autonomous loops** (precision 0.87). Nearly all committed their *trigger* configuration. Almost none committed state files.
- Their artifact survey found, out of 36,487 repos: triggering/scheduling detected 253 times; **verification (maker/checker): 0. Goal and stop conditions: 0. Budgets and pause controls: 0. Cost records: 0.** State/memory: 2. Human oversight/escalation: 15.
- On benefits: "These sources provide no systematic evidence of the claimed benefits," and "Claimed benefits are large but are based on self-reports and anecdotes." The controlled experiment in the paper is a *design*, not a result.

Failure modes they catalogue, each of which has an obvious Harmonic analogue:

| Failure mode | What it looks like | Harmonic analogue |
|---|---|---|
| **Verifier theater** | A checker that approves without really checking | A gate that runs `npm test` but the pipe swallows the exit code; or an LLM reviewer that says "looks good" |
| **Infinite fix loops** | The same gate fails forever | Tuning a pitch threshold against a synthetic signal that can't be satisfied |
| **Gaming the gate** | Lindenberg: a loop "satisfies the gate you wrote," not the goal behind it | Agent loosens a tolerance in `noteJudge` until tests pass; score goes up, real guitars get worse |
| **High token cost** | One reported "CI sweeper" at ~8M tokens in 48 hours | Any loop that re-reads `architecture.md` and the M4 doc every iteration |
| **Review fatigue** | Nightly loops open more PRs than anyone can review; the human gate becomes a rubber stamp | A one-person team with a 10-PR backlog |
| **Comprehension debt / "cognitive surrender"** | Nobody understands the code any more; loops used "to avoid thinking rather than to move faster on understood work" | You have to explain this codebase in a demo and a report |
| **Drift between committed instructions and state** | `PROMPT.md` says one thing, the plan file another | Already live: your `specs/` contradict your `§7 Trade-offs` |
| **Silent skips** | A CI run marked successful when the agent step was skipped | Your benchmarks are `describe.skipIf(...)` — they pass by skipping |

That last row is not hypothetical. `app/tests/transcribeBenchmark.test.js` and `realSongBenchmark.test.js` are `describe.skipIf(!process.env.TRANSCRIBE_BENCH)` / `skipIf(!cacheDir)`. In a loop, a skipped benchmark reads as green. **A gate must assert that it actually ran.**

Adoption guidance from the same sources, which I'd follow literally: Osmani's rule, "A team should raise autonomy only as far as it can verify the result at acceptable cost," and Cobus Greyling's readiness levels, which start at **report-only (L1)** and reach unattended operation (L3) only once the verifier is proven reliable.

### 3.4 Anthropic's version: the verifiable target

Claude Code's own best-practices docs (now at `code.claude.com/docs/en/best-practices`) put the same idea in one sentence: **"Give Claude something it can run that comes back pass or fail."** Specifics worth knowing, because they're the mechanisms you'd actually use:

- **Accepted check types:** a test file, a build exit code, a linter, a diff-against-fixture script, a browser screenshot compared to a mockup.
- **Enforcement, loosest to strictest:** a prompt line ("keep going until they pass") → `/goal` → a **`Stop` hook**, where exit code 2 blocks the stop and feeds the failure straight back to Claude → `/code-review` in a fresh subagent.
- **Demand evidence, not claims:** "'All tests pass' on its own tells you very little."
- **Deterministic vs. not:** hooks, deny rules and managed settings are enforced by the harness; `CLAUDE.md` is "Claude's call." If something must never happen — touching `supabase/migrations/`, running `db push`, editing `.github/workflows/` — it belongs in a deny rule, not in a document.
- **Headless for automation:** `claude -p` with `--allowedTools`, `--permission-mode`, `--max-turns`, `--output-format`; verify runs by exit code and JSON result. The docs' own advice on scaling a batch is "Try three files first."
- **Spec-first by conversation:** the docs describe brainstorming until Claude writes a `SPEC.md`, then **starting a fresh session to build from it** — the same fresh-context discipline as Ralph, one rung down in autonomy.
- **Course-correct early:** "Watch the first minute, press Esc the moment Claude drifts, and after two failed corrections run `/clear`."
- **Subagent reviewers:** a read-only reviewer agent with `tools: Read, Grep, Glob` and a cheap model, asked for short summaries.

Claude Code also ships the loop primitives directly, so you don't need a bash `while`: a `/loop` command for recurring runs (there's an interval mode and a self-paced mode), Stop hooks, skills, worktrees (`claude -w`) for isolation, and background tasks. Anthropic's packaging of the Ralph pattern reportedly uses a Stop hook that blocks exit and re-feeds the prompt until a completion-promise string appears, with a max-iterations cap.

### 3.5 Anatomy of the loop I'd actually build for Harmonic

Ten components. Every one of them exists because of a failure mode above.

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │ 1. TRIGGER        you run it; or /loop; never a cron on main        │
 │ 2. CONSTITUTION   CLAUDE.md + deny rules (harness-enforced)         │
 │ 3. PROMPT         PROMPT.md — invariant, same bytes every iteration │
 │ 4. BACKLOG        fix_plan.md — ONE item taken per iteration        │
 │ 5. SPEC           openspec/specs/<capability>/spec.md (read-only!)  │
 │ 6. WORK           implement; search before writing; no placeholders │
 │ 7. GATE           ./scripts/gate.sh → exit 0 or non-zero, with proof│
 │ 8. VERIFIER       fresh read-only subagent: does the code meet the  │
 │                   named scenarios? not "does it look nice"          │
 │ 9. RECORD         append to loop-log.md; commit; update fix_plan.md  │
 │10. STOP/ESCALATE  gate green + backlog empty → STOP and write a     │
 │                   spec-change request. Never edit the spec.         │
 └─────────────────────────────────────────────────────────────────────┘
```

Rules that make it safe on a brownfield app:

- **One item per iteration.** Huntley's hardest-won rule; relax only when the project is boring.
- **Fresh context per iteration.** No compaction mid-loop. State goes in files.
- **The spec is read-only to the loop.** This is the key change from Ralph, where the agent is told to update specs when it finds inconsistencies. On Harmonic that's too much authority: it can quietly legalise whatever the code already does.
- **Write access is scoped.** Allowed: `app/src/**`, `app/tests/**`, `src/lib/**`, `tests/**`, `fix_plan.md`, `loop-log.md`. Denied by hook: `supabase/migrations/**`, `.github/workflows/**`, `openspec/specs/**`, `harmonic-design-document/**`, `package-lock.json`, anything that deploys.
- **Branch and PR only.** The loop never merges. Merging is where your test plan §5 criteria (physical testing with an instrument) get applied, and no gate can check those.
- **Budget and kill switch.** Max iterations, max turns per iteration, a wall-clock cap, and a cost note in the log. The paper found nobody commits these; be the exception, because you're a student paying for tokens.
- **Every iteration logs: item, files touched, gate result with the actual counts, verifier verdict, and tokens/time.** Otherwise you cannot audit an unattended run, and "it worked" is unfalsifiable.

### 3.6 The gate: Harmonic's version

A gate script is not `npm run ci`. It's `npm run ci` plus the assertions that make a green result *mean* something. Sketch:

```bash
#!/usr/bin/env bash
set -euo pipefail           # never let a pipe hide a failure

# 1. the existing pipeline, unchanged
npm run lint && npm run typecheck && npm test
npm --prefix app run lint && npm --prefix app test && npm --prefix app run build

# 2. anti-skip assertion: the suite must have RUN the expected tests
#    (count tests and compare to a committed floor; fail if it dropped)
node scripts/assert-test-count.mjs --floor 601

# 3. anti-gaming assertions on the things a loop is tempted to loosen
git diff --exit-code -- app/src/tabs/guitar/song/follow/   # judge thresholds
git diff --exit-code -- app/src/audio/capture/             # shared capture
# ^ if an item legitimately needs these, it is NOT a loop item

# 4. accuracy gates, when the item touches transcription or scoring
TRANSCRIBE_BENCH=1 npx vitest run app/tests/transcribeBenchmark.test.js
node scripts/assert-benchmark.mjs --min-f1 0.72 --no-skip
```

Three things to notice. **(a)** The anti-skip count assertion is what stops "all tests pass" meaning "all three tests that ran passed." **(b)** Freezing the threshold files by `git diff --exit-code` is the cheapest possible defence against gate-gaming; if the loop needs to change a tolerance, that is a *spec-change request*, not an implementation detail. **(c)** You already own the hard part of (4): `transcribeBenchmark.test.js` renders built-in songs through the real pipeline and scores the draft, `realSongBenchmark.test.js` scores against a reference tab with a `baseline.musicxml` for before/after, and `guitarBandBenchmark` exists too. Turning those three from opt-in diagnostics into **numeric gates with committed floors** is, in my view, the highest-leverage single piece of work in this entire report. It's what converts "the arranger confuses relative major and minor" from a sentence in §6 into something a loop can actually chase.

### 3.7 Your specific protocol, formalised

You described: *the AI fixes the implementation, not the specs, until it believes the features meet the specs; then it needs to change the specs to go further.* Here it is as a state machine, with the ambiguity removed.

**Phase A — Conformance.** Goal: code satisfies the current specs.

```
loop:
  item ← highest-priority UNMET scenario in fix_plan.md
  implement the smallest change that satisfies it
  run gate
    fail → fix implementation; 3 consecutive failures on the same item →
           mark BLOCKED with the failure text, move to next item
    pass → verifier subagent re-reads the spec scenarios vs the diff
           verdict MET   → tick item, commit, log
           verdict NOT   → return to implement, with the verdict as input
  backlog empty and gate green → Phase B
```

Two guards worth stating explicitly, because they're where this goes wrong: **three strikes then BLOCKED** (the paper's "infinite fix loops" mitigation, and the Claude docs' "stop when the agent fails the same gate repeatedly — it isn't converging"), and **the verifier must be a fresh read-only subagent** that was not the implementer and sees the spec scenarios plus the diff, not the implementer's summary of either.

**Phase B — Conformance reached. The loop STOPS.** It does not proceed to change specs. It produces one artifact, a **spec-change request**, and exits:

```markdown
# Spec-change request: scoring-engine, 2026-11-xx
## Conformance status
All 14 scenarios in specs/scoring-engine/spec.md are MET; gate green at
<commit>; benchmark F1 0.74 (floor 0.72); test count 627 (floor 601).

## Why the spec now limits progress
Requirement "Three-miss auto-skip (F29)" contradicts the shipped behaviour
and M4 §7.1, which says auto-skip was deliberately removed after testing.
Code implements the soft gate; the spec mandates auto-skip. One of them is
wrong, and it is not the code.

## Proposed amendment (not applied)
REMOVE Requirement: Three-miss auto-skip (F29)
MODIFY Requirement: Guided mode soft gate — after 3 failed attempts the
system SHALL surface Hint and Skip and SHALL NOT advance on its own.
Rationale: M4 §7.1, PR #—, physical testing with guitarists.

## Open questions for the human
[NEEDS CLARIFICATION: does Trouble spots adopt Wait-for-me's stricter rules?
M4 §6 says it does not yet.]
```

Why this structure beats letting the agent edit specs:

1. **It makes the "now the spec must change" moment visible and dated** — it becomes your amendment record, which is precisely Ubl's "US constitution with amendments" model, and a genuinely good artifact for your M5 documentation.
2. **It defeats the deepest failure mode.** An agent allowed to edit specs when the code won't conform will eventually edit the spec instead of fixing the code, and every gate will be green forever. The paper's framing — a loop satisfies the gate you wrote — applies doubly when the loop can rewrite the gate.
3. **It maps onto tooling you already run.** A spec-change request *is* an OpenSpec change: `/opsx:propose` creates `changes/<id>/` with proposal, design, tasks and deltas; you review; `/opsx:apply` implements; `/opsx:sync` folds deltas into canonical specs; `/opsx:archive` closes it. Phase B produces the proposal; **you** approve it; Phase A runs again against the new specs. That's the full cycle, and the human sits in exactly one place: between "the spec is the problem" and "the spec changed."

**Phase C — Evolution (human-led).** New capability — a feature no spec mentions, e.g. anything from Part 4's gap list — never originates in a loop. You choose it, you (or an agent in an interactive session, reviewed by you) write the proposal and deltas, and then Phase A runs. The loop is a conformance engine, not a product manager. This is the distinction that keeps "polish Harmonic" from becoming "an agent invents features at 3 a.m."

### 3.8 Staged rollout, mapped to Harmonic

Don't start at autonomy. Greyling's L1→L3 ladder, instantiated:

| Stage | What runs | Human role | When to move up |
|---|---|---|---|
| **L0 — Reconcile** | Interactive sessions only. Agent produces a spec-vs-code-vs-design-doc contradiction report; you fix `specs/`, sync and archive the shipped changes, write `CLAUDE.md`, write `scripts/gate.sh` | Everything | When `specs/` matches reality and the gate is trustworthy |
| **L1 — Report only** | Loop runs, implements **nothing**; it reads the backlog and writes a plan + diff proposal per item | Read reports, tune `PROMPT.md` | When three consecutive reports would have been correct to apply |
| **L2 — PR only** | Loop implements one item per iteration on a branch, gate must pass, opens a PR, stops | Review and merge every PR; physical test per §5 | When ~10 PRs merged with no surprises in a category |
| **L3 — Unattended, category-restricted** | Overnight run, capped iterations, only in proven categories (pure logic, notation conversion, tests, docs) | Review the batch in the morning; kill switch | Probably never for audio thresholds, migrations, or RLS |

Test the gate before you trust it: the Claude docs' advice is to try a new gate on a trivial change first, because a false-failing gate is worse than none.

### 3.9 What I would *not* put in the loop, on Harmonic specifically

- **`supabase/migrations/**` and anything touching RLS.** CD applies migrations to the live project on merge to `main`. An agent-authored migration is a production change with no undo. Your `can_view_attempt()` and security-definer functions are a security boundary; §6 already notes one leak (a friend can read the owner's private note and rating with a hand-built query). Fix that by hand.
- **Audio-judge thresholds and the noise gate.** §6 says guitar thresholds "were first tuned on simulated strings and are being tuned on real recordings." A loop optimising against synthetic signals will cheerfully overfit to them and make real guitars worse, and no CI gate will notice. This is the clearest case of goal/gate divergence in your whole codebase.
- **`.github/workflows/**`, deploy config, `vercel.json`, package-lock files.**
- **Anything whose only real test is a human with an instrument** — Wait-for-me feel, count-in timing, iPhone Safari, Firefox upload behaviour.
- **The design documents themselves.** Let an agent *draft* an M5 update interactively, reviewed line by line. Don't let a loop edit the artifact you're graded on and that encodes your reasoning.

### 3.10 Cost, and the boring realism

Loops are token furnaces: the paper's one concrete data point is ~8 million tokens in 48 hours for a CI-sweeper loop, and it notes that committed logs "hold template values, not measurements." Three practical defences: cap iterations and `--max-turns`; keep the per-iteration context tiny (this is why specs are split per capability and why `CLAUDE.md` must be short); and log tokens and wall-clock per iteration so you can price a run before repeating it. Also note the self-interested bias in most of the enthusiastic material: the loudest sources are vendors, affiliate blogs, and people selling courses. The one peer-reviewed-adjacent source in this report is the arXiv paper, and its headline finding is that nobody has shown the benefits systematically.

---

## Part 4 — Real-world products like Harmonic, and how they're built

### 4.1 Four product families

Harmonic is unusual because it straddles all four. That's both its differentiator and the reason it feels unpolished — it's competing with specialists in each column.

| Family | Products | Core loop | Business model |
|---|---|---|---|
| **Interactive tab/notation players** | Songsterr, Soundslice, Ultimate Guitar Pro, Guitar Pro / mySongBook | Read along with synced playback; loop and slow down hard parts | Subscription + licensed catalog |
| **Gamified real-time instruction** | Yousician, Rocksmith+, Simply Guitar, flowkey, Simply Piano | App listens, scores you, moves you along a path | Subscription, trial-funnel, family plans |
| **Vocal trainers** | Vocaberry, Riyaz, SingSharp, Smule, Simply Sing | Sing an exercise or song, see pitch, get a score | Freemium, small song sets free |
| **AI transcription / practice tooling** | Klangio (Guitar2Tabs), Songscription, Moises, Chordify | Upload audio → get tab/chords/stems | Credits or subscription, per-minute limits |

### 4.2 Feature inventory from the vendors' own pages

Read directly from product pages (November 2026). I've marked what the vendor claims versus what's independently verifiable — mostly it isn't, and the "best app" listicles in search results are affiliate content I'd discount entirely.

**Songsterr Plus** (songsterr.com/plus) — "Pause-Free Sync with Original Audio" (synced original audio, backing tracks or playthrough, "without pauses after each 10 bars"); "Playback Speed" (without changing pitch); "Loop" selected measures; "Solo & Mute" per track; "Pitch Shift"; "Print"; **"AI Transcription of Full Tabs" — 50 complete tabs per month**; "Download" as MIDI, Guitar Pro, MP3, WAV; ad-free. Catalog claim: "over 400,000 songs & 1,300,000 tabs by 60,000 artists." No microphone listening, no per-note feedback, no lessons, no practice history.

**Soundslice** (soundslice.com/features) — notes light up, click a note to jump; "Change tempo" without pitch change; **"Loop sections"** by dragging across notes, snapping to notes/rests/barlines; **"Waveform view"** for precise loops; **"Speed training"** that gradually increases playback speed; **"Metronome and count-in"**; practice with real recordings (MP3/video sync), multiple recordings, synth overlay; multitrack stems; "Focus on your part"; transpose (including tab); **"Visual fretboard"**, visual keyboard, violin, trombone, trumpet; lyrics-only view; rhythm counts; pitch names; chord chart view; horizontal notation; clips; **"Notebook"** ("use it to track practice history"); link sharing; a free tier for the notation editor with no limit on pieces. No microphone listening.

**Yousician** (yousician.com/guitar) — **"Real-time feedback"** via the device microphone; **"Points based on accuracy and timing"**; an "expert-designed learning path"; "Custom daily exercises"; "Riff of the Day"; **profile with streak timeline, badges and activity report**; levelling up; built-in tuner; "10,000+ lessons and popular songs"; five instruments (guitar, piano, ukulele, bass, singing); 7-day trial, Premium+ and a family plan with four accounts. Notably *not* advertised on that page: synced tab/notation player, looping, tempo control, metronome.

**flowkey** (flowkey.com, piano) — **"Wait Mode": "Listens to your playing and waits for you to hit the right notes"**; video and sheet music on one screen; "Slow Motion"; **"Loop Function"**; "Select a Hand"; step-by-step courses; "instant feedback" on notes and chords; "over 15 million people." No metronome, practice history or sharing advertised.

**Ultimate Guitar Pro** — page is JavaScript-rendered and couldn't be read; secondary sources describe tempo control and section looping inside the tab viewer with a backing track. Treat as unverified.

**Transcription tools** — Klangio's Guitar2Tabs is described across 2026 reviews as the main *tab-output* option (tabs, MIDI, MusicXML, Guitar Pro; a DAW plugin; free demo capped around 20 seconds), Songscription exports Guitar Pro/MusicXML/MIDI/PDF and has begun signing publisher licensing deals (first public one with Spirit Music Group), while **Moises and Chordify detect chords and separate stems but do not output fret positions or playable tabs.** Prices differ by source; don't quote them.

### 4.3 Harmonic vs. the field

Built from the M4 design document, the implementation-status doc and the code I read. "✓" = shipped, "~" = partial, "—" = absent.

| Feature | Harmonic | Songsterr | Soundslice | Yousician | flowkey |
|---|---|---|---|---|---|
| Synced notation/tab + moving cursor | ✓ (alphaTab guitar, OSMD vocal) | ✓ | ✓ | — | ✓ |
| Tempo / slow-down | ✓ 50–100%, per song, per device | ✓ | ✓ | — | ✓ |
| **Progressive speed trainer** | — | — | ✓ | — | — |
| Loop a section | ~ guitar Loop bar; vocal can't even seek (F24) | ✓ measures | ✓ note- and waveform-precise | — | ✓ |
| Metronome + count-in | ✓ shared across tabs, unpitched click | — | ✓ | — | — |
| **Mic listening + per-note verdict** | ✓ **on-device**, both instruments | — | — | ✓ cloud-era claim unverified | ✓ |
| Wait-for-you mode | ✓ "Wait for me" | — | — | ~ | ✓ "Wait Mode" |
| Practice history / sessions | ✓ sessions, runs, last+best, notes, 1–5 rating | — | ~ notebook | ✓ streaks, badges, activity | — |
| **Streaks / daily exercise / gamified retention** | — | — | — | ✓ | ~ courses |
| Lesson path | ✓ 20 guitar chords unlocking in order; vocal Learn | — | — | ✓ | ✓ |
| Ear training / theory drills | ✓ Exercises, solfège, rhythm, harmony + pitch tests | — | — | ~ | — |
| **Solfège labels (movable do)** | ✓ chromatic, key-inferred for MIDI | — | ~ pitch names | — | — |
| Dynamics feedback | ✓ live meter + swells/fades | — | — | — | — |
| Play along with the original recording | — | ✓ | ✓ | ~ | ✓ video |
| Stems / isolate a part | ~ in the arranger worker | ✓ solo/mute tracks | ✓ multitrack | — | ✓ hands |
| Transpose | — | ✓ pitch shift | ✓ incl. tab | — | — |
| Visual fretboard | ~ fretboard module for chord shapes | — | ✓ | ~ | n/a |
| Audio → notation | ✓ vocal arranger; guitar tab draft (experimental) | ✓ 50 tabs/month | ~ importer | — | — |
| Share a performance | ✓ **share a scored run with your recording, friends comment** | — | ✓ link to notation | — | — |
| Export | ✓ MusicXML, MIDI, Guitar Pro | ✓ + audio | ✓ | — | — |
| PDF / print | — (cut at M2) | ✓ | ✓ | — | — |
| Catalog scale | tiny: built-ins + user files + small Supabase catalog | 400k songs | large user+pro | 10k lessons/songs | "thousands" |
| Offline / installable | ✓ PWA, works with no keys | ~ apps | ~ | ✓ apps | ✓ apps |
| Privacy: audio never leaves device | ✓ **refused to cut** | n/a | n/a | unclear | unclear |
| Accounts, paywall, teacher tools | ~ auth + friends only | ✓ | ✓ teacher tools | ✓ family | ✓ teacher page |

Read that table twice. **Harmonic already has the hardest feature in the field** — live per-note judging of two instruments, on-device — plus three things nobody else in the table has (scored-run sharing with the player's own recording, solfège with movable do, dynamics). What it lacks is almost entirely the *unglamorous* layer: catalog, loop/seek ergonomics, retention mechanics, transpose/print, teacher features, and the commercial shell. That is a much better position to be in than the reverse, and it tells you where "polish" should go.

### 4.4 How the real products implement the hard parts

Useful because it tells you what's achievable and what's research-grade.

**Score following (aligning a live performance to a score).** The classical approach: convert the score to MIDI/MusicXML, synthesize it, and align two feature streams in real time — "the task is then to align two audio streams (or feature sequences extracted from these) to each other, in real time." Most systems use **chroma features** plus **dynamic time warping**. Offline DTW needs the whole sequence, so real-time systems use online variants: Simon Dixon's **MATCH** (2005) online time warping, which is linear-time, and **windowed time warping**, which splits alignment into bounded sub-paths — one evaluation aligned 97.0% of audio note onsets within 2000 ms of the known time. Recent work pairs **real-time transcription with symbol-level tracking** (arXiv 2505.05078) and neural score followers for polyphonic accompaniment (arXiv 2503.06348). No results came back on how SmartMusic or IRCAM's Antescofo implement theirs, so treat those as unknown.

**What that means for Harmonic.** Your design is deliberately *not* score following: you drive everything from one transport clock and judge events against expected notes in a window. That's simpler, lower-latency, and it's why "Wait for me" works at all. But it also explains two of your §6 gaps: scoring is only as good as the window, and a player who rushes or drags isn't tracked, just marked. If you ever want "play freely and the app follows you," that's an online-DTW feature, it's a research-grade addition, and it should be an ADR with a prototype, not a loop item.

**Pitch and onsets.** Monophonic pitch is a solved DSP problem (autocorrelation/YIN family — your `pitchy` dependency is in this lineage); polyphonic transcription is model-based, which is why you're carrying Spotify's **Basic Pitch** via `onnxruntime-web`, **Beat This!** for beat tracking, and **YAMNet** for guitar presence. That stack is genuinely the same class of tooling the AI-transcription startups use; Klangio's differentiator is per-instrument models and a big training corpus, not magic. Your gap isn't the model, it's **evaluation data**: §6 says audio-to-tab has "no accuracy measure on real songs," and the test plan says it plainly — "there are no reference tabs to score it against."

**Wait Mode vs. your "Wait for me."** flowkey's Wait Mode and Harmonic's are the same idea and (almost certainly) the same implementation shape: a state machine that holds the cursor until the expected note is detected. Yours additionally refuses to auto-advance on misses (§7.1), which is a deliberate, defensible difference you should keep and state as a principle.

**The thing they all have that you can't buy with code: licensed catalog.** Print and digital rights for popular music are fragmented — different entities can hold digital distribution, physical print and performance rights; Hal Leonard's ArrangeMe exists to license print rights on behalf of publishers; Musicnotes markets "500,000+ professionally licensed" arrangements; Songscription is signing publisher deals one at a time. Harmonic's architecture already dodges this on purpose — "songs are never uploaded (copyright): a shared attempt names its song by catalog id or file fingerprint, and the viewer opens their own copy of the file." **That is a real product decision and belongs near the top of your design document, not in a parenthesis.** The strategic read: don't chase catalog. Lean into "bring your own file," the public-domain/original catalog, and the arranger that *makes* notation — that's the niche where the licensing math works for a small team.

### 4.5 The non-feature gap between Harmonic and a real product

Features are the part students see. These are the parts that actually separate a demo from a product, and all of them are *loop-friendly* (checkable, low-risk, boring):

1. **Error tracking and crash reporting.** You currently have none. An uncaught exception in the AudioWorklet on someone's Android phone is invisible to you.
2. **Opt-in, privacy-respecting metrics.** You can't improve the judge without knowing the distribution of real inputs; you've committed to not shipping audio. The compromise other on-device apps use: aggregate counters (verdict distributions, model load times, device class) behind explicit consent.
3. **Quality SLOs with numbers**, per §1.5.
4. **Accessibility.** Keyboard navigation, focus order, contrast, screen-reader labels on controls like the tempo slider and mode buttons; a music app that only works by mouse excludes people. Nothing in your docs mentions a11y, and it's exactly the kind of thing automated checks (axe, lint rules) can gate — i.e. ideal loop work.
5. **Performance budgets.** You're shipping ONNX runtime, Basic Pitch, YAMNet, Beat This, a soundfont and a music font. Budget the first-load bytes and the time-to-interactive, and gate them in CI so a loop can't regress them.
6. **Real-device matrix.** §6's iPhone Safari gap is the single biggest credibility risk for a PWA pitched as installable.
7. **Onboarding and empty states.** Yousician's trial funnel exists because the first 90 seconds decide retention. Harmonic opens on a tuner — good — but a new user with no files and no account needs a guided first run.
8. **Retention mechanics.** Streaks, badges and a daily exercise are the only features in Yousician's list with no analogue in yours, and they're cheap to build and easy to spec. Whether you *want* them is a product decision — a counter-argument fits your "refused to cut" style: practice tools for serious musicians can treat streak pressure as hostile.
9. **Account lifecycle and legal:** data export and deletion, a privacy policy that matches the on-device claim, and age considerations if minors use it.
10. **Support surface:** a visible version, a way to report a bad verdict with context, and a changelog.

---

## Part 5 — The plan I'd actually follow for Harmonic

Five phases. Phase 0 is non-negotiable and is most of the value; the loop only becomes safe at Phase 2.

### Phase 0 — Make the repo legible to an agent (a few sessions, interactive, no loop)

1. **Reconcile `openspec/specs/` with reality.** Have an agent produce a *contradiction report* — every requirement in `specs/` versus the shipped behaviour and M4 §7 — then fix the specs yourself. Remove auto-skip (F29), chord-cleanliness scoring (F17), strum direction/pattern (F18), vocal "couldn't hear you" (F21). Add the missing canonical capabilities (`tuner`, `ear-training`, and the vocal Learn/Warm-Up/solfège/dynamics work). Then walk the thirteen open changes: `/opsx:sync` the shipped ones into canonical specs and `/opsx:archive` them, so `changes/` holds only work actually in flight. **Until this is done, every downstream step is built on sand.**
2. **Write `CLAUDE.md`** — about 100 lines: the commands (`npm run ci`, `npm --prefix app test`), conventions (oxlint, vitest, `@backend/*`, tests in `app/tests/*.test.js`), the invariants (one transport clock; scoring never branches on instrument; audio never leaves the device; the soft gate always offers Hint/Skip/Unlock anyway; migrations are numbered, forward-only and auto-deployed), and a deny list. Keep it short — "could it find this by reading the code?" means leave it out.
3. **Write the four §7.2 principles as a constitution section** with the status "inviolable; changing one requires an ADR."
4. **Add a goals/non-goals section to the design document.** Ten lines. It will save you an argument with an agent later.
5. **Write `scripts/gate.sh`** per §3.6, including the test-count floor and the frozen-threshold check. Test it on a trivial change before trusting it.
6. **Turn the three benchmarks into gates with committed floors.** Record today's numbers as the baseline. This is the piece that makes audio work loop-able at all, and it's the one I'd do first if you only did one thing from this report.
7. **Start `fix_plan.md`** from M4 §6 and the test plan §6, one line per item, each with a capability, an F-ID where one exists, and a verifiability tag: `GATE` (a machine can check it), `HUMAN` (needs an instrument or a device), `SPEC` (needs a decision from you first).

### Phase 1 — Report-only loop (L1)

Run the loop with implementation disabled: it picks one `GATE` item per iteration, reads the spec, and writes what it *would* change plus the test it would add. You read three or four of these and tune `PROMPT.md` until the proposals are ones you'd have accepted. Cheap, and it surfaces exactly where your specs are still ambiguous.

### Phase 2 — PR-only loop (L2) on `GATE` items

Branch per item, gate must pass, verifier subagent confirms the named scenarios, PR opened, loop stops. You review and apply test plan §5 (including physically testing anything that touches practice). Good first categories, in order: **(a)** vocal summary seek (F24) — bounded, testable, closes a real §6 gap; **(b)** the private-note leak — `HUMAN` on the migration, but the app-layer part is gate-able; **(c)** a11y and performance-budget work; **(d)** test hardening around sharing and recordings, which the test plan itself names as next; **(e)** notation/conversion edge cases.

### Phase 3 — Spec evolution, human-led (Phase B/C of §3.7)

When conformance is reached, the loop stops and hands you spec-change requests. Separately, *you* pick evolution items from Part 4's gap list. My ranking for "polish toward a real product," by value over effort:

| # | Item | Why | Loop-suitable? |
|---|---|---|---|
| 1 | Vocal seek + loop parity with guitar (F24) | Known gap; the single most-used practice action in every competitor | Yes |
| 2 | Benchmark floors in CI for transcription + arranger accuracy | Turns two §6 gaps into measurable progress; unblocks everything else | Yes |
| 3 | iPhone Safari pass (N2) | Biggest credibility risk for a PWA | No — human |
| 4 | Error tracking + opt-in metrics | You cannot polish what you can't see | Mostly yes |
| 5 | Accessibility + performance budgets | Cheap, gate-able, expected of a real product | Yes |
| 6 | Progressive speed trainer | Soundslice's "Speed training"; trivial on top of your existing tempo scaling; high perceived value | Yes |
| 7 | Private-note table fix (§6 leak) | Security correctness | Partly |
| 8 | Transpose (vocal keys, guitar capo) | Choirs and singers need it; your a cappella testers will ask | Yes |
| 9 | Onboarding first-run flow | Decides retention | Partly |
| 10 | Streaks / daily exercise | The one Yousician mechanic you lack — but decide whether it fits your audience before building | Yes |
| 11 | Score following (online DTW) | Research-grade; would make "play freely" possible | No — prototype + ADR |
| 12 | Catalog / licensing | Don't. Lean on bring-your-own-file and the arranger | No |

### Phase 4 — Regenerate the design document *from* the specs

At M5, the design document should be written (or drafted by an agent and edited by you) *from* reconciled specs, archived changes, ADRs and the spec-change-request log. That inverts today's flow and gives you something no milestone doc usually has: a trade-off section with dates and a visible amendment history. It also means the loop's output feeds your grade instead of competing with it.

### What this looks like in a week

- **Day 1–2:** contradiction report, fix `specs/`, archive shipped changes.
- **Day 2:** `CLAUDE.md`, non-goals, constitution section.
- **Day 3:** `gate.sh`, test-count floor, benchmark baselines committed.
- **Day 4:** `fix_plan.md` with verifiability tags; L1 report-only loop on three items; tune the prompt.
- **Day 5:** L2 on the vocal-seek item end to end — one PR, reviewed, physically tested, merged.
- **Then:** repeat L2 weekly, and only consider L3 overnight runs in categories that have produced ten clean PRs.

---

## Part 6 — Risks, and where this report is weak

**Risks of doing this**

| Risk | Likelihood | Mitigation |
|---|---|---|
| Gate-gaming: thresholds loosened until green | High if thresholds are writable | Freeze threshold files in the gate; thresholds change only via spec-change request |
| Verifier theater | High (it's the default) | Independent read-only verifier, fresh context, scenario-by-scenario verdict; demand evidence, not "all tests pass" |
| Skipped-benchmark green | Certain, today | `--no-skip` assertion and a test-count floor |
| Review fatigue on a one-person team | High | Cap to one PR per run; L2 before L3; never a cron |
| Comprehension debt before a demo | High | One item per PR, every PR read; the log is your study guide |
| Token cost | Medium | Iteration and turn caps; small per-iteration context; log cost |
| Brownfield breakage | Medium | Branch-only, scoped write access, deny rules on migrations/CI/specs |
| The loop drifts from the goal while passing the gate | Structural | Accept it: that's why Phase B escalates to you rather than continuing |

**Where the evidence behind this report is thin, stated plainly**

- The loop-engineering paper's own conclusion is that the claimed benefits of these loops rest on self-reports; its controlled experiment hasn't run. Nobody has shown that an autonomous loop beats a careful developer with an agent in an interactive session.
- Huntley's technique is documented by its author as greenfield-only, and he says he wouldn't use it on an existing codebase. I've adapted it here; that adaptation is my judgement, not a validated method.
- Spec Kit's claims about plans updating automatically from spec changes are, per its own page, aspirational.
- Vendor feature lists in Part 4 are read from marketing pages and describe what's advertised, not what's measured. The "best app" roundups that dominate search results for these products are affiliate content; I've excluded their specifics, including all prices.
- Nothing in the search results confirmed how Yousician, Rocksmith+, SmartMusic or Antescofo actually implement detection or tracking. Where I describe mechanisms, they come from the academic score-following literature, not from those products.
- Licensing is summarized from publisher-facing pages and one law-review-style source. Before any commercial move, that needs a lawyer, not a report.

---

## Appendix A — Templates

### A.1 `PROMPT.md` (the invariant loop prompt)

```markdown
You are iterating on Harmonic, a deployed music-learning PWA. Read CLAUDE.md first.

1. Read fix_plan.md. Choose exactly ONE item tagged GATE. Highest priority first.
   Never choose a HUMAN or SPEC item. Never choose more than one item.
2. Read ONLY the one spec file for that item's capability
   (openspec/specs/<capability>/spec.md). Do not read the design documents.
3. Before writing code, search the codebase for an existing implementation.
   Do not assume a feature is missing. Duplicate implementations are a failure.
4. Implement the smallest change that satisfies the named scenarios.
   Do not implement placeholders, stubs or simplified versions.
   Do not change anything outside the allowed paths in CLAUDE.md.
   Add or extend tests in app/tests/ or tests/ for every scenario you claim.
5. Run ./scripts/gate.sh. If it fails, fix the implementation — never the test
   floor, never a threshold, never the spec. After 3 consecutive failures on the
   same item, mark it BLOCKED in fix_plan.md with the failure output and stop.
6. When the gate passes, append to loop-log.md: item, files changed, gate output
   summary with real counts, and what you did NOT do.
7. Commit on a branch named loop/<item-id>. Do not merge. Do not push to main.
8. If every GATE item is done and the gate is green, write
   spec-change-request-<date>.md using the template in docs/ai-iteration-research.md
   and STOP. Do not edit any file under openspec/specs/.
```

### A.2 Spec file skeleton (OpenSpec + EARS, with numbers)

```markdown
# <Capability>

## Purpose
<one paragraph: what this capability owns, and what it explicitly does not>

## Constants
- ON_TIME_WINDOW_MS = 120        (source: app/src/.../noteJudge.js)
- LATE_WINDOW_MS = 400
- MIN_CLARITY = 0.?              [NEEDS CLARIFICATION: measured value]

## Requirements

### Requirement: <name> (F##)
The system SHALL <observable behaviour, using the constants above>.

#### Scenario: <the ordinary case>
- **WHEN** <trigger>
- **THEN** <observable result>

#### Scenario: <the edge case that bit you in testing>
- **WHEN** <trigger>
- **THEN** <observable result>

### Non-requirements
- The system does NOT <deliberately cut behaviour> — see M4 §7.1, <date>.
```

### A.3 ADR skeleton

```markdown
# ADR-00X: <decision>
Date: <date>   Status: accepted | superseded by ADR-00Y
## Context
## Decision
## Alternatives considered
## Consequences (including what this makes harder)
```

### A.4 Spec-change request — see §3.7 for the filled example.

---

## Appendix B — Glossary

- **Agentic / Ralph loop** — repeatedly invoking a coding agent with the same prompt and a fresh context, with state kept in files.
- **Back pressure** — any automated check that rejects bad generated code (tests, build, types, lint, scanners).
- **Context rot** — degradation of recall as the context window fills.
- **EARS** — Easy Approach to Requirements Syntax; fixed sentence patterns (`WHEN … THE SYSTEM SHALL …`) that make requirements testable.
- **Gate** — a command that returns pass/fail and gives the loop its stop condition.
- **Loop engineering** — designing the control structure around repeated agent invocations: triggers, state, verification, budgets, escalation.
- **Spec delta** — a change expressed as ADDED/MODIFIED/REMOVED requirements against canonical specs (OpenSpec's model).
- **Verifier theater** — a verification step that approves without actually checking.

---

## Sources

**Design documents**
- [Design Docs at Google — Malte Ubl](https://www.industrialempathy.com/posts/design-docs-at-google/) · [Design docs — a design doc](https://www.industrialempathy.com/posts/design-doc-a-design-doc/) · [Writing an effective design doc](https://refactoringenglish.com/excerpts/write-an-effective-design-doc/) · [Design Documents Guide (Community Health Toolkit)](https://docs.communityhealthtoolkit.org/contribute/code/design-docs)

**Spec-driven development**
- [GitHub Spec Kit — spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md) · [Kiro docs — requirements-first](https://kiro.dev/docs/specs/feature-specs/requirements-first/) · [Kiro specs: requirements, design, tasks, EARS](https://kirotutorial.com/concepts/specs/) · [Spec Kit vs BMAD vs OpenSpec](https://dev.to/willtorber/spec-kit-vs-bmad-vs-openspec-choosing-an-sdd-framework-in-2026-d3j) · [SDD with brownfield projects](https://intent-driven.dev/blog/2026/03/10/spec-driven-development-brownfield/) · [Reverse engineering existing code into specs — Martinelli](https://martinelli.ch/reverse-engineering-existing-code-into-specs/) · [7 spec-driven development tools](https://ssojet.com/blog/best-spec-driven-development-tools)

**AI iteration / loops**
- [Loop Engineering: Building Blocks, Adoption, and Impact — arXiv 2608.21884](https://arxiv.org/abs/2608.21884) · [Ralph Wiggum as a "software engineer" — Geoffrey Huntley](https://ghuntley.com/ralph/) · [Claude Code best practices](https://code.claude.com/docs/en/best-practices) · [Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Verifying unsupervised runs — Claude Academy](https://academy.claude.com/courses/claude-code-in-action/trust-it-verifying-unsupervised-runs) · [The Ralph loop in production — ddd.consulting](https://ddd.consulting/blog/ralph-wiggum-loop-in-production) · [How Ralph Wiggum became the biggest name in AI — VentureBeat](https://venturebeat.com/technology/how-ralph-wiggum-went-from-the-simpsons-to-the-biggest-name-in-ai-right-now)

**Products**
- [Songsterr Plus](https://www.songsterr.com/plus) · [Soundslice features](https://www.soundslice.com/features/) · [Yousician guitar](https://yousician.com/guitar) · [flowkey](https://www.flowkey.com/en) · [Ultimate Guitar Pro](https://www.ultimate-guitar.com/pro) *(unreadable)* · [Best AI guitar tab generators — Songscription](https://www.songscription.ai/blog/best-ai-guitar-tab-generators) · [Klangio overview](https://www.aiwizard.ai/klangio) · [Best free singing apps](https://singingcarrots.com/blog/best-free-singing-apps/) · [Vocaberry](https://vocaberry.org/)

**Score following and transcription research**
- [Musical Score Following and Audio Alignment — arXiv 2205.03247](https://arxiv.org/abs/2205.03247) · [Accurate Real-time Windowed Time Warping — ISMIR 2010](https://archives.ismir.net/ismir2010/paper/000072.pdf) · [A simple score following system using chroma and DTW](https://dl.acm.org/doi/10.1145/3206025.3206090) · [Real-time piano transcription with symbol-level tracking — arXiv 2505.05078](https://arxiv.org/pdf/2505.05078) · [A neural score follower — arXiv 2503.06348](https://arxiv.org/pdf/2503.06348) · [Towards reliable real-time opera tracking — arXiv 2006.11033](https://arxiv.org/pdf/2006.11033)

**Licensing**
- [ArrangeMe / Hal Leonard — copyright notices](https://blog.arrangeme.com/blog/copyright-notices-why-they-matter-and-how-to-get-them-right) · [Musicnotes publisher page](https://apps.musicnotes.com/publishers/) · [US copyright law: a guide for music educators — NAfME](https://nafme.org/resource/united-states-copyright-law-a-guide-for-music-educators/) · [Songscription publisher licensing deals](https://www.aimusicpreneur.com/ai-tools-news/songscription-publisher-licensing-deals-play-anything-rebrand/)

**Harmonic's own documents** (read for this report, unchanged): `harmonic-design-document/M4-design-document.md`, `M4-implementation-of-planned-features.md`, `M4-test-plan.md`, `docs/architecture.md`, `openspec/README.md`, `openspec/specs/*/spec.md`, `openspec/changes/*/tasks.md`, `.github/workflows/ci.yml`, `app/tests/*`.
