# Tasks

## 1. deployment

- [ ] 1.1 Scaffold the React + Vite app so `npm run build` emits a static `dist/` (entry HTML + hashed JS/CSS); verify by running the build and listing `dist/`. [M]
- [ ] 1.2 Wire Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) read at build time, with a committed `.env.example` and a gitignored `.env`; verify the build reads them and `git status` shows no real `.env` tracked. [M]
- [ ] 1.3 Add build/startup validation that a missing required Supabase var raises a clear error; verify by unsetting a var and observing the surfaced failure, not a silent empty backend. [M]
- [ ] 1.4 Deploy `dist/` to a static host over HTTPS; verify the URL loads over HTTPS and a service worker may register (secure-context check in devtools). [M]
- [ ] 1.5 Add build-on-push CI on main that runs `npm run build` and publishes only on success; verify a build-breaking commit stays red/undeployed and a passing commit goes green/deployed. [S]

## 2. pwa-infra

- [ ] 2.1 Add `vite-plugin-pwa` with a manifest (name, icons, start URL, standalone display, theme); verify the build emits `manifest.webmanifest` + a service worker and the browser shows an install affordance over HTTPS. [C — N4/PWA model]
- [ ] 2.2 Register the service worker with graceful degradation when unsupported; verify it reaches an active/controlling state in a supporting browser and the app still runs (no unhandled error) where service workers are unavailable. [C]
- [ ] 2.3 Precache the app shell (HTML/JS/CSS/manifest/icons); verify by loading once online, going offline, and reopening — the UI renders with no network round-trip. [C — N4]
- [ ] 2.4 Add an update-activation policy so a new deploy supersedes the cached shell; verify by deploying a change and confirming the reopened app updates off the revisioned precache. [C]
- [ ] 2.5 Add a bounded runtime-caching rule (CacheFirst/StaleWhileRevalidate + ExpirationPlugin max-entries/max-age) for notation/song assets; verify a previously-visited lesson's notation and reference audio load offline, a never-visited lesson shows "unavailable offline" without crashing, and old entries evict past the limit. [C — N4]
