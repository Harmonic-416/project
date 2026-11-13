# Notation Rendering

## REMOVED Requirements

### Requirement: Random melody generation (F20)
Replaced below by "Exercise material comes from what the player chose or learned (F20, F36)".
Random generation was cut, and Tonal.js — which this requirement names — is not a dependency of
this project and never was.

### Requirement: Random chord-progression generation (F36)
Replaced by the same added requirement. The surviving half of F36 is that material is drawn from
the player's own unlocked chords; the random part was cut.

## ADDED Requirements

### Requirement: Exercise material comes from what the player chose or learned (F20, F36)
The system SHALL draw the material for a generated exercise from what the player has chosen to
train or has already learned, never from random generation. The chord-recognition exercises SHALL
ask only the chords the player picked, or the chords of the song they last opened, and SHALL weight
a chord they keep missing to come up more often. The lesson play-through SHALL use the chords the
player has most recently cleared, falling back to a fixed beginner progression until four have been
cleared. Generated material SHALL render as notation or as a chord diagram, with its expected notes
available to scoring wherever the exercise is scored.

Random chords a beginner has not learned yet are not practice (master design document §7.1,
F20/F36).

#### Scenario: A chord-recognition round asks only chosen chords
- **WHEN** a player starts a chord-recognition round
- **THEN** every chord asked comes from the set they picked, or from the song they last opened
- **AND** no chord outside that set is asked

#### Scenario: Missed chords come up more often
- **WHEN** a player has answered one chord wrongly more often than another
- **THEN** the chord they miss more is more likely to be asked

#### Scenario: The play-through uses cleared chords
- **WHEN** a player has cleared four or more chords and starts the lesson play-through
- **THEN** its chords are ones they have cleared

#### Scenario: Before four are cleared, a fixed beginner progression is used
- **WHEN** a player has cleared fewer than four chords and starts the lesson play-through
- **THEN** a fixed beginner progression is used instead
- **AND** no unlearned chord is introduced at random
