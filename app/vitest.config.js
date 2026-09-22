import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __SONG_FILES__: '[]' },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // @tonejs/midi's package "main" is CommonJS; let Vite transform it so the
    // named `Midi` export resolves the same way it does in the browser build.
    server: { deps: { inline: ['@tonejs/midi'] } },
  },
})
