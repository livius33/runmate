// AC-1 (Phase 2): no query on a user table without the owner filter, anywhere in app/, lib/ or scripts/.
// A query that must span users (token lookup, the cron's user list) says so in a `// cross-user: <why>` comment
// on the line before it.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'
import { scanSource } from './scan'

const ROOT = join(__dirname, '..', '..')
const tables = Object.entries(schema).filter(([, v]) => is(v, PgTable)) as [string, PgTable][]
const userTables = new Set(tables.filter(([, t]) => 'userId' in getTableColumns(t)).map(([name]) => name))

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' || f.startsWith('.') ? [] : files(p)
    return /\.(ts|tsx|mts|mjs)$/.test(f) ? [p] : []
  })
}

describe('Datenzugriff je Nutzer', () => {
  it('jede Tabelle gehört einem Nutzer (user_id, not null)', () => {
    for (const [name, t] of tables) {
      const col = getTableColumns(t).userId
      expect(col, `${getTableName(t)} (${name}) hat keine user_id`).toBeDefined()
      expect(col.notNull).toBe(true)
    }
  })

  it('keine Abfrage auf einer Nutzertabelle ohne Nutzerfilter', () => {
    const findings = ['app', 'lib', 'scripts'].flatMap((d) => files(join(ROOT, d)))
      .flatMap((p) => scanSource(relative(ROOT, p), readFileSync(p, 'utf8'), userTables))
    expect(findings.map((f) => `${f.file}:${f.line} ${f.op} ${f.table}: ${f.text}`)).toEqual([])
  })

  it('der Scanner erkennt ungefilterte Abfragen (Selbsttest)', () => {
    const src = [
      "const a = await db.select().from(activities).where(eq(activities.id, id))",
      "const b = await db.select().from(activities).where(own(activities, eq(activities.id, id)))",
      "await db.insert(settings).values({ key, value })",
      "await db.insert(settings).values(mine({ key, value }))",
      "await db\n  .update(activities)\n  .set({ x: 1 })\n  .where(eq(activities.id, id))",
      "await db.delete(healthDays).where(eq(healthDays.userId, userId))",
      "// cross-user: test\nconst c = await db.select().from(linkTokens).where(eq(linkTokens.token, t))",
      "await db.execute(sql`select 1`)",
    ].join('\n')
    const f = scanSource('x.ts', src, userTables)
    expect(f.map((x) => [x.line, x.op, x.table])).toEqual([[1, 'select', 'activities'], [3, 'insert', 'settings'], [5, 'update', 'activities'], [12, 'execute', '(raw SQL)']])
  })
})
