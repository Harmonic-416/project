import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Song library file list, discovered from public/midi-files/ at config-load
// time (dev server start / build) and baked into the app via `define` below.
// Drop a .mid/.midi/.musicxml/.xml/.mxl file in there and restart the dev
// server (or rebuild) to pick it up — public/ is copied through verbatim, so
// no separate asset pipeline step is needed to serve the files themselves.
function listSongFiles() {
  try {
    return readdirSync(new URL('./public/midi-files/', import.meta.url))
      .filter((name) => /\.(mid|midi|musicxml|xml|mxl)$/i.test(name))
      .sort()
  } catch {
    return []
  }
}

// The Supabase layer (auth / songs / progress) lives at the repo root in
// src/lib and is shared with the backend test-suite; the app imports it as
// `@backend/<module>`. dedupe keeps a single supabase-js instance even
// though both package.json files list it.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const backendLib = fileURLToPath(new URL('../src/lib', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: { '@backend': backendLib },
    dedupe: ['@supabase/supabase-js'],
  },
  define: {
    __SONG_FILES__: JSON.stringify(listSongFiles()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // OSMD + Tone + supabase-js exceed workbox's 2 MiB precache default.
      workbox: { maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
      manifest: {
        name: 'Harmonic',
        short_name: 'Harmonic',
        description: 'Learn the instrument and the language at the same time.',
        theme_color: '#128789',
        background_color: '#F5F4F0',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    allowedHosts: ['america-joined-fifteen-enabled.trycloudflare.com'],
    fs: { allow: [repoRoot] },
  },
})
