# Scaling plan: how far Supabase takes us, and what happens after

Status: proposal, 2026-09-22. Owner: backend. Re-check the numbers each time
the compute tier, the plan, or the recording policy changes.

## 1. What the cloud actually does for Harmonic

The architecture rule that matters most for scale is already in place: all
audio analysis, notation rendering and playback run on the phone. The cloud
only sees small rows and small files.

| Path | What crosses the network | Typical size |
|---|---|---|
| Open the app | `getSession` (local storage), `select song` (library), `storage.list('seed')` | 1–3 requests, a few KB |
| Open a song | `createSignedUrl` + one GET from the storage CDN | MusicXML 3–25 KB |
| Finish an attempt | `insert run_through` | one row |
| Keep the recording (optional) | `storage.upload` + `insert recording` | webm/opus ≈ 3.5 KB/s → ~50 KB per 15 s, ~600 KB per 3-minute song |
| Progress / tempo pref | one upsert each | one row |
| Sign up / sign in | Auth endpoints | rare; rate-limited per IP |

A 20-minute practice session is therefore roughly 15–30 requests and about
100 KB of notation egress. If every attempt's recording is kept, the same
session adds 0.3–3 MB of ingress and the same again in egress when it is
replayed. **Recordings are the only thing in the system that grows fast.**

## 2. Load targets: what we should be able to hold

| Tier | When | Registered / MAU | Concurrent peak | Sessions per week | Sustained API rate | Burst |
|---|---|---|---|---|---|---|
| T0 course pilot | now → end of semester | ≤ 50 | 30 (one classroom) | ~200 | < 1 req/s | 30 users opening the app in the same minute (~2 req/s for a minute, 30 near-simultaneous song opens) |
| T1 public beta | first outside users | 1,000 MAU | 100 | ~5,000 | ~2 req/s | ~100 song opens in a few seconds |
| T2 growth | if it works | 20,000 MAU | 1,000 | ~100,000 | ~20 req/s | ~1,000 opens over a minute |

Derivation: concurrent users × (requests per session ÷ session length). The
sustained numbers are small at every tier; the bursts and the recording
bytes are what actually decide the tier.

Service levels to hold at T0 and T1 (measure with the script in §3):

| Metric | Target |
|---|---|
| Song open (signed URL + download), p95 | ≤ 1 s |
| Save a run-through, p95 | ≤ 500 ms |
| Upload a 1 MB recording, p95 | ≤ 5 s |
| API errors (4xx from limits, 5xx) | < 0.5 % of requests |
| Availability | best effort during pilot; Pro plan before any outside users (free projects pause after 7 idle days) |

### Recording policy decides the bill

| Policy | Storage per 1,000 sessions (6 attempts each) | 1 GB free tier lasts | 100 GB Pro tier lasts |
|---|---|---|---|
| Keep every attempt, full length (600 KB) | 3.6 GB | < 300 sessions | ~28,000 sessions |
| Keep every attempt, capped at 30 s (100 KB) | 0.6 GB | ~1,700 sessions | ~170,000 sessions |
| Keep last 3 attempts per song, capped at 30 s | 0.3 GB (steady state, then flat) | ~3,000 sessions | effectively unlimited at T1 |

Decision needed before T1: cap recording length (30–60 s), keep only the
last N attempts per song, and make keeping a recording opt-in. This is a
product decision, not an infra one, and it moves the storage trigger by an
order of magnitude.

## 3. Measured baseline (free tier, 2026-09-22)

Run: `node tests/load/supabase-baseline.mjs` from the repo root with
`.env.local` present. Client in New York, project in us-west-2 (≈ 90 ms
round trip is baked into every p50 below). Nano compute (free plan).

