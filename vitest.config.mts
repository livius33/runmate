import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Plan-logic tests (07-00): pure functions only — no database, no network.
export default defineConfig({
  // tsconfig keeps JSX for Next.js ("preserve"); the legal-page test renders components, so compile JSX here.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 120_000,
  },
})
