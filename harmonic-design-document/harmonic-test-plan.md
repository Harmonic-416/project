# Test Plan for Harmonic

**Last Updated: Milestone 3 (Wednesday, October 21, 2026)**

---

## 1. Introduction

Harmonic's main job is to listen to a person singing or playing and judge what it hears. Whether that works can only really be known with real voices, real guitars, real rooms and real devices. So most of Harmonic's testing is **physical**: people singing and playing into the app and telling us what it got right and wrong. Automated tests sit underneath it. They run on every pull request in the CI pipeline and protect the logic that physical testing has already shaped.

This plan describes both: who tests the app physically and how (Section 3), what the automated tests cover and how CI runs them (Section 4), and when a change counts as tested (Section 5).

---

## 2. Testing Approach

| Method | What it tests | Who |
|---|---|---|
| Private testing by the team | Every feature, on our own instruments and devices, before it is merged | Each feature's owner |
| Guitar testing with other guitarists | Whether the Guitar tab hears real playing correctly and makes sense to a guitarist | Guitarists outside the team, organized by James |
| Vocal testing with an a cappella group | Whether the Vocal tab hears real singers correctly and helps them learn a part | Jamie's and Eduardo's a cappella group |
| Automated tests in CI | The scoring logic, audio analysis, UI components and backend, on every pull request | GitHub Actions |

Physical testing answers "does it work for a person?". Automated testing answers "did this change break something that already worked?". Neither replaces the other. A synthetic guitar signal can pass every unit test and still fail on a phone microphone in a noisy room. A tester can't re-check 300 cases after every commit.

---

## 3. Physical Testing

### 3.1 Private Testing by the Team

Before a feature is merged, its owner tests it on the running app with their own instrument or voice. Changes stay on a local branch until that check is done. Each tester looks at the things only a real microphone shows:

- Does the app hear the right note or chord, and only that?
- Does it reject wrong ones, including near misses?
- Does it ignore noise, such as typing, taps and the app's own metronome click?
- Does it say "couldn't hear you" when the input is too quiet, rather than scoring a miss?

Tests are run with and without headphones, on laptop and phone microphones, and on the deployed app as well as the local build.

### 3.2 Guitar: Testing with Other Guitarists

The guitar side was tested by asking other guitarists to try the app and give feedback. Each tester was asked to:

1. Tune up with the Tuner and work through the first chord lessons in **Learn** (Guided, then Practice).
2. Play a built-in song in **Wait for me**, then in **Trouble spots**, with and without headphones.
3. Try **Strum on the beat** and a round of **ear training**.
4. Open a song file of their own, and try **Tab the guitar from a song** on a recording.

Feedback was collected on three questions:

- Did the app agree with them about what they played?
- Where did it get stuck or move on wrongly?
- What was confusing?

Playing on real guitars found problems the unit tests had missed, and each became a fix with its own tests:

| What real playing showed | What changed |
|---|---|
| Wait for me moved on after wrong notes, copying the chord lessons' three-miss rule | Song Wait for me never moves on by itself: only the right note or Skip advances it |
| Typing or tapping near the microphone moved the cursor and even scored hits | A sound must be tonal, keep ringing and stand above the room's noise before it is judged |
| One strum counted twice, because the chord still rings into the next window | Onsets close together are one gesture, and only freshly played notes count |
| Near-miss chords passed: E major for E minor, A7 for A | In Wait for me, every note of the chord must sound and nothing else, and the extra note is named |
| Strings still ringing from the last chord were counted as wrong | The judge checks which notes got louder at the strum |
| The microphone changing a lesson's chord on its own was confusing | Wrong strums are only counted, and the player moves on with a chord choice, Skip or Next |
| The metronome click came back through the speakers and was heard as a strum | Strum on the beat ignores sounds with almost no energy below 1.5 kHz |

### 3.3 Vocals: Testing with an A Cappella Group

The vocal side was tested by asking Jamie's and Eduardo's a cappella group to try the app and give feedback. Singers who learn parts every week are the audience the Vocal tab is built for, and they sing in the voice ranges and harmony the arranger writes for. Each singer was asked to:

1. Open a song, pick their own part, and listen with the metronome and tempo control.
2. Sing their part in **Wait for me** and **Trouble spots**, and record a run.
3. Look at the result on the score and in **This session**, and send an attempt to a friend.
4. Practise a part from an arrangement made by **Arrange a song for voices**.

Feedback was collected on the same three questions as for guitar: did the app agree with them, where did it go wrong, and what was confusing. It also covered how useful the scores and practice history were for learning a part.

### 3.4 Physical Test Cases

These are the cases each round of physical testing works through. A case passes when the app's verdict agrees with the person playing or singing.

**Guitar**

