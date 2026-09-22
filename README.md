# Harmonic

Music-learning PWA (CSE 416) — "Learn the instrument and the language at the
same time." This repo holds the **frontend** (`app/`, React + Vite PWA) and
the **backend layer** (Supabase: auth, song storage + recordings, progress)
from the OpenSpec change `add-backend-services`. Specs live under `openspec/`.

Supabase project: [`mxfclxntqbeznbubfmwa`](https://supabase.com/dashboard/project/mxfclxntqbeznbubfmwa)

## Layout

```
app/              React + Vite PWA (Guitar / Vocal tabs); imports the backend
                  layer as `@backend/<module>` (alias to ../src/lib)
src/lib/          Supabase client + auth / progress / songs modules
supabase/
  migrations/     schema, RLS policies, storage buckets, seed songs (catalog)
  seed/notation/  MusicXML for the catalog songs (uploaded to the bucket)
tests/
  backend/        integration tests against a Supabase project (vitest)
  fixtures/       MIDI + MusicXML corpus shared by backend and app tests
  audio/          client-side audio spikes (pitch detection, enunciation)
.github/workflows/ci.yml   CI (backend typecheck+tests, app lint+test+build),
                           CD (db push on main)
```

## Frontend (app/)

```
cd app
cp .env.example .env.local     # optional: enables sign-in + cloud library
npm install
npm run dev                    # http://localhost:5173
npm test                       # converter / import / export unit tests
```

The Vocal tab opens MIDI, MusicXML and MXL files (built-in list from
`app/public/midi-files/`, or upload), renders them with OpenSheetMusicDisplay,
plays them with Tone.js in sync with the cursor, exports MusicXML/MIDI, and —
when signed in — shows the shared song catalog, lets you copy catalog songs
or save your own files to your cloud library (stored as MusicXML in the
private `notation` bucket).

## Setup

1. `npm install`
2. `cp .env.example .env.local` and paste the **anon public** key from
   [Settings → API](https://supabase.com/dashboard/project/mxfclxntqbeznbubfmwa/settings/api).
3. Apply the migrations (one-time, either way):
   - **SQL editor:** paste `supabase/migrations/0001_init.sql`, then
     `0002_seed_songs.sql`, into the
     [SQL editor](https://supabase.com/dashboard/project/mxfclxntqbeznbubfmwa/sql/new) and run.
   - **CLI:** `brew install supabase/tap/supabase`, then `supabase login`,
     `supabase link --project-ref mxfclxntqbeznbubfmwa`, `supabase db push`.
4. For the integration tests to pass: in
   [Auth → Sign In / Up](https://supabase.com/dashboard/project/mxfclxntqbeznbubfmwa/auth/providers),
   turn **Confirm email OFF** (dev/test convenience; revisit before launch).
5. Upload the catalog notation files to the `notation` bucket under `seed/`
   (paths listed in `0002_seed_songs.sql` / `0003_seed_catalog.sql`):
   ```
   for f in supabase/seed/notation/*.musicxml; do
     supabase storage cp "$f" "ss:///notation/seed/$(basename "$f")" --experimental
   done
   ```
   `house-of-the-rising-sun.musicxml` has no source file yet; the app lists
   that seed song as "notation missing" until one is uploaded.

## Test

```
npm test              # unit tests always run; backend tests skip without .env.local
npm run test:backend  # just the Supabase integration suite
```

## CI/CD (GitHub Actions)

- **CI** — every PR and push to `main`: `tsc --noEmit` + `vitest run`.
  Add repo secrets `SUPABASE_URL` / `SUPABASE_ANON_KEY` (ideally a separate
  test project) to run the integration suite in CI.
- **CD** — on merge to `main`: `supabase db push` applies any new files in
  `supabase/migrations/` to the live project. Needs secrets
  `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`.
- Frontend hosting (Vercel/Netlify/Pages) comes later with the
  `add-devops-infrastructure` change.

## Architecture rules (non-negotiable)

- All real-time audio analysis is **client-side**; live mic audio never
  reaches Supabase. Only scores/progress and optional **compressed**
  recordings leave the device.
- RLS default-deny on every per-user table; recordings bucket is private with
  owner-only signed URLs. Seed songs are readable by all authenticated users,
  writable by none.
- No custom Node/Express server in V1.
