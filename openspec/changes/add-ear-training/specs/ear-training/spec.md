# Spec Delta

## Purpose
Chord ear training on the guitar side: the app plays a chord and the learner picks what they heard, first major or minor, then the chord's name, so they learn to recognise the chords they are learning by sound alone, with no microphone.

## ADDED Requirements

### Requirement: Two levels, quality first (F41)
The system SHALL offer two levels: "Major or minor?", answered with Major or Minor, and "Which chord?", answered with four chord names. Both SHALL draw their chords from the six chords the Practice screen teaches (Em, Am, C, G, D, E), whether or not they are unlocked.

#### Scenario: Major or minor
- **WHEN** the learner starts the "Major or minor?" level
- **THEN** each question offers exactly the answers Major and Minor

#### Scenario: Which chord
- **WHEN** the learner starts the "Which chord?" level
- **THEN** each question offers four different chord names, one of them the chord played

#### Scenario: Locked chords are still asked
- **WHEN** only E minor is unlocked in Practice
- **THEN** questions can still play any of the six chords

### Requirement: Fair rounds (F41)
A round SHALL be ten questions. The same chord SHALL NOT be asked twice in a row. In "Major or minor?", major and minor SHALL each be the answer about half the time. In "Which chord?", the right answer's position among the choices SHALL vary.

#### Scenario: No back-to-back repeat
- **WHEN** a round is generated
- **THEN** no two consecutive questions play the same chord

#### Scenario: Guessing the commoner quality doesn't pay
- **WHEN** many "Major or minor?" questions are generated
- **THEN** between 40% and 60% of them are minor, although only two of the six chords are

### Requirement: Listening controls (F41)
The system SHALL strum the chord when a question appears, SHALL let the learner play it again any number of times, and SHALL let them hear it one string at a time. The chord SHALL sound like a plucked guitar, low string to high, with muted strings left out, and a new sound SHALL cut off the previous one.

#### Scenario: Chord plays with the question
- **WHEN** the learner taps Start or Next
- **THEN** the next question's chord is strummed without a further tap

#### Scenario: Note by note
- **WHEN** the learner taps Note by note
- **THEN** the chord's strings sound one at a time, low to high

### Requirement: Answer feedback (F41)
The system SHALL accept one answer per question, mark the right answer, and also mark a wrong pick, name the chord that was played, and show its chord diagram. After a wrong answer in "Which chord?", the system SHALL offer to play the picked chord and the right one for comparison.

#### Scenario: Wrong answer
- **WHEN** the learner picks G major and the chord was D major
- **THEN** G major is marked wrong, D major is marked right, D major's diagram is shown
- **AND** Hear yours (G) and Hear the answer (D) are offered

#### Scenario: One answer per question
- **WHEN** the learner has answered
- **THEN** further taps on the answers change nothing until Next

### Requirement: Round summary (F41)
At the end of a round the system SHALL show the number of correct answers out of ten and list each chord answered wrongly, with how often, as a button that plays that chord. It SHALL offer to play the same level again or change level.

#### Scenario: Missed chords to listen to again
- **WHEN** a round ends with A minor missed twice and C major once
- **THEN** the summary shows the score and A minor (missed 2 times) and C major (missed once), each playable

### Requirement: No microphone, nothing stored (F41)
Ear training SHALL work without microphone access and SHALL NOT send or store any results.

#### Scenario: Works with the microphone denied
- **WHEN** microphone permission has been denied
- **THEN** a full round can still be played and scored
