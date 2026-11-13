# Tasks — apply the Case 1 spec edits that touch guitar

Every task here is a **human** edit to `openspec/specs/**`, which agents are denied by CLAUDE.md
and by `.claude/settings.json`. Nothing in this change touches application code, so the gate's
steps 1 to 3 cannot verify it; verification is reading, plus the greps in task 7.

## 1. scoring-engine — the inverted soft gate (do this one first)

- [ ] Replace "### Requirement: Guided mode soft gate (F13, F28)" with the MODIFIED block from
      `specs/scoring-engine/spec.md`. **Verified when** the words "advance anyway" appear nowhere in
      `openspec/specs/` and the requirement says the gate never advances on its own.
- [ ] Delete "### Requirement: Three-miss auto-skip with silence-timeout misses (F29)" and all its
      scenarios. **Verified when** `grep -rn "auto-skip" openspec/specs/` returns nothing.

## 2. scoring-engine — the three renamed requirements

- [ ] Replace "hit/late/missed scoring (F11)" with "hit/close/missed scoring (F11)" from the delta.
- [ ] Replace "Chord cleanliness / fuzziness (F17)" with "Per-string verdicts, not a cleanliness
      score (F17)".
- [ ] Replace "Strumming pattern and timing score (F18)" with "Strum timing score (F18)".
- [ ] Replace the text of "Post-run played-vs-score analysis (F14, F33)" with the MODIFIED block.
      **Verified when** `grep -rniE "early/on/late|fuzziness|late window" openspec/specs/` returns
      nothing.

## 3. The four wrong Purpose paragraphs (no delta block can reach these)

Replacements are in `proposal.md`, "Four hand edits the delta form cannot carry".

- [ ] `scoring-engine` — drops "AlphaTab's expected notes", "hit/late/missed", "cleanliness".
- [ ] `notation-rendering` — drops "AlphaTab … (source of truth for expected notes)" as if guitar
      were the only renderer, and "Tonal.js random melody / chord-progression generation".
- [ ] `progress-tracking` — drops "the unlocking lesson map", "prerequisites", "knowledge-only nodes".
- [ ] `song-storage` — drops "(V1 seeds 3 songs)" and "(and seeds the F4 library)".
- [ ] `ui`'s Purpose is correct. Leave it.
      **Verified when** task 7's grep set comes back as described there.

## 4. ui

- [ ] Replace "### Requirement: Lesson flow display (F3)" with the MODIFIED block.
- [ ] Replace "### Requirement: Practice playlist (F4)" with "Song library display (F4)".
      **Verified when** no requirement in `specs/ui` mentions a concept stage, a drill stage or
      three hardcoded songs.

## 5. notation-rendering

- [ ] Delete "Random melody generation (F20)" and "Random chord-progression generation (F36)",
      adding "Exercise material comes from what the player chose or learned (F20, F36)" in their
      place. **Verified when** `grep -rn "Tonal" openspec/specs/` returns nothing — the library is
      not a dependency of this project.

## 6. progress-tracking and song-storage

- [ ] Replace "Unlocking Lesson Map with Prerequisites (F2)" with "Ordered chord unlocking (F2)".
- [ ] Replace the text of "Run-Through History with Last Score (F22)" with its MODIFIED block. It
      currently displays the last score "on the lesson map", which this change deletes.
- [ ] Replace "Seeded Song Library (F4)" with "Built-in songs and the public catalog (F4)".

## 7. Check the result

A plain word-grep does **not** work as an acceptance check here, and getting that wrong is how a
checklist starts lying. The new text deliberately *names* each cut behaviour in order to forbid it
— `SHALL NOT produce a numeric cleanliness or "fuzziness" value`, `there is no lesson map` — so
"the word is gone" would fail on correct text, while `prerequisite` appears innocently in
`specs/deployment` and `specs/pwa-infra` ("prerequisite for N4"), which this change never touches.

Check for the **mandate**, not the word:

- [ ] These must each return nothing:
      ```
      grep -rn "advance anyway" openspec/specs/
      grep -rn "SHALL report chord cleanliness" openspec/specs/
      grep -rn "early/on/late" openspec/specs/
      grep -rn "SHALL model lessons as map nodes" openspec/specs/
      grep -rn "at least the 3 V1 songs" openspec/specs/
      grep -rni "tonal" openspec/specs/
      grep -rn "### Requirement:.*\(auto-skip\|fuzziness\|Strumming pattern\|hit/late\|Playlist\|playlist\|Random\|Lesson Map\|Seeded\)" openspec/specs/
      ```
- [ ] These must each still return something — they are the new prohibitions, not leftovers:
      ```
      grep -rn "SHALL NEVER advance it on its own" openspec/specs/scoring-engine/spec.md
      grep -rn "SHALL NOT produce a numeric cleanliness" openspec/specs/scoring-engine/spec.md
      grep -rn "SHALL NOT score strum direction" openspec/specs/scoring-engine/spec.md
      grep -rn "there is no lesson map" openspec/specs/progress-tracking/spec.md
      ```
- [ ] Count the requirements per file before and after, with
      `grep -c "^### Requirement:" openspec/specs/*/spec.md`. Measured before this change:
      scoring-engine 10, ui 8, notation-rendering 9, progress-tracking 4, song-storage 5.
      Expected after: **scoring-engine 9** (F29 deleted; the three renames are remove-plus-add, so
      they net to zero), **ui 8**, **notation-rendering 8** (F20 and F36 merge into one),
      **progress-tracking 4**, **song-storage 5**. Any other number means a block landed twice or
      not at all.
- [ ] Re-read CLAUDE.md's seven invariants against `specs/scoring-engine/spec.md`. **Verified when**
      no requirement contradicts one — invariant 4 (the soft gate) being the one that was inverted.
- [ ] `bash scripts/gate.sh`. **Verified when** green. It will not have exercised these files, but
      it proves the edit broke nothing else, and step 4 proves `openspec/specs/` was not touched by
      an agent.

## 8. Close the change

- [ ] Archive this change (`openspec/changes/archive/`) once the edits are in `specs/`.
      **Verified when** `openspec/changes/` holds only work in flight. Note that the archive is
      currently empty while 13 changes sit open, which is its own Phase 0 problem
      (`docs/spec-reconciliation.md` §7 step 3) and not this change's job.
- [ ] Set S2 to `DONE` in `fix_plan.md` and append the entry to `loop-log.md`.
