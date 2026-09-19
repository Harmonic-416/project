# Design

## Context

Harmonic is a React + Vite PWA with Supabase as a thin backend (Postgres + Auth + Storage). The stack is locked; DevOps wires the chosen libraries (vite-plugin-pwa + Workbox) and the deploy path, not picks new ones. Two facts shape everything: (1) service workers and `getUserMedia` both require a secure context (HTTPS), so hosting is not a free choice; (2) audio analysis is client-side and only scores + compressed recordings hit the server, so the offline story is about static app + notation/song assets, not live data sync. See proposal.md for motivation.

## Goals / Non-Goals

- Goals: a reproducible production build, secret-free Supabase config via env vars, HTTPS static hosting reachable by a phone, and an offline cache that lets an already-visited lesson open without a connection.
- Non-goals: guaranteed *first-visit* offline access to arbitrary content; runtime feature behavior; a custom backend; native app packaging.

## Decisions

- **vite-plugin-pwa in `generateSW` mode** for V1 rather than hand-authoring a worker (`injectManifest`). Default Workbox `generateSW` precaches the built shell with far less code; a custom worker is warranted only once runtime caching of song assets needs bespoke logic, which we add as a targeted runtime-caching rule rather than a rewrite.
- **Precache the app shell; runtime-cache practice assets.** JS/CSS/HTML/manifest/icons are precached at install (they change only on deploy). Notation/song files (MusicXML, audio) are fetched on demand, so they use a runtime `CacheFirst`/`StaleWhileRevalidate` strategy keyed by request URL — available offline only *after* one online visit. This matches N4 without pretending we can pre-ship every song to every device.
- **Supabase config via build-time env vars** (`VITE_`-prefixed: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), read by Vite at build. The anon key is a public client key by design (row-level security enforces access server-side), so it may ship in the bundle; no service-role/secret key ever appears in client code or the repo. A committed `.env.example` documents the required vars; real `.env` files are gitignored.
- **Static hosting over HTTPS with build-on-push CI.** A static host serves the Vite `dist/` output; CI runs the production build on push to main. HTTPS is mandatory (service worker + mic). The contract is "static files over HTTPS," not a specific vendor, keeping the target replaceable.

## Risks / Trade-offs

- [Stale service worker serves an outdated app after deploy] -> vite-plugin-pwa's revisioned precache + a clear update-activation policy (prompt or auto-update on new SW), so a deploy reliably supersedes the cached shell.
- [Runtime-cached song assets grow unbounded / go stale] -> Bound the runtime cache with Workbox `ExpirationPlugin` (max entries + max age); accept that first offline access to a never-visited song is not guaranteed (documented non-goal).
- [Leaking a Supabase secret in the client bundle] -> Only the public anon key is exposed; service-role keys are never referenced client-side, CI needs none, `.env` is gitignored, and `.env.example` carries no real values.
- [iOS Safari PWA limits (install prompt, SW quirks)] -> Validation work tied to N2; the shell must degrade gracefully (still runs online) where install/offline is restricted.

## Migration Plan

Greenfield — no data or users to migrate. Rollback is re-publishing the prior `dist/`; the revisioned service worker replaces the newer one on next load.

## Open Questions

- Exact static-hosting vendor and CI provider are deferred until the repo/account exist; the spec is written against the vendor-neutral "static files over HTTPS, built on push" contract, so the choice does not change behavior.
