// A database stand-in for the scoping tests: drizzle's pg-proxy driver hands every query (SQL text + parameters) to a
// callback, so tests see exactly what the scoped helpers send and answer with canned rows. No Postgres needed.
import { drizzle } from 'drizzle-orm/pg-proxy'
import { getTableColumns, type Table } from 'drizzle-orm'
import { setDbForTests } from '@/lib/db'

export interface Query { sql: string; params: unknown[] }

export function useFakeDb(answer: (q: Query) => unknown[][] = () => []) {
  const log: Query[] = []
  setDbForTests(drizzle(async (sql, params) => {
    const q = { sql, params }
    log.push(q)
    return { rows: answer(q) }
  }))
  return { log, restore: () => setDbForTests(null) }
}

// One row of `table` as the driver returns it for select(): values in column order.
export function rowOf(table: Table, values: Record<string, unknown>): unknown[] {
  return Object.keys(getTableColumns(table)).map((k) => values[k] ?? null)
}
