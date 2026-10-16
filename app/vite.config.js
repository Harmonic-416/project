import { cpSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { alphaTab } from '@coderline/alphatab-vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Song library file lists, discovered from public/midi-files/ (Vocal) and
// public/guitar-songs/ (Guitar) at config-load time (dev server start /
// build) and baked into the app via `define` below. Drop a file in there and
// restart the dev server (or rebuild) to pick it up — public/ is copied
// through verbatim, so no separate asset pipeline step is needed to serve the
// files themselves.
function listSongFiles(dir, pattern) {
  try {
    return readdirSync(new URL(`./public/${dir}/`, import.meta.url))
      .filter((name) => pattern.test(name))
      .sort()
  } catch {
    return []
  }
}

// Guitar Songs' after-the-run check runs Spotify's basic-pitch model in the
// browser (src/tabs/guitar/song/follow/refineWithBasicPitch.js). Its model
// ships inside the npm package; copy it into public/basic-pitch/ (gitignored)
// on every dev start / build, the way alphaTab's plugin copies its assets.
function basicPitchModel() {
  const from = fileURLToPath(new URL('./node_modules/@spotify/basic-pitch/model/', import.meta.url))
  const to = fileURLToPath(new URL('./public/basic-pitch/', import.meta.url))
  return {
    name: 'harmonic:basic-pitch-model',
    buildStart() {
      if (existsSync(from)) cpSync(from, to, { recursive: true })
    },
  }
}

// The Supabase layer (auth / songs / progress) lives at the repo root in
// src/lib and is shared with the backend test-suite; the app imports it as
// `@backend/<module>`. dedupe makes the packages that layer imports resolve
// from app/node_modules — one supabase-js instance, and a build that works
// when only the app's dependencies are installed (CI's app job).
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const backendLib = fileURLToPath(new URL('../src/lib', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: { '@backend': backendLib },
    dedupe: ['@supabase/supabase-js', '@tonejs/midi'],
  },
  define: {
    __SONG_FILES__: JSON.stringify(listSongFiles('midi-files', /\.(mid|midi|musicxml|xml|mxl)$/i)),
    __GUITAR_SONG_FILES__: JSON.stringify(
      listSongFiles('guitar-songs', /\.(gp|gp3|gp4|gp5|gpx|alphatex|atex|musicxml|xml|mxl|mid|midi)$/i),
    ),
  },
  // ONNX Runtime (Beat This!, src/tabs/guitar/song/transcribe/beats.js) finds
  // its .wasm next to its own module (new URL(…, import.meta.url)); dev
  // pre-bundling moves the module and breaks that, so it's served as is.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  // Workers and worklets (alphaTab's, and our mic capture worklet) are ES
  // modules: AudioWorklet.addModule loads modules, and alphaTab reads
  // import.meta.url, which an iife bundle would blank out.
  worker: { format: 'es' },
  plugins: [
    react(),
    // Guitar tab rendering + playback. Wires alphaTab's worker/worklet into
    // the build and copies its music font and soundfont into public/font and
    // public/soundfont (gitignored) on every dev start / build.
    alphaTab(),
    basicPitchModel(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // OSMD + Tone + supabase-js exceed workbox's 2 MiB precache default.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Guitar songs (alphaTab: ~1 MB view chunk, ~2 MB worker and worklet,
        // ~1 MB soundfont, music font) stay out of the install-time precache;
        // they're cached the first time the Songs view opens. So does the
        // after-the-run check (TensorFlow.js + basic-pitch's model), cached the
        // first time someone runs it, and tabbing a song's guitar (the
        // pipeline, Beat This!, YAMNet, the separator and ONNX Runtime's
        // ~28 MB WebGPU .wasm; the separator's 55 MB model comes from
        // Hugging Face and is cached on first use).
        globIgnores: [
          '**/alphaTab.*.js',
          '**/GuitarSong-*.{js,css}',
          '**/refineWithBasicPitch-*.js',
          '**/basic-pitch/**',
          '**/{pipeline,beats,separate}-*.js',
          '**/ort.*.js',
          '**/ort-wasm-*.wasm',
          '**/beat-this/**',
          '**/yamnet/**',
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /\/(soundfont|font)\//.test(url.pathname) || /\/assets\/(alphaTab\.|GuitarSong-)/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'alphatab-assets', expiration: { maxEntries: 32 } },
          },
          {
            urlPattern: ({ url }) => /\/basic-pitch\//.test(url.pathname) || /\/assets\/refineWithBasicPitch-/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'basic-pitch', expiration: { maxEntries: 8 } },
          },
          {
            urlPattern: ({ url }) =>
              /\/(beat-this|yamnet)\//.test(url.pathname) || /\/assets\/(pipeline-|beats-|separate-|ort\.|ort-wasm-)/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'transcribe', expiration: { maxEntries: 16 } },
          },
          {
            // The guitar separator's model (separate.js), pinned to one revision.
            urlPattern: ({ url }) => url.hostname === 'huggingface.co' && url.pathname.startsWith('/Andremi/audioweb-models/resolve/'),
            handler: 'CacheFirst',
            options: { cacheName: 'separator', expiration: { maxEntries: 2 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
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
