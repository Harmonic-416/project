# Scoring Engine

## Purpose
The instrument-agnostic scoring brain: it compares normalized events to the expected notes the renderer parsed — alphaTab's for guitar, OpenSheetMusicDisplay's for voice — on the one transport clock, and scores each as hit, close or missed. It owns the guided, practice, play and changes state machines, chord verification, per-string verdicts, strum timing, post-run analysis, and the guitar "couldn't hear you" state. It never learns which analyzer produced an event.

## Requirements

### Requirement: Instrument-agnostic hit/close/missed scoring (F11)
The system SHALL score each expected note as hit, close or missed by comparing normalized events against the expected notes on the single transport clock, without any instrument-specific branching — it SHALL NOT know which analyzer produced an event. "Close" SHALL mean a recognisable but unclean attempt: for a single note, the right pitch in the wrong octave or about a semitone out; for a chord, some but not all of its notes sounding; in a gated mode, the right note reached only after a wrong try. The system SHALL NOT rate how early or late an individual note was.

Pitch is what a microphone can judge reliably; timing is rated where it is the point, in strum timing (master design document §7.1, F11).

#### Scenario: A clean attempt scores a hit
- **WHEN** an event matching the expected note arrives inside the item's window
- **THEN** the item is scored hit

#### Scenario: A recognisable but unclean attempt scores close
- **WHEN** the attempt is the right note in the wrong octave, about a semitone out, or only part of the expected chord
- **THEN** the item is scored close rather than missed

#### Scenario: No matching event scores a miss
- **WHEN** no matching event arrives before the item's window closes
- **THEN** the item is scored missed

#### Scenario: Scoring does not branch on instrument
- **WHEN** events are consumed for scoring
- **THEN** the same logic applies regardless of which analyzer produced the event

#### Scenario: A run counts verdicts, not timings
- **WHEN** a run finishes
- **THEN** its totals are counts of hit, close and missed
- **AND** no item carries an early or late rating

### Requirement: Guided mode soft gate (F13, F28)
The system SHALL run a guided state machine that holds on the current note or chord until it is verified, and SHALL NEVER advance it on its own. A wrong attempt SHALL be counted and SHALL NOT change the current item. The ways past SHALL be available at all times: a hint, a manual skip, and a retry that clears the count. After three unsuccessful attempts on the same item the system SHALL draw the player's attention to them. In the chord lessons, after three failed attempt-runs at the same chord the system SHALL additionally offer "Unlock anyway", which clears that chord as skipped and opens the next. Every outcome — verified, skipped, unlocked anyway — SHALL be recorded.

Auto-advance was removed on purpose: on real guitars it moved on after wrong notes, and testers found it confusing (master design document §7.1, F13/F29; CLAUDE.md invariant 4).

#### Scenario: Hold until verified, however many attempts
- **WHEN** the current item is unverified
- **THEN** it stays current, however many attempts have been made
- **AND** nothing advances without either a verified attempt or an explicit player action

#### Scenario: The way out is always offered
- **WHEN** the player is on any note or chord in a gated lesson
- **THEN** a hint, a skip and a retry are present and enabled

#### Scenario: Three unsuccessful attempts point at the way out
- **WHEN** three attempts on the same item have gone unverified
- **THEN** the system draws attention to the hint and the skip
- **AND** the item is still current

#### Scenario: Unlock anyway after three failed runs
- **WHEN** three attempt-runs at the same chord have failed
- **THEN** "Unlock anyway" is offered
- **AND** taking it records that chord as cleared-by-skip and opens the next chord

#### Scenario: Too quiet is not a failed attempt
- **WHEN** the input is too quiet to judge
- **THEN** no failed attempt is counted
- **AND** the current item does not change

### Requirement: Manual skip recorded in score (F13, F30)
The system SHALL accept a manual skip intent at any time, advance past the item, and record the manual skip.

#### Scenario: Manual skip advances and is recorded
- **WHEN** a skip intent is received for the current item
- **THEN** the state machine advances
- **AND** a manual skip is recorded for the skipped item

### Requirement: Guitar chord verification against the expected chord (F16)
The system SHALL verify a strummed chord against the single expected chord (match/no-match, not arbitrary recognition), using the chord analyzer's normalized event.

