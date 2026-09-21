import { readdirSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Song library file list, discovered from public/midi-files/ at config-load
// time (dev server start / build) and baked into the app via `define` below.
// Drop a .mid/.midi file in there and restart the dev server (or rebuild) to
// pick it up — public/ is copied through verbatim, so no separate asset
// pipeline step is needed to serve the files themselves.
function listMidiSongFiles() {
  try {
    return readdirSync(new URL('./public/midi-files/', import.meta.url))
      .filter((name) => /\.(mid|midi)$/i.test(name))
      .sort()
  } catch {
    return []
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __MIDI_SONG_FILES__: JSON.stringify(listMidiSongFiles()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
    allowedHosts: ['america-joined-fifteen-enabled.trycloudflare.com']
  }
})