| operation | VUs | requests | errors | req/s | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| list-library (select song) | 1 | 10 | 0 | 6.6 | 117 | 321 | 321 |
| list-library (select song) | 10 | 100 | 0 | 53.0 | 107 | 318 | 371 |
| list-library (select song) | 25 | 250 | 0 | 149.6 | 105 | 291 | 413 |
| signed-url (storage API) | 1 | 10 | 0 | 6.7 | 126 | 306 | 306 |
| signed-url (storage API) | 10 | 100 | 0 | 40.3 | 138 | 363 | 1038 |
| signed-url (storage API) | 25 | 250 | 0 | 138.4 | 130 | 302 | 651 |
| download-notation (GET 0.5 KB) | 1 | 10 | 0 | 13.9 | 28 | 484 | 484 |
| download-notation (GET 0.5 KB) | 10 | 100 | 0 | 304.2 | 28 | 53 | 69 |
| download-notation (GET 0.5 KB) | 25 | 250 | 0 | 524.0 | 28 | 104 | 176 |
| insert-run-through (write) | 1 | 10 | 0 | 9.1 | 111 | 138 | 138 |
| insert-run-through (write) | 10 | 100 | 0 | 81.6 | 108 | 137 | 152 |
| insert-run-through (write) | 25 | 250 | 0 | 125.0 | 108 | 532 | 680 |
| upload-recording 60 KB + row (2 req) | 1 | 4 | 0 | 2.9 | 328 | 455 | 455 |
| upload-recording 60 KB + row (2 req) | 5 | 20 | 0 | 12.9 | 354 | 537 | 537 |

What it says:

- Up to 25 concurrent clients nothing saturates: p50 stays flat, throughput
  scales with concurrency, zero errors. That is above the T0 burst and
  comparable to the T1 burst.
