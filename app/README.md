# Harmonic — app

The React + Vite PWA. See the [root README](../README.md) for the full
picture and [`docs/architecture.md`](../docs/architecture.md) for how the
pieces fit.

```
npm ci
npm run dev      # http://localhost:5173 — works with no keys (local files only)
npm test         # unit tests (vitest)
npm run lint     # oxlint
npm run build    # production build → dist/ (PWA with Workbox precache)
```

Optional cloud features (sign-in, song catalog, save to cloud): copy
`.env.example` to `.env.local` and paste the Supabase anon key.

Google sign-in names Harmonic's site (not `supabase.co`) once
`VITE_GOOGLE_CLIENT_ID` is set: the browser then goes to Google and straight
back here (`src/auth/googleSignIn.js`). Before setting it, add the site
address with a trailing slash (`https://harmonic-vert.vercel.app/`,
`http://localhost:5173/`) to "Authorised redirect URIs" on the Google OAuth
client that Supabase uses. Without the variable, sign-in goes through
Supabase as before.

The backend layer is imported from the repo root as `@backend/<module>`
(Vite alias to `../src/lib`), so this package has no copy of the Supabase
code of its own.
