# Proposal: Backend Services (Supabase)

## Why

Every per-user promise Harmonic makes — progress that survives closing the app, a lesson map that remembers what was cleared, a run-through's last score and recording returning on the next visit — needs a durable home. Supabase (Postgres + Auth + Storage) provides auth, CRUD, and private file storage out of the box, so there is no custom server to build or operate. This change defines what that thin backend must guarantee so the frontend keys data to a real account from day one instead of a local store that erases a beginner's first week when the browser is cleared.

## What Changes

- Add Supabase-backed **authentication and sessions**: email/password registration, login, logout, and a persisted session that anchors every per-user row (F1).
- Add **progress persistence and lesson-unlocking rules**: per-user completion state, an unlocking map where a node (including knowledge-only nodes) opens once its prerequisites clear, and run-through history retaining the last score per song (F2, F22).
- Add **per-song tempo-preference persistence** (50–100%) so the notation-rendering tempo control (F37) survives across sessions; the UI control is owned by notation-rendering.
- Add a **song library** seeded with 3 songs, **MusicXML import**, and best-effort **MuseScore/MIDI transformation** into a renderable form (F4 seed data, F9, F10).
- Add **attempt-recording storage**: compressed audio blobs (N3) stored private-by-default via Supabase Storage with row-level security, attached to their run-through summary (F23, N5).
- Establish the **shared Supabase data model** (accounts → progress/scores/recordings/songs) and the RLS posture making all per-user data private by default.

No breaking changes — greenfield project with no existing app code.

## Capabilities

### New Capabilities

- `auth`: Supabase-backed registration, login, logout, and session management; the authenticated account anchors all per-user data.
- `progress-tracking`: per-user progress persistence, the unlocking lesson map with prerequisite-clear rules, run-through history with last score per song, and per-song tempo-preference persistence.
- `song-storage`: song library (3 seed songs), MusicXML import and best-effort MuseScore/MIDI transformation, and private-by-default compressed attempt-recording storage.

### Modified Capabilities

(none — greenfield)

## Impact

- **New dependency:** a Supabase project (Postgres, Auth, Storage) provisioned by the devops/deployment area; this change consumes it via the Supabase JS SDK.
- **Data model:** account, progress, run-through/score, song, and recording tables plus a private Storage bucket, all governed by RLS.
- **Downstream consumers:** `ui` reads the lesson map and run-through summaries; `notation-rendering` reads song notation and the persisted tempo preference; run-through summaries read back recordings.
- **Client contract:** only results (scores/progress) and optional compressed recordings leave the device — never live mic audio (architecture rule).

## Non-goals

Drawn from the v1-scope OUT list; none belong to this backend area:

- **No group/social/collaboration backend (F26):** no shared files, group sessions, collaborators, or multi-instrument-song data model. V1 is single-player; RLS scopes every row to one account.
- **No computer-vision data (F25):** no camera/finger-placement storage or schema.
- **No YouTube play-along data (F27).**
- **No "Changes" mode data (F38, W/next version).**
- **No piano data** (V1 is guitar + voice only).
- **No custom Node/Express server or server-side audio processing** — all real-time analysis is client-side; the backend never receives live mic streams.
- **No full-song / large-media hosting beyond the 3 seed songs and per-attempt recordings.**
