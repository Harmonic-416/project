# Spec Delta

## MODIFIED Requirements

### Requirement: Guided mode soft gate (F13, F28)
The system SHALL run a guided-mode state machine that holds on the current note/chord until verified. In the guitar chord lessons it SHALL advance anyway after N=3 attempts (a soft gate), recording the outcome. In a song's Wait for me mode it SHALL NOT advance on wrong attempts: it SHALL count and show them, and only a verified note/chord or a manual skip SHALL move it on.

#### Scenario: Hold until verified
- **WHEN** the current item is unverified and, in a chord lesson, fewer than 3 attempts have been made
- **THEN** the cursor does not advance

#### Scenario: Soft gate advances after N attempts
- **WHEN** 3 attempts have been made on a chord lesson's chord without a verified success
- **THEN** the state machine advances to the next item
- **AND** the outcome is recorded

#### Scenario: Song wait mode never advances on wrong attempts
- **WHEN** any number of wrong attempts are made on the current note/chord of a song in Wait for me
- **THEN** the cursor stays on it and the number of tries is shown
- **AND** a later verified attempt is recorded as needing retries

### Requirement: Three-miss auto-skip with silence-timeout misses (F29)
In the guitar chord lessons, the system SHALL count misses on the current item and after three SHALL auto-skip it and record the auto-skip; a miss SHALL be a failed attempt (wrong note/chord) OR a silence timeout with no onset within the item's window. A song's Wait for me mode SHALL NOT auto-skip.

#### Scenario: Three misses trigger auto-skip
- **WHEN** the current chord-lesson item accumulates three misses
- **THEN** it is auto-skipped
- **AND** the auto-skip is recorded

#### Scenario: Silence timeout counts as a miss
- **WHEN** no strum onset or note event is detected within a chord-lesson item's window
- **THEN** a miss is counted even though no wrong note was played

#### Scenario: Songs are never auto-skipped
- **WHEN** the current item of a song in Wait for me accumulates three or more wrong attempts
- **THEN** it is not skipped

## ADDED Requirements

### Requirement: Song wait mode judges each strum once, and only fresh playing (F13, F16)
In a song's Wait for me mode the system SHALL judge each pick or strum once, treating onsets within 0.2 s of each other as one gesture, and SHALL verify the current note/chord only if its notes were freshly played (louder than just before the gesture), so a note or chord that is still ringing SHALL NOT verify the next item. A chord SHALL be verified only when every one of its notes sounds.

#### Scenario: A ringing chord does not verify the next item
- **WHEN** a correct chord has been verified and is still ringing
- **AND** another sound, such as a tap or a keystroke, occurs
- **THEN** the next item is not verified by it, even when it is the same chord

#### Scenario: A strum caught in two goes counts once
- **WHEN** one strum reaches the strings in two parts within 0.2 s
- **THEN** it is judged once
- **AND** its first half is not counted as a wrong attempt

#### Scenario: A chord one fret off is not verified
- **WHEN** E major is strummed while E minor is expected
- **THEN** the chord is not verified
- **AND** the string that differs is shown as not sounding right
