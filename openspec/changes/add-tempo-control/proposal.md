# Add Tempo Control

## Why

F37 is a must, and so far nothing in the app implements it: playback in both tabs only runs at the written tempo. Beginners need to slow a song down to follow it. A verbatim competitor complaint in the requirements is *"doesn't even let you choose the tempo"*.

The metronome (F40, `add-metronome`) has just landed. A slowed song therefore has to slow its clicks and count-in as well, or the two would disagree. The printed tempo mark on the score also has to show the tempo actually being played, not the written one.

## What Changes

- **Tempo control (notation-rendering, modified, F37).**
  - A slider from 50% to 100% of the written tempo, in 5% steps, with a readout such as `75% · ♩ = 90`.
  - It appears on the Vocal tab's follow-along playback (Listen, Record attempt, Trouble spots) and in the Guitar Songs player.
  - It is remembered per song in this browser, keyed by the song file's fingerprint. That covers built-in, uploaded and catalog songs, signed in or not.
  - This implements `add-frontend-experience` task 2.4.
- **Voice songs.** The tempo scales the one `Tone.Transport` (F6) by setting its bpm.
  - Notes, cursor, metronome clicks and count-in slow down together, and a change mid-song takes effect without stopping.
  - Score time is now read and written through Transport ticks (`playback/scoreClock.js`) rather than `Transport.seconds`, which reports wall-clock time once the tempo is not 100%.
  - As a result, mic samples, trouble-spot windows and shared-attempt traces stay in score seconds. An attempt sung at 70% lines up with the score like one sung at full speed.
  - The time readout shows real time: a 0:16 song shows 0:32 at 50%.
- **Guitar songs.** The tempo is alphaSynth's `playbackSpeed`, which slows notes, cursor, clicks and count-in on alphaTab's clock.
- **Printed tempo marks.** Both renderers print the effective BPM, so ♩ = 120 at 75% prints ♩ = 90.
  - **OSMD:** the drawn VexFlow text is rescaled after every render. The sheet model keeps the written tempo, which also times the score model.
  - **alphaTab:** it draws from the score's tempo automations, scaled just for that render and then restored. MIDI generation and exports keep the written tempo.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notation-rendering`: F37 is extended to cover:
  - both tabs' follow-along playback;
  - 5% steps;
  - the metronome on the scaled clock;
  - printed marks at the effective tempo;
  - memory on the device.

## Impact

- **New code:**
  - `app/src/audio/tempo/`: `tempo.js` (steps, BPM, per-song storage), `useSongTempo.js` and `TempoControl.jsx`.
  - `app/src/tabs/vocal/playback/scoreClock.js`.
  - `app/src/tabs/vocal/notation/tempoMarks.js`.
  - `app/tests/tempo.test.js`.
- **Changed code:**
  - `useMidiPlayback.js`: tick-based scheduling, a `rate` input, note durations and count-in at the current tempo.
  - `RecordPanel.jsx` and `TroubleSpotsPlayer.jsx`: score-time sample stamps.
  - `scoreModel.js`: a new `startBpm` field.
  - `SheetMusicViewer.jsx`: a new `tempoFactor` prop.
  - `PlaybackControls.jsx`: a real-time readout.
  - `VocalTab.jsx`, `GuitarSong.jsx` (fingerprints the file) and `GuitarScore.jsx`.
- **No new dependencies.** The Supabase schema is unchanged.

## Non-goals

- **Cloud sync of the tempo** through `song_pref` (`progress-tracking`, F37 persistence side). That table keys on catalog `song` ids and signed-in users only, so built-in and uploaded songs couldn't use it. Syncing catalog songs is a follow-up.
- **Wait for me.** It waits for the singer, so it has no tempo to scale and the control is hidden there.
- **Guitar chord Practice/Play runs.** They have no score or written tempo. Their pace is F32 and F38.
- **Recording the tempo on a shared attempt.** The trace lines up at any tempo; the viewer just isn't told it was slowed.
- **Thinning long traces.** A shared trace holds at most 30,000 samples, about 8 minutes of singing. A long song at 50% could lose its end.
- Per the v1-scope OUT list: computer-vision finger placement (F25), group/social features (F26), YouTube play-along (F27), Changes mode (F38), piano.
