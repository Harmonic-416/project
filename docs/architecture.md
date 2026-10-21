# Harmonic — architecture

Status: current as of 2026-10-21 (`main`). Owner: whole team. This is the
"boxes and arrows" document for the rubric; the requirement-by-requirement
design lives in `openspec/` and the capacity plan in `docs/scaling-plan.md`.

## At a glance

Harmonic is an installable web app (React + Vite PWA) with two instruments.
**Vocal** turns any MIDI, MusicXML or MXL file into sheet music you can hear
and sing against: the pitch you sing is drawn on the staff as coloured dots
and each note of your part is marked sung or missed. **Guitar** tunes the
guitar, teaches six open chords and checks by ear that you played the chord
it asked for, and shows guitar songs as tab plus standard notation.

**Almost everything happens on the device.** Rendering, playback, microphone
analysis and scoring run in the browser; live audio is never uploaded, and
songs you open (your own files) are never uploaded either (copyright).
Supabase is the only backend service, used for:

| What | Why it needs the server | Sign-in? |
|---|---|---|
| **Attempts** (saved, shared by link or to friends, comments) | your history follows you; a friend's phone has to open it | yes |
| **Practice sessions** and your notes on each attempt | history across devices | yes |
| **Friends** (name#tag, invites) | other people | yes |
| **Guitar progress** | lessons follow the account | yes, optional |
| **Online catalog** (read-only) | a handful of public-domain songs the team curates | no |
| **Arrangement jobs** (queue + results) | hands a YouTube link to the arranger worker | yes, team allow-list |

**One job runs on a machine of our own:** arranging a song from a YouTube
link. It is minutes of machine-learning inference per song, which no part of
Supabase or Vercel can run (Section 5 explains why, with measurements). It
runs on a VM, talks to Supabase only over HTTPS, and keeps no state of its own.

## 1. System overview

```mermaid
flowchart TB
    subgraph DEVICE["ON THE DEVICE · React 19 + Vite PWA · installable, works offline"]
        direction LR
        MIC["Microphone<br/>analysed in the browser<br/>live audio never uploaded"]
        VOCAL["Vocal tab<br/>sheet music · practice modes<br/>sessions · attempt history<br/>arrange from a file"]
        GUITAR["Guitar tab<br/>songs · learn · exercises<br/>fretboard · tuner"]
        HOME["Home · Social<br/>continue practice · working on<br/>friends · my files"]
        LOCAL[("Browser storage<br/>IndexedDB: your song files<br/>localStorage: settings")]
        MIC --> VOCAL & GUITAR
        HOME --> LOCAL
    end

    subgraph API["src/lib · TypeScript that runs in the browser · no API server of our own"]
        direction LR
        ATTLIB["attempts.ts<br/>practiceSessions.ts"]
        SOCLIB["friends.ts · home.ts"]
        ARRLIB["arrangements.ts<br/>queue a link · poll · download"]
        OTHERLIB["auth.ts · songs.ts<br/>progress.ts"]
    end

    subgraph SUPA["SUPABASE (managed) · Postgres with row-level security · Auth · Storage"]
        direction LR
        ATT[("shared_attempt · practice_session<br/>attempt_comment · attempt_recipient")]
        REC[("recordings bucket<br/>webm, 100 MB per user")]
        SOC[("profiles · friendship")]
        CAT[("song catalog<br/>read-only")]
        JOB[("arrangement_job queue<br/>arranger_access allow-list<br/>arrangements bucket")]
        GP[("guitar_progress")]
    end

    subgraph VM["ARRANGER WORKER · Node 22 on a Proxmox VM · 16 vCPU · 15 GB RAM"]
        WORKER["worker/arranger<br/>yt-dlp · ffmpeg · ONNX Runtime · TensorFlow.js<br/>same arranger code as the browser"]
    end

    YT(["YouTube"])
    LRC(["LRCLIB<br/>published lyrics"])

    VOCAL --> ATTLIB & ARRLIB
    HOME --> ATTLIB & SOCLIB
    GUITAR --> ATTLIB & OTHERLIB
    ATTLIB --> ATT & REC
    SOCLIB --> SOC
    OTHERLIB --> CAT & GP
    ARRLIB --> JOB
    WORKER -- "poll + claim a job,<br/>upload the MusicXML" --> JOB
    WORKER -- "download audio" --> YT
    WORKER -- "look up lyrics" --> LRC

    classDef server fill:#fff4e5,stroke:#d08a2c,color:#3d2a10
    class VM,WORKER server
```

Arrows are runtime calls. The orange box is the only code that runs outside
the browser (Section 5). Deploy is not a runtime part: on every push
to `main`, GitHub Actions lints, type-checks, tests and builds, applies the
Supabase migrations (`supabase db push`) and deploys the static build to
Vercel, which serves the PWA (details in `docs/deploy.md`). Every call
to Supabase goes through `src/lib` with the user's JWT; row-level security
in Postgres is what enforces who may read or write what.

## 2. Vocal tab

```mermaid
flowchart LR
    subgraph IN["Pick a song"]
        BUILTIN["Built-in<br/>public/midi-files"]
        UPLOAD["Your file<br/>MIDI · MusicXML · MXL<br/>stays on the device"]
        CATALOG["Online catalog<br/>public-domain MusicXML"]
    end

    LOAD["loadNotation<br/>MIDI → MusicXML (lyrics, voice parts)<br/>MXL unzip · SHA-256 fingerprint"]
    PARTS["Part picker<br/>by myself / with the others"]
    OSMD["Sheet music<br/>OpenSheetMusicDisplay"]
    MODEL["Score model<br/>expected notes · one clock"]
    PLAY["Tone.js playback<br/>cursor in lockstep"]

    subgraph MODES["Practice modes"]
        LISTEN["Listen<br/>+ Record attempt"]
        WAIT["Wait for me<br/>holds until you sing the note"]
        TROUBLE["Trouble spots<br/>missed notes turn red"]
    end

    MIC["Mic → pitchy<br/>~50 pitch frames / s"]
    RESULT["Attempt result<br/>coloured dots on the staff<br/>notes sung (green) / missed (red)<br/>% in tune · webm recording"]
    OUT["Export MusicXML / MIDI<br/>Download recording<br/>Share attempt → section 4"]

    BUILTIN & UPLOAD & CATALOG --> LOAD --> PARTS --> OSMD --> MODEL
    MODEL --> PLAY --> MODES
    MIC --> MODES
    LISTEN --> RESULT --> OUT
```

Dot colours: green in tune (within 50¢), yellow close (within a semitone),
blue right note in another octave, red wrong note, grey during a rest.

## 3. Guitar tab

```mermaid
flowchart LR
    MIC["Mic"] --> CAP["Shared capture<br/>AudioWorklet sees every sample<br/>frames · level · strum onsets"]
    CAP --> TUNER["Tuner<br/>pitchy → nearest string<br/>cents off · in-tune hold"]
    CAP --> DETECT["Chord check<br/>FFT → chroma → match the expected chord<br/>heard it · something else · too quiet"]

    subgraph PRACTICE["Chord practice · Em · Am · C · G · D · E"]
        LEARN["Learn<br/>one chord at a time<br/>hint · skip · retry"]
        PASS["Practice<br/>pass it to unlock the next chord"]
        PLAYRUN["Play<br/>Em → C → G → D, 10 s each<br/>countdown · end score"]
    end

    DETECT -- "live verdict lights the result" --> PRACTICE
    TAPS["Result buttons<br/>runs still advance on taps"] --> PRACTICE
    HINT["Hint<br/>Tone.js strums the chord<br/>mic muted meanwhile"] --> LEARN
    PRACTICE --> UNLOCKS[("Unlocks<br/>localStorage")]

    subgraph EXERCISES["Exercises · ear training · no mic"]
        EAR["Major or minor? · Which chord?<br/>plucked-string strum · note by note<br/>10 questions · chord shape after each"]
    end

    subgraph SONGS["Songs · lazy-loaded"]
        GFILE["Built-in or your file<br/>Guitar Pro · alphaTex · MusicXML · MXL · MIDI"]
        ALPHA["alphaTab<br/>tab + standard notation<br/>alphaSynth playback · click to seek"]
        GEXP["Export MIDI / Guitar Pro 7"]
        GFILE --> ALPHA --> GEXP
    end
```

Nothing in the Guitar tab talks to the server.

## 4. Sharing an attempt

```mermaid
sequenceDiagram
    autonumber
    actor Singer
    participant A as App (singer)
    participant S as Supabase
    participant B as App (friend)
    actor Friend

    Singer->>A: Record attempt, then Share attempt (signed in)
    opt Include my recording
        A->>S: upload webm to recordings/{user}/{id}.webm
    end
    A->>S: insert shared_attempt (trace, score, part, song id or SHA-256)
    S-->>A: id
    A-->>Singer: link /?attempt={id} via share sheet or clipboard
    Singer->>Friend: sends the link
    Friend->>B: opens the link, signs in with Google or GitHub if needed
    B->>S: rpc get_shared_attempt(id)
    S-->>B: the attempt
    alt catalog or built-in song
        B->>B: loads the song by itself
    else the singer's own file
        Friend->>B: opens their own copy, the SHA-256 must match
    end
    B->>S: signed URL for the recording
    B-->>Friend: same dots and green / red notes on the score, plays the recording
```

The song itself is never uploaded: a shared attempt names it by catalog id or
by the SHA-256 of the file, and the friend supplies their own copy. Shares
can't be listed; a row is only readable through `get_shared_attempt(id)` by
someone signed in who has the link, and only the recording attached to a
share becomes readable to others.

## 5. Arranging a song from a link (the one job on our own machine)

The Vocal tab can arrange a song for voices two ways:

- **From an audio file** the user owns: the whole pipeline below runs in the
  browser, on the user's own CPU, and nothing is uploaded.
- **From a YouTube link** (team allow-list): the browser only queues a job.
  The pipeline runs on the **arranger worker**, a Node process on a VM.

Both paths run the **same arranger code** (`app/src/tabs/vocal/arrange/`);
the worker imports it from the app instead of having a copy.

### 5.1 What the worker does with the CPU

```mermaid
flowchart LR
    subgraph SUPA["SUPABASE"]
        Q[("arrangement_job<br/>queued → running → done")]
        B[("arrangements bucket<br/>user/job.musicxml")]
    end

    subgraph VM["ARRANGER WORKER · Proxmox VM · 16 vCPU (QEMU, no AVX) · 15 GB RAM · Node 22"]
        direction TB
        CLAIM["1 · claim_arrangement_job()<br/>polls every 5 s"]
        DL["2 · yt-dlp + ffmpeg<br/>download, decode to 22 kHz stereo<br/><i>native binaries</i>"]
        SEP["3 · Isolate the singer<br/>htdemucs_6s, 55 MB ONNX model<br/>ONNX Runtime (native)<br/><b>40% of the time · ~13 cores · ~4 GB RAM</b>"]
        BP["4 · Melody + chords<br/>Basic Pitch on the vocals and the mix<br/>TensorFlow.js (WebAssembly)"]
        WH["5 · Words<br/>Whisper small, word timestamps<br/>+ published lyrics from LRCLIB<br/><b>up to 30% of the time</b>"]
        BT["6 · Beats and bars<br/>Beat This, ONNX"]
        AR["7 · Write the parts<br/>chord pass in the song's scale,<br/>solo + TTBB / SATB voicing<br/><i>plain JavaScript, under a second</i>"]
        CLAIM --> DL --> SEP --> BP --> WH --> BT --> AR
    end

    YT(["YouTube"])
    Q -- job --> CLAIM
    DL -- audio --> YT
    AR -- "MusicXML" --> B
    AR -- "status: done" --> Q

    classDef heavy fill:#fde2e1,stroke:#c0392b,color:#3d1010
    class SEP,WH heavy
```

```mermaid
sequenceDiagram
    autonumber
    actor U as Singer
    participant A as App (browser)
    participant S as Supabase
    participant W as Arranger worker (VM)
    participant Y as YouTube

    U->>A: paste a YouTube link, pick Solo + TTBB
    A->>S: insert arrangement_job (RLS: only users on arranger_access)
    loop every 5 s
        W->>S: rpc claim_arrangement_job()
    end
    S-->>W: the job (now running)
    W->>Y: yt-dlp downloads the audio
    W->>W: separate, transcribe, find words, beats and chords, write the parts (about 3 min)
    W->>S: progress updates (stage, percent)
    A->>S: poll the job, show progress
    W->>S: upload MusicXML to arrangements/{user}/{job}, status done
    A->>S: signed URL for the result
    A-->>U: opens the arrangement like any other song
```

The worker holds no state: the queue, the allow-list, the limits per user and
the results all live in Supabase. If the worker restarts, it puts its running
job back in the queue and claims it again.

### 5.2 Measured cost of one arrangement

Measured on 2026-10-21 with a 4-minute song ("Let It Be", 243 s of audio),
run at low priority on the VM:

| Stage | Time | Share | What runs |
|---|---|---|---|
| Download and decode | 6 s | 2% | yt-dlp, ffmpeg |
| Isolate the singer | 132 s | 40% | htdemucs_6s on ONNX Runtime, about 13 cores, about 4.1 GB of memory |
| Melody | 41 s | 12% | Basic Pitch on the separated vocals |
| Words | 103 s | 31% | Whisper small (no published lyrics were found for this title) |
| Chords | 40 s | 12% | Basic Pitch on the full mix |
| Beats and bars | 9 s | 3% | Beat This |
| Write the parts | under 1 s | 0% | the arranger itself |
| **Total** | **332 s** | | about 1.4 s of compute per second of song |

Production jobs so far took 189–265 s each for 2.5–3.5-minute songs. The
model files cached on the VM take about 540 MB.

### 5.3 Why a VM, and not Supabase, Vercel or the user's browser

| Need of one arrangement | Supabase Edge Functions | Vercel Functions (Hobby) | User's browser | Our VM |
|---|---|---|---|---|
| CPU: about 3 minutes of near-continuous inference, on many cores | ❌ 2 s of CPU per request, 150 s wall clock (400 s on paid) | ❌ 300 s maximum | ⚠️ works from a file, but slower on a laptop and much slower on a phone; the tab must stay open | ✅ 16 vCPU, no time limit |
| Memory: about 4 GB at peak | ❌ 256 MB | ❌ 2 GB maximum | ⚠️ heavy for a phone | ✅ 15 GB |
| Native programs: yt-dlp, ffmpeg, ONNX Runtime | ❌ Deno sandbox, no binaries or native modules | ❌ 250 MB bundle; models and binaries are about 540 MB | ❌ cannot run them | ✅ installed in the user's home, no sudo |
| Get the audio from YouTube | ❌ cloud IPs are routinely bot-blocked | ❌ same | ❌ the browser cannot fetch YouTube audio (CORS), and the app does not try | ✅ the campus IP resolves formats without a bot check |
| Cost | free tier | free tier | free | free: club hardware we already have |

So Supabase stays what it is good at, the **database, auth, storage and the
queue**, and the one job that needs a real computer runs on one. The
worker's whole interface to the rest of the system is the `arrangement_job`
table and the `arrangements` bucket, over HTTPS with a service-role key.

### 5.4 Limits and how this scales

- **One job at a time.** Jobs queue; a second user waits for the first. The
  allow-list and a daily limit per user (`arranger_daily_limit()`) keep the
  queue short.
- **CPU only.** The VM has no GPU, and its virtual CPU lacks AVX, which is why
  TensorFlow.js runs on WebAssembly instead of its native build. A GPU would
  cut a job from minutes to seconds; the progress bar already has GPU weights.
- **Moving off the VM** needs no code changes: any host that can run Node 22
  with ffmpeg (a cheap VPS, Fly.io, Railway, or a GPU job service such as
  Modal or RunPod) can run `worker/arranger` with the same environment file.
  YouTube access from datacenter IPs is the main risk of moving.
- **Reliability.** The worker runs in a tmux session started by `run.sh`, which
  restarts it if it exits; an `@reboot` cron entry starts it with the VM.

## Components

### Client (`app/`)

React 19 + Vite 8, packaged as a PWA by `vite-plugin-pwa` (Workbox precache,
4 MiB limit; alphaTab and the guitar Songs view are kept out of the precache
and cached on first use).

**Shell and sign-in**

| Module | Responsibility |
|---|---|
| `App.jsx`, `nav/*` | Three tabs (Home, Guitar, Vocal) switched in state, no router. Reads a share link (`/?attempt=<id>`) and keeps the id in `sessionStorage` so it survives the OAuth round trip. |
| `lib/supabaseClient.js`, `auth/*` | One supabase-js client from `VITE_SUPABASE_*` (without `app/.env.local` the app runs local-only); `useSession` mirrors the session into React; sign in with Google or GitHub, link the other provider, sign out. |

**Vocal**

| Module | Responsibility |
|---|---|
| `tabs/vocal/notation/loadNotation.js` | One entry point for every file: detects MIDI / MusicXML / MXL by extension then bytes; MIDI → `midi/midiToMusicXml.js` (quantized, chords, tracks → parts, lyrics, voice-part clefs), MXL unzipped with jszip. Output is always MusicXML. |
| `tabs/vocal/notation/partFilter.js` | Lists parts; builds "your part alone" or "your part on top of the others". |
| `tabs/vocal/components/SheetMusicViewer.jsx` | OpenSheetMusicDisplay in a sideways-scrolling strip; cursor API and per-note marking. |
| `tabs/vocal/notation/scoreModel.js` | Walks OSMD's cursor once and derives notes, cursor timestamps and the playback schedule from the rendered score, so audio, cursor and scoring share one clock. |
| `tabs/vocal/playback/useMidiPlayback.js` | Tone.js `Transport` + `PolySynth`, cursor stepping in lockstep; play / pause / stop / seek. |
| `tabs/vocal/practice/*`, `WaitModePlayer`, `TroubleSpotsPlayer` | Wait for me (hold detector) and Trouble spots (per-note hit / miss), octave-agnostic. |
| `tabs/vocal/audio/*`, `RecordPanel.jsx` | Mic → `AnalyserNode` → pitchy at ~50 frames / s, stamped with the playback clock; dots drawn over the score; `scoreAttempt` (% within 50¢) and per-note sung / missed; `MediaRecorder` webm. |
| `tabs/vocal/songs/cloudLibrary.js`, `OnlineSongs.jsx` | The public catalog (no sign-in); songs are never uploaded. |
| `tabs/vocal/share/*`, `ShareAttempt`, `SharedAttemptGate`, `SharedAttemptPanel` | Sharing (section 4): trace compaction, fingerprints, link parsing; the share button; opening a link (sign in, pick your copy, fingerprint check); redrawing someone else's attempt with their recording. |
| `tabs/vocal/notation/exportNotation.js` | Export MusicXML (or the original MXL) and MIDI. |

**Guitar**

| Module | Responsibility |
|---|---|
| `audio/capture/*` | Shared mic capture: `getUserMedia` → AudioWorklet (`pcm-capture.worklet.js`) → frames every hop, level and strum onsets, positioned in samples. |
| `tabs/guitar/tuner/*` | Tuner (F39): pitchy on capture frames → stabilizer (median of 5, nearest string or a locked one, in tune at ±5¢ held 0.5 s). |
| `tabs/guitar/practice/chordDetect.js`, `useChordDetection.js` | Chord verification (F16): after each strum onset, FFT → chroma vector → cosine match against the six chord templates; verdict `verified` / `wrong` / `silent`. `muteFor` keeps the app from hearing its own hint. |
| `tabs/guitar/practice/PracticeScreen.jsx` + state reducers | Learn, Practice and Play modes, chord diagrams with fret / note / finger labels, string states, hint / skip / retry; unlocks in `localStorage` (`unlocks.js`). Detection lights the result; runs still advance on the result buttons. |
| `tabs/guitar/exercises/*`, `practice/chordSound.js` | Exercises view, ear training (F41): the app strums a chord and you pick it: *Major or minor?*, then *Which chord?* among four; rounds of ten, chord diagram after each answer, compare a wrong pick with the answer. Pure rules in `earTraining.js`; chords (and Hint) play through one `Tone.PluckSynth` per string. No mic, nothing stored. |
| `tabs/guitar/notation/*`, `tabs/guitar/song/*` | Lazy-loaded Songs view: Guitar Pro 3–8 / alphaTex / MusicXML / MXL / MIDI → alphaTab (tab + standard), alphaSynth playback with cursor and click-to-seek, export MIDI and Guitar Pro 7. |

### Backend layer (`src/lib/`)

Framework-neutral TypeScript over supabase-js; the app imports it as
`@backend/*` and the integration tests run the same code in Node.

| File | Functions | Used by the app? |
|---|---|---|
| `auth.ts` | `signInWithProvider`, `logout`, `getSession`; `register` / `login` (email + password) | OAuth + logout yes; email + password only in tests |
| `attempts.ts` | `shareAttempt`, `getSharedAttempt` (RPC), `getSharedRecordingUrl`, `listMySharedAttempts`, `deleteSharedAttempt` | share, open and recording URL yes; list / delete not yet |
| `songs.ts` | `listLibrary`, `getNotationUrl` | yes (catalog) |
| `songs.ts` | `importMusicXml`, `importMidi`, `uploadRecording`, `getRecordingUrl` | no (tests only; uploads are off for copyright) |
| `progress.ts` | lesson completion, unlock evaluation, run-throughs, last score, tempo preference | no (tests only) |

### Supabase

| Table / bucket | Holds | Access (RLS) | Used by the app? |
|---|---|---|---|
| `shared_attempt` | a shared attempt: song (catalog id or file SHA-256), part, pitch trace `[[s, midi], …]`, accuracy, recording path, sharer's name | owner only; anyone signed in reads one row by id via `get_shared_attempt()` | **yes** |
| `recordings` bucket | webm per shared attempt, `<user_id>/<id>.webm` | owner only, plus signed-in read of recordings attached to a share | **yes** |
| `song` (catalog rows) + `notation/seed/` | 6 catalog rows (4 vocal, 2 guitar) over 5 public-domain MusicXML files | readable by anyone | **yes** (read-only) |
| `profiles` | one row per user (trigger-created) | owner | created on sign-up only |
| `song` (user rows) + `notation/<user_id>/` | users' own songs | owner | no (only test users have any) |
| `lesson_progress`, `run_through`, `song_pref`, `recording` | progress, attempts history, tempo, recording metadata | owner | no |

Migrations `0001` (schema, RLS, buckets), `0002`–`0003` (catalog rows),
`0004` (public catalog, owner-only song files), `0005` (shared attempts) are
applied by CI with `supabase db push`; catalog MusicXML lives in
`supabase/seed/notation/` and is uploaded with `supabase storage cp`.

## Decisions and constraints

- **Local-first, server only for sharing.** Everything that can run on the
  device does; the one thing that can't — a link that works on someone
  else's phone — is the one thing the app writes to the server.
- **No song uploads (copyright).** Your files stay on your device. A shared
  attempt names its song by catalog id or file fingerprint; the catalog holds
  only public-domain songs the team curates.
- **All real-time audio stays on the device.** Latency and privacy; only a
  shared attempt's compressed webm is uploaded, and only when you ask.
- **RLS is the API.** No custom server: the browser talks to Supabase with
  the user's JWT, and Postgres policies decide access. Shares are unlisted
  (read by id through a security-definer function).
- **Timing comes from the rendered score.** Playback, cursor and pitch
  scoring all use the score model OSMD rendered, whatever the input format.
- **One renderer per instrument.** OSMD for voice (its cursor gives the
  timing model); alphaTab for guitar (the only one that draws tab, and it
  plays and exports what it renders).
- **AudioWorklet capture for guitar.** Strum onsets open the chord-check
  window; polling an `AnalyserNode` per animation frame can miss them. Vocal
  still uses the `AnalyserNode` path and can move over later.
- **Two npm packages, one repo.** Backend layer and its tests at the root,
  PWA in `app/` importing it through the `@backend` alias. CI runs both.

## Testing

| Layer | Where | What | Runs |
|---|---|---|---|
| Unit (app) | `app/tests/*.test.js` | MIDI → MusicXML over the shared corpus, lyrics, parts, format detection, exports; pitch detection, attempt scoring, practice modes; shared-attempt traces, fingerprints, links; capture framing and onsets; tuner; chord detection on synthetic strums; guitar practice / play / unlock reducers; guitar import and exports | every PR (CI) |
| Integration (backend) | `tests/backend/*.test.ts` | auth, RLS isolation, public catalog, shared attempts (share, open by id, recording access, unlisted, unshare), progress, imports | with `SUPABASE_URL` / `SUPABASE_ANON_KEY` set (locally; CI has no test project yet, so they skip there) |
| Browser | manual / scripted headless Chrome with a synthetic microphone | sing an attempt, share, open as another user (catalog, built-in, own file with fingerprint check) | on demand |
| Load | `tests/load/supabase-baseline.mjs` | latency and throughput of the live project | on demand, see `docs/scaling-plan.md` |

## Repository map

```
app/                       React + Vite PWA (the client)
  src/tabs/vocal/          notation/ midi/ playback/ practice/ audio/ share/ songs/ components/
  src/tabs/guitar/         tuner/ practice/ (chord check) notation/ song/ (alphaTab, lazy)
  src/audio/capture/       shared AudioWorklet mic capture
  src/auth/, src/lib/      session hook, sign-in and account cards, supabase client
  public/midi-files/       built-in vocal songs
  public/guitar-songs/     built-in guitar songs
  tests/                   unit tests (vitest)
src/lib/                   backend layer (TypeScript, supabase-js)
supabase/migrations/       schema, RLS, buckets, catalog rows, sharing (applied by CI)
supabase/seed/notation/    catalog MusicXML
tests/backend/             integration tests against a Supabase project
tests/fixtures/            MIDI + MusicXML corpus shared by both suites
tests/load/                capacity baseline script
docs/                      this file, scaling-plan.md, deploy.md, M2-design-and-setup.md
openspec/                  requirement-linked specs, proposals, design notes
.github/workflows/ci.yml   CI (lint, typecheck, test, build) and CD (db push, Vercel deploy)
```

## Known gaps

- **Guitar:** chord detection shows its verdict, but Learn / Practice / Play
  still advance on the result buttons; no strumming-pattern or timing score
  yet; MIDI files open without tab (no fret assignment); guitar songs can't
  be shared.
- **Vocal:** the pitch-dot overlay assumes a treble staff, so on the bass and
  tenor (treble-8vb) staves MIDI imports now get, the dots sit at the wrong
  height; no microphone latency compensation; timewise MusicXML is rejected (partwise only).
- **Sharing:** no "stop sharing" button yet (`deleteSharedAttempt` exists);
  sharing only from Listen mode; the recording isn't synced to the cursor.
- **Progress** (unlocks, run-through history, tempo) isn't saved to the
  server; guitar unlocks live in one browser only.
- **Backend tests don't run in CI** until a dedicated test Supabase project's
  URL and key are added as secrets.
- The tuner, chord check and capture worklet are verified in desktop Chrome;
  the iPhone Safari check is still to do.
