# M2 — Design and Setup (10%)

Milestone rubric and where Harmonic stands against it. Current as of
**2026-09-30** (`main`, deployed at **https://harmonic-vert.vercel.app**).

| Rubric item | Status | Where |
|---|---|---|
| **Architecture** — boxes and arrows (clients, APIs, data, jobs) | ✅ Done | Figures 1–4 below; full write-up in [`docs/architecture.md`](architecture.md) |
| **Stack** — what + one-sentence why | ✅ Done | [Stack](#stack-one-sentence-why-each) |
| **Clonable repo with CI skeleton** (lint / test / build) | ✅ Done | `.github/workflows/ci.yml`: `backend` (oxlint, `tsc`, vitest) and `app` (oxlint, vitest, `vite build`) on every PR; on `main` also `migrate` (`supabase db push`) and `deploy` (Vercel). Locally `npm run ci` |
| **Minimal prototype that runs** | ✅ Deployed | https://harmonic-vert.vercel.app — Vocal: sheet music, playback, practice modes, pitch dots, notes sung / missed, share an attempt. Guitar: tuner, chord practice with chord check by ear, tab songs. Tests: 170 app + 37 backend (against the live Supabase project) |
| **Design doc connected to requirements** | ✅ Done | [`Harmonic-design-doc.md`](../Harmonic-design-doc.md); `openspec/` ties each requirement to its F#/N# id in the [specifications repo](https://github.com/Harmonic-416/specifications/blob/main/2-scope/requirements.md) |

**In one line:** everything runs on the device; the server is only used to
**share an attempt**, to **sign in** (Google / GitHub, needed only to share),
and to read a small **public-domain catalog**. Songs are never uploaded
(copyright).

## Figure 1 — System overview

```mermaid
flowchart TB
    subgraph DEVICE["ON THE DEVICE · React 19 + Vite PWA · installable, works offline"]
        direction LR
        MIC["Microphone<br/>analysed in the browser<br/>live audio never uploaded"]
        VOCAL["Vocal tab<br/>sheet music · playback<br/>practice modes · pitch dots"]
        GUITAR["Guitar tab<br/>tuner · chord practice<br/>tab songs"]
        SHELL["App shell<br/>Home · sign-in card<br/>service worker"]
        LOCAL[("Browser storage<br/>session · guitar unlocks<br/>built-in songs · your files")]
        MIC --> VOCAL & GUITAR
        GUITAR --> LOCAL
    end

    subgraph API["src/lib · TypeScript SDK that runs in the browser · no server code of our own"]
        direction LR
        ATTLIB["attempts.ts<br/>share · open · recording URL"]
        SONGSLIB["songs.ts<br/>catalog list · signed URLs"]
        AUTHLIB["auth.ts<br/>Google / GitHub sign-in"]
        IDLEAPI["progress.ts · song imports<br/>built and tested, not called"]
    end

    subgraph SUPA["SUPABASE (managed) · sharing, sign-in, read-only catalog"]
        direction LR
        SHARED[("shared_attempt<br/>pitch trace · score · part<br/>song = catalog id or SHA-256")]
        REC[("recordings bucket<br/>webm of shared attempts")]
        CAT[("Catalog, read-only<br/>public-domain songs<br/>4 vocal · 2 guitar")]
        GOTRUE["Auth<br/>OAuth → JWT"]
        IDLEDB[("progress tables · users' songs<br/>exist, unused")]
    end

    VOCAL -- "share / open an attempt" --> ATTLIB
    VOCAL -- "browse catalog" --> SONGSLIB
    SHELL -- "sign in" --> AUTHLIB
    ATTLIB --> SHARED & REC
    SONGSLIB --> CAT
    AUTHLIB --> GOTRUE
    IDLEAPI -.- IDLEDB

    classDef idle fill:#f3f3f3,stroke:#9a9a9a,stroke-dasharray:4 3,color:#6c6a72
    class IDLEAPI,IDLEDB idle
```

Grey dashed boxes exist in code and database but the app doesn't call them.

## Figure 2 — Vocal tab

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

Dot colours: green in tune, yellow close, blue other octave, red wrong, grey rest.

## Figure 3 — Guitar tab

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

    subgraph SONGS["Songs · lazy-loaded"]
        GFILE["Built-in or your file<br/>Guitar Pro · alphaTex · MusicXML · MXL · MIDI"]
        ALPHA["alphaTab<br/>tab + standard notation<br/>alphaSynth playback · click to seek"]
        GEXP["Export MIDI / Guitar Pro 7"]
        GFILE --> ALPHA --> GEXP
    end
```

Nothing in the Guitar tab talks to the server.

## Figure 4 — Sharing an attempt (the only server write)

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

## Data model (Supabase)

RLS on every table: a user only reaches rows where `user_id = auth.uid()`,
except where noted. Migrations `0001`–`0005`, applied by CI.

| Table / bucket | Holds | Access | Used by the app |
|---|---|---|---|
| `shared_attempt` | pitch trace, score, part, song (catalog id or SHA-256), optional recording path | owner; any signed-in user opens one by id via `get_shared_attempt()` | ✅ sharing |
| `song` + `notation/seed/` | 6 public-domain catalog songs (MusicXML) | anyone, read-only | ✅ catalog |
| `recordings` bucket | webm of shared attempts | owner; readable by signed-in users only when attached to a share | ✅ sharing |
| `profiles` | one row per user (sign-up trigger) | owner | ✅ |
| `run_through`, `recording`, `lesson_progress`, `song_pref` | history, recordings, unlocks, tempo | owner | ⬜ built and tested, not called |

## Stack (one sentence why, each)

- **React 19 + Vite, PWA (vite-plugin-pwa / Workbox)** — installable, works offline, fastest iteration loop; heavy parts load on first use.
- **OpenSheetMusicDisplay** (voice) — renders MusicXML, and its cursor is the single clock for playback, cursor and scoring.
- **alphaTab** (guitar) — the only web renderer that draws tab; plays (alphaSynth) and exports MIDI / Guitar Pro; lazy-loaded.
- **Tone.js + @tonejs/midi + jszip** — voice playback clock and synth, MIDI import / export, MXL unzip.
- **pitchy on Web Audio** — client-side pitch tracking, so live audio never leaves the device.
- **AudioWorklet capture** — sees every mic sample, so strum onsets aren't missed; feeds the tuner and the chord check.
- **Supabase (Postgres + Auth + Storage)** — sign-in, sharing and the catalog with no server code of our own; security is row-level security in the database.
- **GitHub Actions + Supabase CLI + Vercel** — CI on every PR; on `main`, migrate then deploy.

## Not done yet

- Lesson map (F2/F3) — shelved.
- Progress and run history are not saved (backend ready, `progress.ts` unused); guitar unlocks live in `localStorage`.
- Guitar runs still advance on the result buttons; per-string feedback isn't wired to the chord check.
- Real iPhone Safari test (N2) and latency measurement (N1).
- "Save PDF" of an attempt exists only on branch `feat/share-attempts` (demo: https://harmonic-share.vercel.app), not on `main`.
