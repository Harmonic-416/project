# Deploying Harmonic

Harmonic's frontend is a static bundle. Nothing is server-rendered and there is
no application server of our own — Supabase is the entire backend. So the
deploy target is replaceable by design, which is what
`openspec/changes/add-devops-infrastructure/design.md` means by the
*"static files over HTTPS, built on push"* contract. Vercel is what's wired up
today; the same artifact runs on your own box with no code change.

## The contract

Any host qualifies if it does these five things:

| # | Requirement | Why |
|---|---|---|
| 1 | Build `npm --prefix app ci && npm --prefix app run build`, publish `app/dist` | Vite inlines `VITE_*` at build time, so config is baked in here, not at runtime |
| 2 | **Serve over HTTPS** | `getUserMedia()` (the mic) and the service worker both refuse to run outside a secure context — over plain HTTP the app loads but can neither record nor work offline |
| 3 | Fall back to `/index.html` for paths that match no file | Single-page app; a deep link or a refresh must not 404 |
| 4 | `Cache-Control: immutable` on `/assets/*`, `no-cache` on `sw.js` / `registerSW.js` / `manifest.webmanifest` | Asset names are content-hashed; the worker is not. A cached worker pins an old build forever |
| 5 | `Permissions-Policy: microphone=(self)` on the document | Keeps the mic usable while denying it to any embedded frame |

Build-time environment (both public — the anon key ships inside the client
bundle no matter where it's hosted, and RLS is what actually protects the data):

```
VITE_SUPABASE_URL=https://mxfclxntqbeznbubfmwa.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

Omit them and the app still runs — local files only, no cloud library or sign-in.

## Current target: Vercel

`vercel.json` at the repo root holds the whole configuration; there is no
Vercel-specific code anywhere in `app/`.

```bash
vercel login                       # once
vercel link                        # once, from the repo root
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel deploy --prod
```

After linking the GitHub repo in the Vercel dashboard, pushes to `main` deploy
on their own and pull requests get preview URLs.

## Moving to your own server

Two supported shapes, both serving the identical `app/dist`:

**Docker + nginx** — one command, nothing to install on the host but Docker:

```bash
docker build -f deploy/Dockerfile -t harmonic \
  --build-arg VITE_SUPABASE_URL=https://mxfclxntqbeznbubfmwa.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon public key> .
docker run -d -p 8080:80 --name harmonic harmonic
```

Put TLS in front of it (certbot on the host, or a reverse proxy). `deploy/nginx.conf`
already implements requirements 3–5.

**Plain files + Caddy** — lightest option, and Caddy obtains the certificate
itself, which settles requirement 2 without extra work:

```bash
npm --prefix app run build
rsync -a app/dist/ user@server:/srv/harmonic/
# on the server, with deploy/Caddyfile edited to your domain:
caddy run --config deploy/Caddyfile
```

## Switching targets

The swap is configuration only:

1. Point the new host at build `npm --prefix app run build`, output `app/dist`.
2. Set the two `VITE_*` variables in its build environment.
3. Port the fallback + cache + permission rules — copy them from `vercel.json`,
   `deploy/nginx.conf`, or `deploy/Caddyfile`, whichever is closest.
4. Delete the old target's config file. Nothing in `app/` changes.

Netlify, Cloudflare Pages, GitHub Pages and S3+CloudFront all satisfy the
contract. Note that GitHub Pages cannot set response headers, so it fails
requirements 4 and 5 — the app works, but service-worker updates are at the
mercy of Pages' own caching.

## Verifying a deploy

```bash
curl -sI https://<host>/sw.js | grep -i cache-control        # expect no-cache
curl -sI https://<host>/assets/<hashed>.js | grep -i cache   # expect immutable
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/some/deep/link  # expect 200
```

Then on the deployed page: it must load over HTTPS, the mic prompt must appear
when you start a recording, and a second visit with the network disabled must
still open the app shell.
