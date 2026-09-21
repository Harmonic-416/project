# Add DevOps Infrastructure

## Why

Harmonic's pitch — practice an instrument anywhere — breaks if a flaky connection means a cached lesson won't open, or if there's no repeatable way to build and ship the app onto real phones for the mobile-Safari validation the plan hinges on. This change establishes the delivery substrate: the installable/offline-capable runtime shell plus the build, Supabase configuration, and hosting every other area ships on.

## What Changes

- Add a **PWA shell**: web app manifest and a Workbox-backed service worker (via vite-plugin-pwa) so the app is installable to a home screen and boots without a network round-trip.
- Add **offline caching of practice content** so already-visited lessons and their notation/song assets open and render without a connection (N4).
- Add a **Vite production build** that emits an optimized static bundle with the PWA artifacts wired in.
- Add **Supabase project + environment/secret configuration** (project URL, anon key) supplied via build-time env vars so no secrets are committed and dev/prod point at the right backend.
- Add **static hosting + CI** that builds on push and serves the app over HTTPS at a reachable URL (HTTPS is a hard prerequisite for service workers and mic access).

## Capabilities

### New Capabilities

- `pwa-infra`: The installable-PWA runtime shell — service worker, manifest, installability, and offline caching of already-visited practice content (notation/song assets) so cached lessons work without a connection.
- `deployment`: The Vite production build, Supabase project + environment/secret configuration (URL, anon key), and static HTTPS hosting/CI — the substrate every other capability ships on.

### Modified Capabilities

(none — greenfield)

## Impact

- New build/deploy tooling: vite-plugin-pwa + Workbox, Vite production build config, a static HTTPS host, and a CI pipeline.
- New configuration surface: Supabase URL + anon key as env vars; `.env` conventions with a committed example; no secret material in source control.
- Cross-cutting: every other area (frontend audio/notation, backend Supabase data, UI) ships through these artifacts; the offline cache scope depends on which notation/song assets the notation and backend areas expose.

## Non-goals

Drawn from the v1-scope OUT list and scoped to this delivery substrate:

- No native App Store / TestFlight pipeline — PWA install is the only distribution channel this semester (App Store is OUT).
- No infrastructure for V1-OUT features: CV finger placement (F25), group/social/multi-instrument sync (F26), YouTube play-along (F27), guitar "Changes" mode (F38), piano, or full-song playthroughs.
- No custom backend server or serverless functions — hosting is static + Supabase only (locked stack).
- No application behavior (audio analysis, scoring, notation, auth logic) — those belong to the frontend, backend, and UI areas; this change only makes them buildable, configurable, installable, cacheable, and reachable.
