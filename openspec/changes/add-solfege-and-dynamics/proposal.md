# Add Solfège Labels and Dynamics Detection

## Why

Two vocal requirements were still unbuilt. F15 comes from the user story "As a singer who uses solfège, I want to toggle solfège labels on; as one who doesn't, I want them off." Choir and a cappella singers often learn parts in solfège, and the Vocal score showed only plain notation and lyrics. F19, dynamics detection ("volume rising/falling", priority C), had no implementation either: the app judged which notes were sung, never how loudly.

## What Changes

- **Solfège labels (notation-rendering, F15):**
  - A "Notes only / Do re mi" switch under the score. It is remembered on the device and off by default.
  - When it is on, each pitched note gets a syllable on its own lyric line under any words. Movable do: do is the tonic of the major key the signature names, so minor keys read la-based.
  - Chromatic notes are raised (di ri fi si li) or lowered (ra me se le te) as spelled. Chords get one label, and tied-over notes are not labelled again.
  - MIDI files often have no key signature, so they convert as C. When the notes fit the signature badly and another key well, do is worked out from the notes and the hint says so.
  - Only the viewer's copy is labelled. Exports, sharing and the score model are unchanged.
- **Dynamics detection (audio-pipeline, F19):**
  - While the mic listens (Record attempt, Wait for me, Trouble spots), a level bar and a louder / softer / steady arrow show how loud you are singing and which way it is going. The arrow follows the slope of the level over the last 0.8 s of singing.
  - After a recorded attempt, the result line gives the range from softest to loudest and counts the crescendos and diminuendos: swings of at least 6 dB lasting at least 0.6 s within a phrase.
  - Both read the RMS level the pitch tracker already measures, so no new audio graph is added.

## Capabilities

### Modified Capabilities

- `notation-rendering`: the solfège toggle requirement (F15) is detailed.
- `audio-pipeline`: the dynamics requirement (F19) is detailed.

## Impact

- **New code:**
  - `app/src/tabs/vocal/notation/solfege.js`
  - `app/src/tabs/vocal/audio/dynamics.js`
  - `components/SolfegeToggle.jsx`
  - `components/DynamicsMeter.jsx` and `DynamicsMeter.css`
  - `app/tests/solfege.test.js` and `app/tests/dynamics.test.js`
- **Changed code:**
  - `useMicPitch.js` exposes `dynamics`.
  - `RecordPanel.jsx`, `WaitModePlayer.jsx` and `TroubleSpotsPlayer.jsx` show the meter. `RecordPanel.jsx` also shows the summary.
  - `VocalTab.jsx` hosts the switch.
- **No new dependencies, migrations or server work.** Both features run in the browser.

## Non-goals

- **Fixed-do solfège and do-based minor.** These could be added later as an option.
- **Scoring dynamics against the score's markings** (p, f, hairpins). Mic levels are not calibrated, so the app reports change, not absolute loudness.
- **Dynamics in the Guitar tab.**
