# Harmonic

Music-learning PWA (CSE 416) — "Learn the instrument and the language at the
same time." This repo currently holds the **backend layer** (Supabase: auth,
song storage + recordings, progress) from the OpenSpec change
`add-backend-services`. Specs live in the main repo under `openspec/`.

Supabase project: [`mxfclxntqbeznbubfmwa`](https://supabase.com/dashboard/project/mxfclxntqbeznbubfmwa)

## Layout

```
src/lib/          Supabase client + auth / progress / songs modules
supabase/
  migrations/     schema, RLS policies, storage buckets, seed songs
tests/
  backend/        integration tests against a Supabase project (vitest)
  audio/          client-side audio spikes (pitch detection, enunciation)
.github/workflows/ci.yml   CI (typecheck + tests) and CD (db push on main)
```

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
5. Upload the 3 seed MusicXML files to the `notation` bucket under `seed/`
   (paths listed in `0002_seed_songs.sql`).

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

## Capacity and scaling

`docs/scaling-plan.md` holds the load model, the service-level targets, the
measured baseline, the plan limits that matter, the triggers for moving up a
tier or off Supabase, and the migration runbook. Re-measure with

```
node tests/load/supabase-baseline.mjs   # ~1.5k requests, one throwaway user, cleans up after itself
```

## Architecture rules (non-negotiable)

- All real-time audio analysis is **client-side**; live mic audio never
  reaches Supabase. Only scores/progress and optional **compressed**
  recordings leave the device.
- RLS default-deny on every per-user table; recordings bucket is private with
  owner-only signed URLs. Seed songs are readable by all authenticated users,
  writable by none.
- No custom Node/Express server in V1.
