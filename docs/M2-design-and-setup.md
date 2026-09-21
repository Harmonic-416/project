# M2 — Design and Setup (10%)

Milestone rubric and where Harmonic stands against it. Keep this current until M2 is submitted.

| Rubric item | Status | Where |
|---|---|---|
| **Architecture** — boxes and arrows (clients, APIs, data, jobs) | ✅ Done | [Architecture plan](https://claude.ai/code/artifact/f1e70900-cc05-4795-9066-531731d6636f) — current state vs V1 specs vs pivot; also `openspec/changes/add-backend-services/design.md` |
| **Stack** — what + one-sentence why | ✅ Done | See below |
| **Clonable repo with CI skeleton** (lint / test / build) | 🟡 Partial | This repo + `.github/workflows/ci.yml` (typecheck + test on PR, migration push on main). **Gaps: no lint step, no build step** — add ESLint + a `build` script once the Vite shell exists |
| **Minimal prototype that runs** — a heartbeat, not the product | 🟡 Partial | Backend heartbeat exists: 14/14 vitest integration tests against the live Supabase project (auth round-trip, RLS isolation, seed library). **Gap: no runnable client** — smallest fix is a one-page Vite app that logs in and lists the 3 seed songs |
| **Design doc connected to requirements** | ✅ Done | `openspec/` — every capability spec ties each requirement to its F#/N# id from `specifications/2-scope/requirements.md`; `design.md` records the cross-capability decisions |

## Stack (one sentence why, each)

- **React + Vite (PWA via vite-plugin-pwa/Workbox)** — installable app with the fastest iteration loop, and the ecosystem agents/tooling are best at.
- **Supabase (Postgres + Auth + Storage)** — auth, per-user data, and private file storage with zero custom server to build or operate.
- **AlphaTab** — renders tab + standard notation from MusicXML and doubles as the source of truth for expected notes.
- **Pitchy (McLeod) / Web Audio FFT / Tone.js / Tonal.js** — proven client-side pitch, chord verification, transport clock, and theory helpers, keeping all real-time audio on-device (≤100 ms budget).
- **GitHub Actions + Supabase CLI** — CI/CD in the same place as the repo; `supabase db push` makes schema deploys one command.

## Current focus (per Eddie, 2026-09-21)

Less lessons; prioritize **(1) users reviewing their own pieces** (F22/F23 backend live; F24/F33 UI next; persist F33 analysis as `run_through.analysis jsonb`) and **(2) collaborative feedback on practice sessions** — not yet spec'd, requires `/opsx:propose add-practice-feedback` (share + feedback tables, RLS deltas; overturns the F26/N5 no-sharing guardrail deliberately).

## To close M2

1. Merge PR #2 (backend + CI to `main`); add `SUPABASE_URL` / `SUPABASE_ANON_KEY` repo secrets so CI runs the integration suite.
2. Add ESLint + `npm run lint`, and a `npm run build` (Vite shell), each as a CI job → rubric's lint/test/build reads literally green.
3. Heartbeat prototype: minimal Vite page — login form → list seed songs from the live library → deployed on HTTPS (also satisfies the deployment spec's build requirement).
