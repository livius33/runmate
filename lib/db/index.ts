import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { ReadOnlyError, currentScope } from '@/lib/scope'

type DB = ReturnType<typeof drizzle<typeof schema>>

// Neon hosts use the serverless HTTP driver; any other Postgres (Docker Compose, a managed server) uses node-postgres.
// DATABASE_DRIVER=neon|pg overrides the guess (e.g. a Neon database behind a custom domain).
export function driverFor(url: string, override = process.env.DATABASE_DRIVER): 'neon' | 'pg' {
  if (override === 'neon' || override === 'pg') return override
  try { return new URL(url).hostname.endsWith('.neon.tech') ? 'neon' : 'pg' } catch { return 'pg' }
}

// Connects on first use, not on import: `next build` loads every route module and must work without DATABASE_URL.
let instance: DB | null = null
function connect(): DB {
  if (!instance) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set (see .env.example)')
    // Both drivers share drizzle's query API; the app uses no transactions or batches, so one type covers both.
    instance = driverFor(url) === 'neon' ? drizzle(neon(url), { schema }) : drizzlePg(new Pool({ connectionString: url, max: 10 }), { schema }) as unknown as DB
  }
  return instance
}

// Tests swap in a fake (drizzle's pg-proxy driver) to see the SQL the scoped helpers produce.
let override: DB | null = null
export function setDbForTests(d: unknown) {
  override = d as DB | null
}

// Everything that can change data. In a read-only scope (the demo, Phase 5) these throw before any SQL is built, so no
// write can reach the database whatever a route handler does.
const WRITES = new Set<PropertyKey>(['insert', 'update', 'delete', 'execute', 'transaction', 'batch', 'refreshMaterializedView'])

export const db = new Proxy({} as DB, {
  get(_, prop) {
    if (WRITES.has(prop) && currentScope().readOnly) return () => { throw new ReadOnlyError() }
    const d = override ?? connect()
    const v = Reflect.get(d, prop, d)
    return typeof v === 'function' ? v.bind(d) : v
  },
})
