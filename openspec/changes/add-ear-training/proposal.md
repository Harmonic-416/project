# Add Ear Training

## Why

The Guitar tab tunes the guitar and checks by ear that the learner played the chord it asked for. Nothing trains the *learner's* ear. A beginner who can't hear the difference between E minor and E major, or between C and G, can't tell on their own whether they played the right chord, and needs the app for every verdict.

Ear training also fits the learning path's rule that instruction should never depend on the hardest technical problem. It needs no microphone, so it works on any device even while chord detection is still being tuned.

## What Changes

- **Exercises view (new, F41).** A fourth view in the Guitar tab: Tuner · Practice · **Exercises** · Songs.
  - The app strums a chord; the learner picks what they heard from a few answers.
  - **Level 1, "Major or minor?"** has 2 answers. Ear-training courses teach chord quality first: the skill is hearing the major vs. minor third. Major and minor come up about equally often, although only 2 of the 6 chords are minor, so always guessing "major" doesn't pay.
  - **Level 2, "Which chord?"** has 4 chord names, shuffled.
  - Questions use the six chords the Practice screen teaches (Em, Am, C, G, D, E), whatever is unlocked. The same chord never comes twice in a row.
  - **Play again** as often as wanted, and **Note by note** plays one string at a time so each note can be heard.
  - After each answer, the right chord's diagram links the sound to the shape. A wrong answer offers **Hear yours** next to **Hear the answer**.
  - Rounds of 10 questions end with a score and the missed chords, each playable again.
- **Guitar sound (shared).** Chords play through a plucked-string synth (Tone.js `PluckSynth`, Karplus–Strong), one voice per string, instead of a keyboard-like triangle wave. The Practice **Hint** (F31) uses the same player, so both sound alike.
- **Phone layout.** The Guitar tab's view switch and account button are tightened so four views fit from 360 px.

## Capabilities

### New Capabilities

- `ear-training`: chord ear training on the guitar side: the two levels, question generation, answering and feedback, the round summary, and the guitar chord sound it plays. Owns F41.

### Modified Capabilities

None. The Hint keeps its F31 behaviour (play the chord once, animate the fingering) with a new sound.

## Impact

- **New code:**
  - `app/src/tabs/guitar/exercises/`: `earTraining.js` (levels, rounds, reducer, scoring), `Exercises.jsx` and `Exercises.css`.
  - `app/src/tabs/guitar/practice/chordSound.js` (`createChordPlayer`) and `useChordPlayer.js`.
  - `app/tests/earTraining.test.js`.
- **Changed code:**
  - `chords.js`: a `quality` field on each chord.
  - `PracticeScreen.jsx`: Hint uses `useChordPlayer`.
  - `GuitarTab.jsx` and `GuitarTab.css`.
- **No new dependencies.** No backend or schema change; nothing is stored.

## Non-goals

- **Saving results** to the browser or the server. Rounds are practice; history can come with guitar progress (`lesson_progress`).
- **Answering by playing** the chord on the guitar (chord detection). Here the learner only listens.
- **More chords or chord types** (7ths, barre chords, inversions), and an adaptive level that drills the chords most often confused.
- **Vocal ear training** (intervals, sight-singing).
- Per the v1-scope OUT list: computer-vision finger placement (F25), group/social features (F26), YouTube play-along (F27), Changes mode (F38), piano.
