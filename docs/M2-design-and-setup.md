# M2 — Design and Setup (10%)

Milestone rubric and where Harmonic stands against it. Keep this current until M2 is submitted.

| Rubric item | Status | Where |
|---|---|---|
| **Architecture** — boxes and arrows (clients, APIs, data, jobs) | ✅ Done | [`docs/architecture.md`](architecture.md) (lanes diagram + components, data flows, decisions, testing); diagram source in the [specifications repo](https://github.com/Harmonic-416/specifications/blob/docs/compact-architecture/3-architecture/rough-architecture.md); [Architecture plan](https://claude.ai/code/artifact/f1e70900-cc05-4795-9066-531731d6636f) — current state vs V1 specs vs pivot; `openspec/changes/add-backend-services/design.md` |
| **Stack** — what + one-sentence why | ✅ Done | See below |
| **Clonable repo with CI skeleton** (lint / test / build) | ✅ Done | `.github/workflows/ci.yml`: job `backend` (oxlint, `tsc --noEmit`, vitest) and job `app` (oxlint, vitest, `vite build`) on every PR and push to `main`; `migrate` (`supabase db push`) on `main`. Locally: `npm run ci`. Verified from a fresh `git clone` + `npm ci` (README "Clone and run") |
| **Minimal prototype that runs** — a heartbeat, not the product | ✅ Runs locally · 🟡 not deployed | `app/`: sign in → song catalog → open a song → sheet music + synced playback → export → record an attempt with the pitch drawn on the staff. Guitar tab: a tuner on the shared AudioWorklet capture (verified end to end with a fake-microphone tone in Chrome) and a Songs view rendering tab + standard notation with alphaTab, playback, and MIDI / Guitar Pro export. Backend heartbeat: 30 vitest integration tests against the live Supabase project (auth, RLS isolation, progress, MIDI/MusicXML import → bucket → signed URL). **Gap: no HTTPS deployment yet** (`add-devops-infrastructure`) |
| **Design doc connected to requirements** | ✅ Done | `openspec/` — every capability spec ties each requirement to its F#/N# id from `specifications/2-scope/requirements.md`; `design.md` records the cross-capability decisions |

## Stack (one sentence why, each)

- **React + Vite (PWA via vite-plugin-pwa/Workbox)** — installable app with the fastest iteration loop, and the ecosystem agents/tooling are best at.
- **Supabase (Postgres + Auth + Storage)** — auth, per-user data, and private file storage with zero custom server to build or operate.
- **OpenSheetMusicDisplay (OSMD)** for voice — renders MusicXML in the browser, and its cursor iterator doubles as the source of truth for playback timing and expected notes.
- **alphaTab** for guitar — the only web renderer that draws tab next to standard notation, and it also plays (alphaSynth) and exports (MIDI, Guitar Pro) what it renders; lazy-loaded so voice users never download it.
- **Tone.js + @tonejs/midi + jszip** — transport clock and synth for playback, MIDI parsing/writing for import and export, MXL unzipping.
- **Pitchy (McLeod) on Web Audio** — proven client-side pitch tracking, keeping all real-time audio on-device (≤100 ms budget); Tonal.js still planned for chord/theory helpers.
- **AudioWorklet capture** — sees every microphone sample on the audio thread, so guitar strum onsets are never missed between polls and carry sample-accurate times; the tuner is its first user.
- **GitHub Actions + Supabase CLI** — CI/CD in the same place as the repo; `supabase db push` makes schema deploys one command.

## Current focus (per Eddie, 2026-09-21)

Less lessons; prioritize **(1) users reviewing their own pieces** (F22/F23 backend live; F24/F33 UI next; persist F33 analysis as `run_through.analysis jsonb`) and **(2) collaborative feedback on practice sessions** — not yet spec'd, requires `/opsx:propose add-practice-feedback` (share + feedback tables, RLS deltas; overturns the F26/N5 no-sharing guardrail deliberately).

## To close M2

1. Merge the integration PR (notation import/export, cloud library + catalog, recording prototype, CI + docs) to `main`; add `SUPABASE_URL` / `SUPABASE_ANON_KEY` repo secrets so CI runs the integration suite.
2. Deploy `app/dist` on HTTPS (Vercel/Netlify/GitHub Pages) per `openspec/changes/add-devops-infrastructure` — the only rubric gap left.
3. Wire the record panel to `uploadRecording` + `recordRunThrough` so an attempt becomes a `run_through` row (F22/F23 end to end).
