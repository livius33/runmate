import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

type DB = ReturnType<typeof drizzle<typeof schema>>

// Connects on first use, not on import: `next build` loads every route module and must work without DATABASE_URL.
let instance: DB | null = null
function connect(): DB {
  if (!instance) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set (see .env.example)')
    instance = drizzle(neon(url), { schema })
  }
  return instance
}

export const db = new Proxy({} as DB, {
  get(_, prop) {
    const d = connect()
    const v = Reflect.get(d, prop, d)
    return typeof v === 'function' ? v.bind(d) : v
  },
})
