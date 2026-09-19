# Tasks: Backend Services

Priorities follow MoSCoW from requirements.md: (M) must, (S) should, (C) could.
Depends on the Supabase project being provisioned by devops/deployment.

## 1. auth

- [ ] 1.1 (M) Initialize the Supabase JS client from environment config; verify a smoke test reads the auth health/session with no error. (F1)
- [ ] 1.2 (M) Implement email/password registration; verify a new email creates one account and a duplicate returns an "already in use" error (integration test against a test project). (F1)
- [ ] 1.3 (M) Implement login and logout; verify correct credentials establish a session, a wrong password is rejected with a generic error, and logout clears the session (integration test). (F1)
- [ ] 1.4 (M) Persist and restore the session across app reloads; verify a reload before expiry stays authenticated and after logout is unauthenticated (browser test). (F1)
- [ ] 1.5 (M) Enable RLS default-deny on all per-user tables keyed to `auth.uid()`; verify user B cannot read or write user A's rows (automated cross-user test). (F1, N5)

## 2. progress-tracking

- [ ] 2.1 (M) Create `lesson_progress` schema (user_id, node_id, state) with RLS; verify one user's completion is isolated from another (test). (F2)
- [ ] 2.2 (M) Implement completion write + read-back that survives a new session; verify a completed node is still completed after re-login (integration test). (F2)
- [ ] 2.3 (M) Implement prerequisite-based unlock evaluation, including knowledge-only nodes; verify a node unlocks exactly when its last prerequisite clears and stays locked otherwise (unit + integration test on a seeded map). (F2)
- [ ] 2.4 (M) Create `run_through` schema (user_id, song_id, score, timestamp) with RLS; verify an attempt is appended and only the owner's attempts are returned (test). (F22)
- [ ] 2.5 (M) Implement last-score retrieval per song; verify the newest attempt's score is returned and a newer attempt replaces it (test). (F22)
- [ ] 2.6 (S) Create `song_pref` tempo store; verify a per-song tempo in 50–100% persists across sessions, is independent per song, and out-of-range values are rejected (test). (F37)

## 3. song-storage

- [ ] 3.1 (M) Create `song` schema + private-vs-public ownership model and a seed migration inserting the 3 V1 songs with notation file references; verify an authenticated user lists all 3 and cannot modify a seed song (test). (F9, F4)
- [ ] 3.2 (S) Implement MusicXML import to a user-owned song; verify a valid file creates a renderable song and an invalid file is rejected with the library unchanged (integration test). (F9)
- [ ] 3.3 (C) Implement best-effort MuseScore/MIDI transformation to renderable notation; verify a convertible file is stored and an unconvertible file reports failure without corrupting the library (test). (F10)
- [ ] 3.4 (M) Create the private recordings Storage bucket + `recording` rows linked to `run_through`, with RLS and owner-only signed URLs; verify the owner retrieves a recording from its summary and a non-owner (and unauthenticated request) is denied. (F23, N5)
- [ ] 3.5 (S) Store recordings compressed rather than raw PCM; verify an uploaded recording is stored compressed and is materially smaller than the uncompressed equivalent. (N3)

## 4. cross-capability verification

- [ ] 4.1 (M) End-to-end privacy test across auth + progress-tracking + song-storage: a second authenticated user cannot read any of the first user's progress rows, run-through scores, or recording URLs. (F1, N5)
