# Design: Backend Services

## Context

Harmonic's backend is Supabase only (Postgres + Auth + Storage), consumed through the Supabase JS SDK / auto-generated REST API — see proposal.md for motivation. No custom server, no server-side audio. The three backend capabilities (`auth`, `progress-tracking`, `song-storage`) are not independent silos: they share one Postgres schema anchored on the authenticated account and one privacy posture (RLS, private Storage). Those cross-capability facts are pinned here so each capability's spec stays behavior-only. The Supabase project itself (URL, keys, buckets, migrations) is provisioned by devops/deployment; this change assumes it exists.

## Goals / Non-Goals

- **Goal:** one coherent, account-anchored data model that no single capability owns alone.
- **Goal:** private-by-default for all per-user rows and files, enforced at the database, not just the client.
- **Non-Goal:** choosing the stack (locked: Supabase) or writing table DDL line by line — specs describe observable behavior; migrations are an implementation task.
- **Non-Goal:** any social/multi-user sharing model (single-player V1).

## Decisions

### Shared data model (account-anchored)

One schema; every per-user table carries a `user_id` foreign key to the Supabase Auth user (`auth.users`):

- **account** — identity in Supabase Auth (`auth.users`); an optional `profiles` row holds app-level fields. The anchor, owned by `auth`.
- **song** — library metadata + a pointer to the notation file in Storage; owned by `song-storage`. Seeded with 3 songs and the destination for MusicXML import. Seed/public songs have a null `user_id` (readable by all authenticated users); imported songs carry the importer's `user_id`.
- **lesson_progress** — per-user, per-node completion + unlock state; owned by `progress-tracking`.
- **run_through** — per-user attempt history; retains `last_score` per song and per-attempt scores; may reference a recording; owned by `progress-tracking`.
- **song_pref** — per-user, per-song tempo preference (50–100%); owned by `progress-tracking`, read by notation-rendering.
- **recording** (Storage bucket + row) — compressed attempt audio, private, linked to a `run_through`; owned by `song-storage`.

**Why account-anchored over device-local:** F1 requires cross-session per-user progress; a device-local store fails the moment the browser is cleared — the exact "lost my first week" failure the product avoids.

### Privacy / RLS posture (shared)

Every per-user table has RLS enabled with policies of the form "row visible/writable only when `auth.uid() = user_id`." The recordings bucket is private; access is via short-lived signed URLs minted only for the owning user. Public/seed songs are the deliberate exception: readable by any authenticated user, writable by none through the client. This posture satisfies N5 (recordings private by default) and keeps F26 (sharing) impossible by construction until a future change adds it.

### Results-only-to-server boundary

Live mic PCM and analyzer events never reach Supabase (architecture rule / N1). Only derived results (scores, progress, unlock state) and optional compressed recordings (N3) are persisted. This keeps the backend a pure CRUD layer and is why `progress-tracking` stores scores it receives, not audio it analyzes.

### Import / transform pipeline placement

MusicXML import (F9) and MuseScore/MIDI transform (F10) produce a renderable notation artifact stored as a `song`. AlphaTab consumes MusicXML directly, so MusicXML is the canonical stored form; MuseScore/MIDI are converted to it best-effort on import. Conversion is client-side or edge, but the *stored outcome* — a song row + notation file — is what `song-storage` guarantees.

## Risks / Trade-offs

- **[Risk] RLS misconfiguration leaks another user's recordings/scores.** → Enable RLS default-deny on every per-user table at creation; verify with an automated test that a second user cannot read the first user's rows or signed URLs before shipping.
- **[Risk] Best-effort MuseScore/MIDI transform fails on some files.** → F10 is a "could"; import fails gracefully with a clear message and never corrupts the library.
- **[Risk] Recording storage cost/quota.** → Compress before upload (N3); cap length/bitrate; recordings are optional to a summary.
- **[Risk] Session expiry mid-practice loses an unsaved run.** → Persist run results at run end via an authenticated session; surface a re-auth prompt without discarding the in-memory result.

## Migration Plan

Greenfield: initial Supabase migration creates all tables, RLS policies, and the private recordings bucket; a seed migration inserts the 3 V1 songs. Rollback = drop the migration (no production data yet). Migration authoring and deploy are owned by devops/deployment; this change specifies the required behavior.

## Open Questions

- Exact compression codec/bitrate for recordings (N3) — deferred to audio-pipeline/devops measurement on real hardware; does not change the CRUD contract here.
