# Tasks

(M) is must and (S) is should.

## 1. Arranging (on the device)

- [x] 1.1 (M) `separateSource` in `separate.js`: any htdemucs_6s source; `separateGuitar` a wrapper.
- [x] 1.2 (M) `scoreXml.js` `partXml`: `clef` and `fifths` options; flats in flat keys. Verified by: `app/tests/arrange.test.js`.
- [x] 1.3 (M) Pure `arrange.js`: lead line, transposition to the part's range, key estimate, harmony segments, Viterbi voicing, the MusicXML score (TTBB, SATB, TB). Verified by: `app/tests/arrange.test.js` (ranges, chord tones, no crossing, complete chords, keys).
- [x] 1.4 (M) `pipeline.js`: `arrangeFile` (browser) over a shared `arrangeAudio` core the worker also runs.
- [x] 1.5 (M) `youtube.js`: link parsing and oEmbed. Verified by: `app/tests/youtube.test.js`.
- [x] 1.6 (M) `ArrangePanel.jsx` and the Vocal tab's arrange view; the result opens as a song, is kept under My files, and says what the arranger did.

## 2. From a link (team only)

- [x] 2.1 (M) Migration 0011: `arranger_access`, `arrangement_job` (owner-only RLS, users write only what to arrange), limits trigger, `claim_arrangement_job` (service role), private `arrangements` bucket. Verified by: `tests/backend/arrangements.test.ts` on a local stack.
- [x] 2.2 (M) `src/lib/arrangements.ts`: queue, poll, list, download, delete.
- [x] 2.3 (M) `worker/arranger/`: yt-dlp + ffmpeg, the app's models in Node (ONNX Runtime; TensorFlow.js on WebAssembly), job loop with progress, audio deleted after each job; `setup.sh`, `run.sh`.
- [x] 2.4 (M) The panel's "Arrange from this link", progress, and recent jobs.
- [x] 2.5 (M) Lyrics on the server path: Whisper word timestamps + LRCLIB published lyrics (`worker/arranger/lyrics.js`), aligned, syllabified and placed under the notes (`arrange/lyrics.js`), `<lyric>` in `scoreXml.js`. Verified by: `app/tests/lyrics.test.js`, `arrange.test.js`; on the VM, 162 of 205 published words placed on the test song.
- [x] 2.6 (M) Apply 0011 to the shared project, add the team to `arranger_access`, start the worker against it (eduardo-vm, 2026-10-19; first production job done in 192 s with published lyrics).

## 3. Checks

- [ ] 3.1 (S) Try real songs end to end (solo singer over a band; a cappella) and tune `SINGING` and the voicing costs by ear.
- [ ] 3.2 (S) Add F42 to the specs repo's `2-scope/requirements.md`.
