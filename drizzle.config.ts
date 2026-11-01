import { defineConfig } from 'drizzle-kit'

// `npm run db:migrate` locally: DATABASE_URL from .env.local unless it is already set.
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile('.env.local') } catch { /* no .env.local */ }
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