| ID | Feature | Steps | Expected result |
|---|---|---|---|
| G1 | Tuner | Pluck each string, out of tune and then in tune | The note and how far off it is; in tune within a few cents |
| G2 | Chord lesson | Strum the lesson's chord cleanly | "Heard it", every string green |
| G3 | Chord lesson | Strum a chord one note off (E major for E minor) | Not accepted; the wrong strings marked red |
| G4 | Chord lesson | Play nothing, or very quietly | "Couldn't hear you", not a miss |
| G5 | Wait for me | Play a song's chords in order, letting strings ring | Each chord passes once; ringing strings aren't counted again |
| G6 | Wait for me | Type and tap near the microphone | No verdict, and the cursor doesn't move |
| G7 | Trouble spots | Play along with headphones, making a few deliberate mistakes | The mistakes, and only those, marked amber or red; Loop bar offers the first miss |
| G8 | Latency calibration | Calibrate, then play Trouble spots through speakers | Notes played in time are credited to the right beat |
| G9 | Metronome and tempo | Play at 50% with the click on | Clicks never scored as notes; the song slows with its tab cursor |
| G10 | Full / Easy | Switch a song to Easy | Only the first note of each bar and chord changes are scored |
| G11 | Strum on the beat | Strum early, on time and late on purpose | Each strum rated as played |
| G12 | Ear training | Answer a round of 10 | Right and wrong answers marked; missed chords replayable |
| G13 | Generated tab | Open a MIDI or MusicXML file without tab | Playable tab, with a notice saying it was generated |
| G14 | Audio to tab | Transcribe a recording with a guitar | A draft tab under My transcriptions that opens like a song |
| G15 | Progress on the account | Clear a chord signed in, then sign in on another device | The chord is shown cleared there too |

**Vocals**

| ID | Feature | Steps | Expected result |
|---|---|---|---|
| V1 | Open a song | Open a built-in, a catalog and an uploaded file | Sheet music with the part picker and playback |
| V2 | Playback | Play a part at 70% with the metronome | Notes, cursor and clicks slow down together |
| V3 | Wait for me | Sing each highlighted note, some slowly | The song waits; slow notes are called out |
| V4 | Trouble spots | Sing along, some notes flat or sharp | Notes within tolerance green, half a step off amber, misses red, with a summary |
| V5 | Quiet input | Stop singing partway through | "Couldn't hear you", not a run of misses |
| V6 | Recorded attempt | Record a run signed in | The attempt appears under This session with its score and recording |
| V7 | Slowed attempt | Record at 70% tempo | It scores against the written rhythm, like one at full speed |
| V8 | Sharing | Send an attempt to a friend | It appears on their Home, redrawn on their copy of the song |
| V9 | Arranger | Arrange an audio file for voices | A multi-part score that opens, plays and can be practised |

**Across the app**

| ID | Feature | Steps | Expected result |
|---|---|---|---|
| A1 | Sign-in | Sign in and out | Progress, attempts and friends follow the account |
| A2 | Phone layout | Use each tab on a phone-sized screen | Everything fits from 360 px wide, nothing scrolls sideways |
| A3 | Installable app | Install the PWA and reopen it offline | It opens, and built-in songs and lessons work |

---

## 4. Automated Testing

### 4.1 What the Tests Cover

- **Scoring and practice logic.** Every practice mode is a pure state machine (Wait for me, Trouble spots, the chord lessons, ear training, strum timing, practice sessions), so it is tested in Node without a browser.
- **Audio analysis on synthetic signals.** The guitar tests generate realistic strings in code, with stretched overtones, a pick noise burst and ringing, plus keyboard clicks and room noise. With these, the note judge, onset detection and noise gate are tested against known answers. The pitch detector is tested the same way for the voice.
- **Notation.** Loading MIDI, MusicXML and Guitar Pro files, converting to MusicXML, tempo marks, fret assignment and tidying MIDI.
- **UI components.** Component tests run in jsdom with Testing Library.
- **Backend.** The `src/lib` layer is tested against Supabase, including row-level security: one user cannot read another's attempts, notes or progress.
- **Benchmarks (opt-in).** Audio to tab is scored against synthetic songs and a synthetic band. These run on request, not in CI, because they need the large models.

### 4.2 The CI Pipeline

Every pull request and every push to `main` runs the CI pipeline on GitHub Actions (`.github/workflows/ci.yml`):

| Job | Runs | When |
|---|---|---|
| `backend` | Lint, typecheck and tests for `src/lib` and the migrations | Every pull request and push to `main` |
| `app` | Lint, unit and component tests, production build | Every pull request and push to `main` |
| `migrate` | Applies new database migrations to the live Supabase project | Push to `main`, only after `backend` and `app` pass |
| `deploy` | Deploys the app to Vercel production | Push to `main`, only after `migrate` succeeds |

A change that fails a test, the lint or the build cannot reach users: the deploy waits on the tests and the migration. The backend's integration tests run when the Supabase test secrets are configured and skip themselves otherwise. The team also runs them against a local Supabase stack.

### 4.3 Current Numbers

| Suite | Test files | Result on `main`, October 21, 2026 |
|---|---|---|
| App (`app/tests`) | 62 | 551 tests pass; 3 opt-in benchmark files (6 tests) skipped by default |
| Backend (`tests/backend`) | 13 | Unit tests run on every pull request; integration tests run against a Supabase test project or local stack |

---

## 5. When a Change Counts as Tested

A pull request is merged when:

1. **CI passes:** lint, typecheck, all automated tests and the production build.
2. **Its owner has tested it physically** on the running app with their instrument or voice, covering the physical test cases for the feature it changes (Section 3.4).
3. **New logic has new tests.** A bug found in physical testing gets a test that reproduces it before it is fixed, as with the guitar fixes in Section 3.2.

Changes that most affect how the app hears people, such as the guitar judge or the vocal scoring tolerances, also go back to the outside testers in the next round.

---

## 6. Known Limits

- **Synthetic signals are not real instruments.** The guitar judge's thresholds were first set on simulated strings and are still being tuned on real recordings from the guitar testers.
- **No automated end-to-end microphone tests.** CI never plays audio into a browser. That path is covered by physical testing only.
- **Audio to tab has no accuracy measure on real songs yet,** because there are no reference tabs to score it against. It is marked experimental in the app.
- **Feedback is gathered informally,** in conversation and messages rather than a survey, so it shows what people found but not how often.
