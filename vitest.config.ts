import { defineConfig } from 'vitest/config'

// Root suite = the backend layer only. app/ ships its own vitest config, and
// anything else living next to this file (e.g. a scratch checkout) must not
// be collected — every backend test registers a throwaway Supabase user.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