- The median is network round trip plus roughly 20 ms of server time. Moving
  the project to us-east-1 would cut ~60 ms for users at Stony Brook; that is
  a migration (regions can't be changed in place), so decide it before T1.
- A separate mis-run of the same script fired ~360 storage-API requests at
  once (unawaited calls) and got `429 Too many connections issued to the
  database` from the storage service. So the storage API's database pool on
  Nano compute saturates somewhere between 25 and a few hundred simultaneous
  calls. The CDN download path did not blink. Two consequences: (1) catalog
  notation should be served without a signed URL (public bucket or cached
  URL) so a class opening the same song hits the CDN, not the API; (2) the
  T2 burst needs a bigger compute tier, and must be re-measured.
- Writes p95 rose to ~530 ms at 25 concurrent inserts (queuing on the
  shared connection pool) but stayed within the 500 ms-ish target; at T2
  this is the first thing that will fail the SLO.

## 4. Where the ceilings are (plan limits as of 2026-09-22)

From supabase.com/pricing and the compute docs; verify before relying on them.

| Limit | Free | Pro ($25/month) |
|---|---|---|
| Database | 500 MB | 8 GB included, $0.125/GB after |
| File storage | 1 GB | 100 GB included, $0.0213/GB after |
| Egress | 5 GB/month | 250 GB included, $0.09/GB after |
| Monthly active users | 50,000 | 100,000 included |
| Max upload size | 50 MB | 500 GB |
| Compute | Nano: shared CPU, 0.5 GB RAM, 60 direct / 200 pooled connections | Micro included: 1 GB RAM, 60 / 200; add-ons Small $15 (2 GB, 90/400), Medium $60 (4 GB, 120/600), Large $110 (2 dedicated vCPU, 8 GB, 160/800), XL $210 … |
| Backups | none downloadable | daily; PITR add-on (recommended once DB > 4 GB) |
| Idle pausing | project pauses after 1 week without activity, max 2 active projects | no |

Auth limits that will bite a classroom before anything else: 30 sign-ups or
sign-ins per 5 minutes **per IP**, and 2 emails per hour on the default
SMTP. Thirty students behind one campus NAT signing up in the same minute
will see 429s. Mitigation for T0: pre-create accounts or stagger sign-up,
keep email confirmation off (already), and raise the per-IP limit in the
dashboard (adjustable) for the pilot session. For T1: custom SMTP and
CAPTCHA on sign-up.

## 5. Triggers and the ladder

Watch these weekly on the Supabase usage page, and re-run the baseline
script after each change.

| Signal | Threshold | Action |
|---|---|---|
| Any outside user | first non-team account | Rung 1 |
| Storage used | > 800 MB on Free, > 80 GB on Pro | Rung 1, then Rung 3 |
| Database size | > 400 MB on Free, > 6 GB on Pro | Rung 1 / add disk; check what is growing |
| Egress | > 4 GB/month on Free, > 200 GB on Pro | Rung 3 |
| API p95 (baseline script) | > 500 ms sustained, or writes p95 > 1 s | Rung 2 + look at `pg_stat_statements` and indexes |
| Errors | 429 "too many connections" or 5xx > 0.5 % under normal use | Rung 2; serve catalog from CDN without signed URLs |
| Monthly bill | > $300/month | evaluate Rung 5 |
| Need for server-side logic Supabase can't express | e.g. server audio processing, group-session coordination beyond Realtime | Rung 6 |

| Rung | What changes | Code change | Cost |
|---|---|---|---|
| 1. Free → Pro | backups, no pausing, 8 GB / 100 GB / 250 GB, Micro compute | none | $25/month (+$10 Micro is included) |
| 2. Compute add-on | Small → Medium → Large; more connections and RAM | none | $15–$110/month |
| 3. Offload recordings | recordings to S3-compatible object storage with zero egress fees (e.g. Cloudflare R2) via presigned URLs; metadata stays in Postgres | `uploadRecording` / `getRecordingUrl` in `src/lib/songs.ts` only | pennies per GB, no egress |
| 4. Read replicas + load balancer | geo-routed reads | none (load-balancer URL) | compute × replicas; unlikely before T2 because our reads are tiny |
| 5. Self-host Supabase | same Postgres + Auth + PostgREST + Storage via Docker Compose on a VPS or Kubernetes | change `VITE_SUPABASE_URL` / anon key, redeploy | server cost plus our own backups, upgrades, monitoring; no managed PITR, branching or dashboard metrics |
| 6. Replace Supabase | managed Postgres elsewhere + a thin API + an auth provider | rewrite `src/lib` (5 files, ~400 lines) and the RLS-equivalent checks in the API; export users (bcrypt hashes are exportable) | highest; only for server logic Supabase cannot express |

Rungs 1–4 are configuration. Rung 5 keeps every line of client code. Rung 6
is the only real rewrite, and it is small because the client already talks
to one module.

## 6. What happens on the day we move (rungs 5 and 6)

1. Announce a maintenance window; flip the app to read-only (a `maintenance`
   flag in `app/.env` at build time is enough for now).
2. `pg_dump` the `public` and `auth` schemas (or `supabase db dump`) and
   restore into the target Postgres; migrations in `supabase/migrations/`
   reproduce the schema, so the dump is data only if the target is a fresh
   Supabase.
3. Copy storage objects bucket-to-bucket with `rclone` over the S3-compatible
   endpoints; paths are `<user_id>/<uuid>.<ext>`, so nothing in the database
   changes.
4. Point the app at the new URL and anon key (build-time env, one deploy).
   For a self-host, copy the JWT secret so existing sessions stay valid;
   otherwise users sign in again.
5. Run `npm run test:backend` and `node tests/load/supabase-baseline.mjs`
   against the new environment before unfreezing.

At T1 sizes (< 10 GB) this is under an hour of downtime.

## 7. Exit-readiness checklist (cheap, do now)

- [ ] Keep every Supabase call behind `src/lib`. One leak exists today:
      `app/src/tabs/vocal/songs/cloudLibrary.js` calls
      `supabase.storage.list('seed')` directly — move it into `songs.ts`.
- [ ] Serve catalog notation from a public bucket (or cache signed URLs for
      their 1-hour lifetime) so classroom bursts hit the CDN, not the API.
- [ ] Decide the recording policy (cap length, keep last N per song, opt-in).
- [ ] Nightly `supabase db dump` from CI to an off-site artifact while on the
      Free plan (it has no backups). Pro's daily backup replaces this.
- [ ] Pick the region before T1 (us-east-1 for a Stony Brook audience); it
      costs a migration later.
- [ ] Log usage weekly (storage GB, DB MB, egress GB, MAU) in this file's
      history or the dashboard, so the triggers above are actually watched.
- [ ] Re-run the baseline after every tier change and record the table here.
- [ ] Keep Postgres portable: RLS + `auth.uid()` and plain SQL only; no
      Supabase-specific extensions in migrations.