#### Scenario: Matching chord verifies
- **WHEN** a chord event matching the expected chord arrives within the detection window
- **THEN** the expected chord is marked verified

#### Scenario: Non-matching chord does not verify
- **WHEN** a non-matching chord event arrives
- **THEN** the chord is not verified and a failed attempt is counted

### Requirement: Per-string verdicts, not a cleanliness score (F17)
For each string the expected chord uses, the system SHALL report whether it rang clean or buzzed or was wrong, and SHALL NOT produce a numeric cleanliness or "fuzziness" value. A string not yet heard SHALL be reported distinctly from one that has been judged, and a string the chord does not use SHALL be reported as not played rather than as a problem.

From a microphone, leftover buzz from an earlier strum is indistinguishable from a wrong note played slightly early, so a score would only be a guess (master design document §7.1, F17).

#### Scenario: Each used string gets a binary verdict
- **WHEN** a strum of the expected chord is judged
- **THEN** every string the chord uses is reported as rang-clean or buzzed-or-wrong
- **AND** no numeric cleanliness value is produced

#### Scenario: Not yet heard is distinct from judged
- **WHEN** no strum has been judged for the current chord
- **THEN** every string is reported as not heard yet

#### Scenario: Unused strings are not judged
- **WHEN** the expected chord does not use a string
- **THEN** that string is reported as not played

### Requirement: Strum timing score (F18)
The system SHALL score strum timing against a click: each expected strum SHALL be matched to the nearest strum heard, within half the gap to its neighbours and each heard strum used once, and rated on time, early, late or missed. A run SHALL report the share on time, and SHALL name a consistent habit — rushing or dragging — with its size when the player's median offset exceeds half the on-time window. The system SHALL NOT score strum direction or strumming patterns.

A down-strum and an up-strum of the same chord sound too alike to tell apart, so only timing is scored (master design document §7.1, F18).

#### Scenario: Each expected strum is rated against the click
- **WHEN** a strum-timing run completes
- **THEN** each expected strum is rated on time, early, late or missed
- **AND** the run reports the share that were on time

#### Scenario: A habit is named
- **WHEN** the player's strums sit consistently ahead of or behind the click by more than half the on-time window
- **THEN** the run names the tendency and its approximate size

#### Scenario: Direction is not scored
- **WHEN** a run contains both down-strums and up-strums
- **THEN** no verdict distinguishes one from the other

### Requirement: Play mode uninterrupted run (F14, F32)
The system SHALL run a play-mode state machine in which the piece plays straight through at tempo, the playhead advances regardless of detection, and nothing gates the run.

#### Scenario: Play mode never gates
- **WHEN** the user misses an item in play mode
- **THEN** the playhead keeps advancing without holding on the missed item

### Requirement: Post-run played-vs-score analysis (F14, F33)
After a run the system SHALL produce a per-item breakdown marking each item verified, wrong or not heard, suitable for marking on the notation. It SHALL NOT attach an early, on-time or late rating to an individual item; timing is rated only where timing is the exercise (F18). An item using a technique the live judge does not score SHALL be marked not-scored rather than wrong or missed.

#### Scenario: Per-item breakdown after a run
- **WHEN** a run completes
- **THEN** each item carries a verified, wrong or not-heard verdict
- **AND** the breakdown is available to mark on the notation

#### Scenario: No per-item timing rating
- **WHEN** the breakdown is read
- **THEN** no item carries an early, on-time or late rating

#### Scenario: Unscoreable techniques are passed over
- **WHEN** an item is a bend, a dead note or a harmonic
- **THEN** it is marked not-scored
- **AND** it does not count against the run

### Requirement: Explicit "couldn't hear you" state (F21)
The system SHALL raise a "couldn't hear you" state when input is too quiet to score (per the pipeline's volume gate) rather than scoring the silence as a wrong note.

#### Scenario: Too-quiet input surfaces couldn't-hear-you
- **WHEN** the pipeline signals input below the volume gate during a scored item
- **THEN** the scoring engine raises the "couldn't hear you" state
- **AND** the silence is not scored as a wrong note
