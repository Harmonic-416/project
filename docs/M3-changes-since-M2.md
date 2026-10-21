# Design Document for Harmonic — Milestone 3 Changes

Last Updated: Milestone 3 (Wednesday, October 21, 2026)

This document records what changed in Harmonic between the Milestone 2 review
(Wednesday, September 30, 2026) and Milestone 3. It follows the section numbers
of the [M2 design document](../harmonic-design-document/harmonic-design-document.md)
so each change can be read next to the part of the design it updates. The M2
status page is [`M2-design-and-setup.md`](M2-design-and-setup.md).

Everything below is merged to `main` and deployed at
**https://harmonic-vert.vercel.app** (pull requests #14 to #34).

## 0. Summary

| Area | At M2 (Sep 30) | At M3 (Oct 21) |
|---|---|---|
| Tabs | Home, Guitar, Vocal | Home (redesigned), Guitar, Vocal, **Social** |
| Accounts | Sign-in only needed to share an attempt | Sign-in also keeps your attempts, practice sessions, feedback, friends and guitar progress |
| Attempts | One-off share link | Saved privately on every finish; sent to friends; comments; per-song history with notes and ratings |
| Practice history | Tables built but unused | **Practice sessions**: every sitting at a song with its attempts and recordings |
| Vocal | Practise a song from a file or the catalog | Also **arrange a song for voices** from an audio file or a YouTube link |
| Guitar | Tuner, chord practice, tab songs | Songs, **Learn** (chord lessons, strum on the beat), **Exercises** (ear training), **Fretboard**, Tuner, audio-to-tab draft |
| Playback | Fixed tempo | **Metronome** with count-in, **tempo** 50–100% |
| Database | Migrations 0001–0005 | Migrations 0001–**0014** (0006–0014 new) |
| Server-side jobs | None | One off-platform **arranger worker** (Section 4.6) |
| Tests | 170 app + 37 backend | 63 app test files and 12 backend test files; backend suite 97/97 against a local Supabase stack |

## 1. Introduction (changes)

Harmonic is still an installable React + Vite PWA for vocals and guitar, with
the microphone analysed on the device. Two things changed in what the app is:

1. **It keeps a practice history.** A signed-in user's attempts are saved,
   grouped into practice sessions, and can carry the user's own notes and
   their friends' comments. M2 only stored an attempt when the user shared it.
2. **It can write music, not only read it.** The Vocal tab's arranger turns a
   recording into a multi-part vocal score (for example Solo + TTBB) that is
   then practised like any other song.

## 2. User Interface (changes)

### 2.1 Design

