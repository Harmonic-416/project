# Add Vocal Arranger

## Why

Singers in the Vocal tab can only practise songs someone has already written down. A common ask from a cappella and choir singers is the reverse: "here's a song I like — give me parts for our group". Most pop recordings have one lead singer over a band, so there is nothing to *transcribe* into four voices; the parts have to be *arranged*. The Guitar tab already pulls an instrument out of a recording and writes down what it plays, on the device (`feat/guitar-audio-to-tab`); the same models can hear a song's lead vocal and its chords. This change adds the arranger as F42.

Arranging from a YouTube link was asked for explicitly. YouTube play-along scoring (F27) stays out of V1; this change touches YouTube only to *identify* a performance, and, for team members only, to fetch its audio on our own server.

## What Changes

- **Vocal arranger (audio-pipeline, new, F42).** Vocal → **Arrange a song for voices**:
  - the lead vocal is isolated (htdemucs_6s's `vocals` source, the guitar separator generalised to any source) and transcribed (Basic Pitch), then cut to one line;
  - the song's beat (Beat This!) and chord on every beat (`chords.js`) come from the whole recording, so an a cappella recording has chords too;
  - `arrange.js` writes **TTBB**, **SATB** or **two-part (TB)**: the tune in one part (TTBB: Tenor 1, or Tenor 2 as a barbershop lead), moved to the key that fits that part's range (or kept, by octaves only); the other parts sing the chords in block harmony, voiced by a Viterbi pass (chord tones in range, no crossing, bass on the root, complete chords, smooth motion, no parallel fifths/octaves);
  - the result is a four-staff MusicXML score that opens like any other song: playback, part tabs, practising one part with or without the others, MIDI and MusicXML export; it's kept under Home → My files.
- **From a file (everyone):** runs entirely on the device, like the guitar transcriber. Nothing is uploaded.
- **From a YouTube link:**
  - Everyone: the link (validated; title and channel from YouTube's oEmbed) names the arrangement and links back to the performance. The audio still comes from a file.
  - Team members on `arranger_access`: the link alone queues an `arrangement_job`. The arranger worker (`worker/arranger/`, a Node service on our own VM) fetches the audio with yt-dlp, runs the *same* pipeline code, uploads only the MusicXML to the private `arrangements` bucket, and deletes the audio. Ten jobs a day, two at a time.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `audio-pipeline`: adds the vocal arranger (F42).

## Impact

- **New code:** `app/src/tabs/vocal/arrange/` (`arrange.js` pure, `pipeline.js`, `youtube.js`), `components/ArrangePanel.jsx`, `src/lib/arrangements.ts`, `worker/arranger/`, migration `0011_arrangement_jobs.sql`; tests `app/tests/arrange.test.js`, `app/tests/youtube.test.js`, `tests/backend/arrangements.test.ts`.
- **Changed code:** `separate.js` (`separateSource`, any of the six sources; `separateGuitar` unchanged), `scoreXml.js` (`clef` and `fifths` options, flats in flat keys), `VocalTab.jsx`.
- **No new app dependencies or assets.** The models are the guitar transcriber's.
- **Infrastructure:** a VM running the worker (Node 22, ffmpeg, yt-dlp, the Supabase service-role key). It is optional: without it, links still work as references and arranging from files is unaffected.

## Risks

- **YouTube's terms forbid downloading.** The server path is limited to a hand-kept list of team members, keeps no audio, and serves only the notes. It can be switched off by emptying `arranger_access` or stopping the worker. Anything public would need a different source of audio.
- **Accuracy.** Notes and chords are heard, not known; the arrangement is a draft to correct by ear. Lyrics are not transcribed.

## Non-goals

- **Transcribing the parts of an existing multi-part performance.** Basic Pitch can't reliably pull overlapping voices apart; the parts are arranged from the lead line and the chords instead.
- **Lyrics** under the parts, and **a score editor** for fixing notes.
- **Public YouTube downloading**, or downloading in the browser.
- Per the v1-scope OUT list: computer-vision finger placement (F25), group/social features (F26), YouTube play-along scoring (F27), Changes mode (F38), piano.
