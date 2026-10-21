import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // JSX in component tests (*.test.jsx, which opt into jsdom per file).
  plugins: [react()],
  // As in vite.config.js: the shared backend layer at the repo root.
  resolve: { alias: { '@backend': fileURLToPath(new URL('../src/lib', import.meta.url)) } },
  define: { __SONG_FILES__: '[]', __GUITAR_SONG_FILES__: '[]' },
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    environment: 'node',
    // @tonejs/midi's package "main" is CommonJS; let Vite transform it so the
    // named `Midi` export resolves the same way it does in the browser build.
    server: { deps: { inline: ['@tonejs/midi'] } },
  },
})