The UI is still a thin shell over the scoring engine and notation renderers.
The bottom bar now has four tabs: **Home, Guitar, Vocal, Social** (#28).

### 2.2 Guided Lessons

At M2 guided lessons were shelved. In M3 the guitar learning path was first
removed from the Guitar tab to refocus it on songs (#19), then brought back as
a **Learn** view (#30):

- **Chord lessons** over 20 chords, in four modes: Guided, Practice, Play and
  one-minute Changes.
- **Strum on the beat**, moved here from Exercises.
- The microphone never changes the lesson's chord on its own. Wrong tries are
  counted, and the player moves on with a chord choice, Skip or Next.
- Chord diagrams draw barres and pulse in finger order.
- **Progress follows the account** (new table `guitar_progress`, migration
  0013). It is kept in the browser so lessons work signed out, and merged with
  the account's copy on sign-in: a pass beats a skip, and the higher best wins.

The vocal side has no lesson map. Its learning loop is practice sessions and
attempt history (Section 2.4).

### 2.3 Live Practice Runs

- **Metronome and tempo** (#15). Beat clicks with an accented downbeat, an
  optional one-bar count-in and a volume, shared by Vocal and Guitar. Tempo is
  50–100% in 5% steps, remembered per song. Voice playback keeps score time,
  so a slowed attempt still scores against the written rhythm. The click is
  high-passed noise so the pitch tracker never mistakes it for a sung note.
- **Guitar "Wait for me"** (#17, #18, #19). Stricter chord judging: a chord one
  note off (A7 for A) is not accepted and the extra note is named, and strings
  still ringing from the last chord are not counted as wrong. A Full / Easy
  option per song (Easy scores the first note of each bar and each chord
  change). A "Tune first?" banner returns when a song's notes sit out of tune.
- **Strum on the beat** ignores its own click heard through the speakers (#30).

### 2.4 Run-through Summaries and Attempt History

This is the largest change since M2. At M2 an attempt was scored, marked on
the score, and optionally shared as a link. Now:

- **Attempts are saved automatically** for a signed-in user, privately (#24).
  "Copy link" shares one by link, and **Send to friends** puts it on their
  Home page.
- **Comments** on an attempt from its owner and the friends it was sent to
  (#21, #25).
- **Practice sessions** (#32). Opening a song starts a session. Each recorded
  attempt appears under **This session** with its time, score, part, recording,
  a note to self that autosaves, and a 1–5 rating. Reopening the song within
  30 minutes resumes the same session, and a session with no attempts is
  deleted. A **Practice sessions** view shows one card per song with a summary
  (times practised, attempts, best, last practised) and the sessions beneath it.
- **Recording budget** (#32). Recordings are the only thing that can fill the
  free storage tier, so they are opt-in per attempt ("Keep recording"), capped
  at 100 MB per user by a database trigger, shown as a storage-used bar, and
  deletable while keeping the attempt's score and notes.
- **Opened attempt history** (#34). Opening an attempt (from Home or a link)
  now shows, under its recording: your own note and rating on it (owner only),
  your friends' comments with a reply box, and **every try at the same song**,
  newest first, with its score, the change from the try before, the best one
  marked, its recording and comment count. Each try opens in place. A friend
  sees only the tries that were sent to them, never the owner's notes.
- **Clearer score line** (#34): "80% in tune · of what you sang · 6 of 472
  notes sung". The percent is over what was sung, the counts over the whole
  part, which M2's wording did not make clear.

### 2.5 Home and Social (new)

- **Home** (#23–#26, #29): Continue Practice (latest attempt with hit, close
  and missed counts, trouble spots and an accuracy ring), Working On (songs
  practised with best-score bars), Quick Practice, Recent Activity (Received
  and Sent attempts with comments), and **My Files**: song files opened on this
  device, kept in IndexedDB and never uploaded. Opening a friend's attempt
  finds the song in My Files automatically.
- **Social** (#28): your **name#tag**, an invite link (opening it makes you
  friends), add a friend by name#tag, and Friends / Requests / Sent lists.

### 2.6 Vocal Arranger (new)

Vocal → **Arrange a song for voices** (#33). Harmonic listens to a song's lead
vocal and chords and writes a new arrangement for voices, which opens as a
normal multi-part score to hear, practise and export as MIDI or MusicXML.

- **Voicings:** Solo + TTBB (default), TTBB, SATB, and two parts (TB). In Solo +
  TTBB the soloist sings the tune with the words and the backing holds each
  chord as a plain block chord on "oo" while the solo sings and "ah" while it
  rests.
- **Two ways in:** an audio file the user owns, arranged entirely in the
  browser (no upload, about 70 MB of models downloaded once); or a **YouTube
  link**, arranged on the team's server for users on an allow-list, which also
  adds **lyrics** under the tune.
- **How it works:** vocal separation, Basic Pitch for the sung notes, beat
  tracking, and a chord pass that hears the chords again in the song's own
  scale and changes them only at bar lines or half-bars. The tune is cleaned
  of stray sixteenth notes, snapped to eighths and sung legato, then moved to
  a key that suits the singers. Lyrics come from published synced lyrics
  (LRCLIB) or Whisper, aligned line by line.

### 2.7 Guitar (other changes)

- **Exercises: ear training** (#16, #19). Three levels: chord type, which chord
  (weighted toward misses, with per-chord accuracy), and the chords of the last
  song opened. Chords now play through a plucked-string synth.
- **Fretboard** (#27). The whole neck to fret 20 with every note labelled, five
  tunings, tap a note to hear it and light up every place with the same pitch,
  with explanations of each move.
- **Audio to tab** (#20). A first draft that turns an MP3 into tab. It is
  inaccurate and marked as experimental.

## 3. Core Audience (changes)

The three audiences are unchanged. Two additions serve them:

- **Stranded intermediates** and **returning musicians** get a visible trend:
  per-song tries, best and change, and their own notes on each try.
- **Choir and a cappella singers** are a new secondary audience: the arranger
  gives them a part to practise for songs that have no published arrangement.

## 4. Software Stack (changes)

### 4.1 Frontend Framework

Unchanged: React 19 + Vite PWA, OpenSheetMusicDisplay and Tone.js for voice,
alphaTab for guitar, pitchy and an AudioWorklet for the microphone. Added:

- **Arranger models in the browser:** TensorFlow.js and ONNX Runtime Web for
  vocal separation, Basic Pitch and beat tracking, loaded only when the
  arranger is used.
- **IndexedDB** for My Files (song files stay on the device).

### 4.2 Backend Infrastructure

Supabase is still the only backend service. It is now used for:

1. **Sign-in** (unchanged).
2. **Public catalog** (unchanged).
3. **Attempts**: saved privately, shared by link or to friends, with comments.
4. **Social**: profiles with name#tag, friendships, invite codes.
5. **Practice sessions**, owner feedback and the recording budget.
6. **Guitar progress** across devices.
7. **Arrangement jobs**: a queue table and a private `arrangements` bucket for
   the arranger worker's results.

### 4.3.1 Schema (new since M2)

| Migration | Adds | Access |
|---|---|---|
| 0006, 0007 | Guitar copy of Ode to Joy with string and fret on every note; guitar attempts in `shared_attempt` (instrument, per-note verdicts instead of a pitch trace) | as `shared_attempt` |
| 0008 `user_handles` | `profiles.display_name` + 4-digit tag (name#tag), invite codes, `find_user_by_handle()` | own row; lookup by exact handle |
| 0009 `friendships` | `friendship` (requested / accepted), request, accept, decline, unfriend, invites | the two people involved |
| 0010 `attempt_sharing` | `shared_attempt.link_shared` (private by default), `attempt_recipient`, `attempt_comment`, `can_view_attempt()` | owner and the friends it was sent to |
| 0011 `arrangement_jobs` | `arranger_access` allow-list, `arrangement_job` queue with limits, `claim_arrangement_job()`, private `arrangements` bucket | own jobs; the worker uses the service role |
| 0012 `solo_voicing` | the `solo_ttbb` voicing | — |
| 0013 `guitar_progress` | one row per user: chords cleared, changes bests, strum steps | owner only |
| 0014 `practice_sessions` | `practice_session`; on `shared_attempt`: `session_id`, `self_note`, `rating`, `recording_bytes`; recording budget trigger; `end_practice_session()`, `close_idle_practice_sessions()`, `recording_storage_used()` | owner only; `get_shared_attempt()` hides notes from others |

The progress tables from M2 (`run_through`, `recording`, `lesson_progress`,
`song_pref`) are still unused. `shared_attempt` became the attempt history
instead, because it already held everything a run needs.

### 4.3.2 TypeScript layer (`src/lib`)

New modules, all called from the browser with the user's JWT:

- `friends.ts`: name#tag, find by handle, friend requests, invite links.
- `home.ts`: songs in progress and the latest attempt for Home.
- `practiceSessions.ts`: start, resume and end sessions, list them, save a
  note and rating, delete a recording, storage used.
- `arrangements.ts`: queue an arrangement from a link, poll it, download it.
- `attempts.ts` grew: save privately, send to friends, inbox, comments, attach
  a recording, the tries at a song (`listSongAttempts`), `canViewAttempt`.
- `progress.ts`: guitar progress load, merge and save.

### 4.4 Main data flows (new)

- **Finish an attempt (signed in):** the score, pitch trace and part are saved
  as a private `shared_attempt` row in the current practice session. If "Keep
  recording" is on and the user is under budget, the webm goes to the private
  `recordings` bucket and its size counts against the 100 MB cap.
- **Send to friends:** `attempt_recipient` rows are added; the attempt and its
  recording become readable to those friends, and it appears on their Home.
- **Open an attempt:** fetched through `get_shared_attempt()`, redrawn on the
  viewer's copy of the song, with the owner's notes (owner only), comments,
  and the tries at that song that the viewer is allowed to see.
- **Arrange from a link:** the app inserts an `arrangement_job`; the worker
  claims it, downloads the audio, runs the models, writes the MusicXML to the
  `arrangements` bucket and marks the job done; the app downloads and opens it.

### 4.6 Arranger worker (new)

The only code that runs outside the browser. A Node process in
`worker/arranger/` on a team VM polls `arrangement_job`, uses yt-dlp and
ffmpeg to get the audio, runs the same arranger code as the browser
(`app/src/tabs/vocal/arrange/`) plus Whisper for lyrics, and writes the result
back to Supabase. A 2.5-minute song takes about three minutes on CPU.

It cannot run on Supabase: Edge Functions allow 2 seconds of CPU per request,
256 MB of memory and no native binaries, while one arrangement is minutes of
model inference using ffmpeg and ONNX Runtime. Any host that can run a Node
process (a VM, Fly.io, a GPU job service) can run the same worker unchanged,
because it talks to Supabase only over HTTPS.

## 5. Architecture Rationale (changes)

### 5.1 Scalability

Unchanged for instruments. Practice sessions and attempt history are
instrument-agnostic: Guitar attempts use the same tables, though Guitar does
not yet show sessions.

### 5.2 Real-Time Responsiveness

Unchanged: microphone analysis stays on the device. The arranger is not
real-time, so it is the one place work may run on a server.

### 5.3 Standardization

The arranger's output is MusicXML, so arranged songs flow into the existing
renderer, playback, parts and scoring with no special cases.

### 5.4 Code Leanness

Still no custom API server. Two adjustments:

- **Access control remains in Postgres.** Every new table is row-level secured.
  Friends' access to attempts goes through `can_view_attempt()` and
  security-definer functions, and owner-only feedback is never selected for
  anyone else.
- **One background worker** was added for the arranger, for the reason in
  Section 4.6. It holds no state of its own: the queue, the allow-list and the
  results all live in Supabase.

### 5.5 Storage budget (new)

Supabase's free tier allows 1 GB of file storage, 5 GB of egress a month and
50 MB per file. Scores, traces and notes are small and always kept. Audio is
the only large data, so it is opt-in, capped per user and deletable.

## 6. Known gaps and next steps

- **Private notes and a raw query.** A friend an attempt was sent to could read
  the owner's `self_note` and `rating` with a hand-built database query, because
  0010's recipient policy covers whole rows. The app and RPC never show them.
  Fix: move owner feedback to an owner-only table.
- **Record from an opened attempt.** Opening your own attempt shows its history
  but not the Record button; practising is still done from the song page.
- **Home "Working On" card** should open the song's full history directly.
- **Guitar sessions:** the session code is instrument-agnostic but not wired
  into Guitar yet.
- **Arranger accuracy:** chord recognition on dense rock mixes still confuses
  relative major and minor chords; a separated accompaniment stem or a chord
  model is the next step. The browser path has no lyrics yet.
- **Audio to tab** is an early draft.
- **Confirm email** is off in Supabase auth and must be turned on, with custom
  SMTP, before real users.
