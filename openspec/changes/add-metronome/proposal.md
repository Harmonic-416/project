# Add Metronome

## Why

The M3 MVP needs a metronome in both the Vocal and the Guitar tab. Learners practising along with reference playback have nothing that keeps the beat for them: the Vocal tab plays only the notes, and the Guitar Songs player plays the tab with no click or count-in. Both tabs also start playback on the first note with no lead-in. The requirements never named a metronome, so this change adds it as F40.

Competitor research already flags the gap. Simply Guitar is criticised for having "no metronome" (`competitors-and-examples.md`), and `tech-stack.md` picked Tone.js partly to sync "a backing track/metronome to the lesson".

## What Changes

- **Metronome and count-in (notation-rendering, new, F40):**
  - An optional click on every beat of reference playback, with the downbeat marked.
  - An optional one-bar count-in before playback starts.
  - A click-volume control.
  - A beat light that flashes with each click and is larger on the downbeat.
  - On/off, count-in and volume are remembered in the browser and shared by both tabs.
- **Voice songs:**
  - The score model gains a beat grid built in the same OSMD walk that produces the playback schedule. It has one entry per enrolled measure, so it follows time signatures, pickup bars, repeats and tempo changes.
  - Clicks are scheduled on the same `Tone.Transport` as the notes and the cursor, so pause, seek and stop keep them in step (F6).
  - The count-in runs on the audio clock before the Transport starts, so mic-scored modes never read it as score time.
  - The click is unpitched filtered noise, which the pitch tracker ignores even without headphones.
- **Guitar songs:** alphaSynth's own metronome and count-in (`metronomeVolume`, `countInVolume`). Metronome MIDI events drive the beat light.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notation-rendering`: adds the metronome and count-in requirement (F40) on the transport it already owns.

## Impact

- **New code:** `app/src/audio/metronome/` contains:
  - `beats.js`: the beat grid and count-in;
  - `click.js`: the click voice;
  - `settings.js` and `useMetronomeSettings.js`: saved settings;
  - `MetronomeControl.jsx`: the control row.
  
  There is also a new `app/tests/metronome.test.js`, and a click case in `pitchDetector.test.js`.
- **Changed code:**
  - `scoreModel.js` adds a `beats` field.
  - `useMidiPlayback.js` gets beat clicks, the count-in and the new `'counting'` state.
  - `PlaybackControls.jsx` shows the count-in.
  - `RecordPanel.jsx` stops a count-in when an attempt ends.
  - `VocalTab.jsx` and `GuitarScore.jsx` host the control.
- **No new dependencies or assets.** Vocal synthesises its click with Tone.js. Guitar uses the metronome sample already in the bundled `sonivox.sf3`.
- **Toward F8:** the count-in is one way to give the "countdown before a practice run". F8 stays open for scored guitar runs.
- **Specs repo:** F40 added to `2-scope/requirements.md`.

## Non-goals

- **Clicks during mic-listening guitar Practice and Play runs.** A speaker click registers as a strum onset in chord detection. Clicking at a set tempo while scoring is Changes mode (F38), which stays out of V1.
- **Tempo control (F37).** It is a separate change. The beat grid is in score seconds, so it scales with the transport once F37 does.
- **Beat-accuracy scoring (F18).** That belongs to `scoring-engine`.
- **An audible downbeat accent on guitar.** alphaSynth plays every tick with one sample, so the accent shows on the light only.
- **A dotted-quarter pulse for compound meters on guitar.** alphaSynth clicks every eighth in 6/8; the Vocal tab clicks dotted quarters.
- **A standalone metronome tool** that is not tied to a song.
- Per the v1-scope OUT list: computer-vision finger placement (F25), group/social features (F26), YouTube play-along (F27), Changes mode (F38), piano.
