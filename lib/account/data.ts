// The user's own data as a whole (Phase 4): every table with `user_id`, export (Art. 20 GDPR) and deletion (Art. 17).
// The table list comes from the schema itself, so a new user table is exported and deleted without touching this
// file; tests/account/data.test.ts checks that against the schema.
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { PgTable, getTableConfig, type PgColumn } from 'drizzle-orm/pg-core'
import { strToU8, zipSync } from 'fflate'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { activities, activityStreams, healthDays, healthWorkouts } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'

type UserTable = PgTable & { userId: PgColumn }
export interface UserTableEntry { key: string; name: string; table: UserTable }

// Every table owned by a user, children before the tables they reference (so deletes never trip a foreign key).
export function userTables(): UserTableEntry[] {
  const all = Object.entries(schema)
    .filter(([, v]) => is(v, PgTable) && 'userId' in getTableColumns(v as PgTable))
    .map(([key, t]) => ({ key, name: getTableName(t as PgTable), table: t as UserTable }))
  const refs = new Map(all.map((e) => [e.name, getTableConfig(e.table).foreignKeys.map((fk) => getTableName(fk.reference().foreignTable))]))
  const out: UserTableEntry[] = []
  const visit = (e: UserTableEntry, seen = new Set<string>()) => {
    if (out.includes(e) || seen.has(e.name)) return
    seen.add(e.name)
    for (const child of all.filter((c) => refs.get(c.name)?.includes(e.name) && c !== e)) visit(child, seen)
    out.push(e)
  }
  for (const e of all) visit(e)
  return out
}

// Never exported: encrypted credentials and sessions, and the secret link tokens (they would grant access).
export const SECRET_COLUMNS: Record<string, string[]> = {
  garmin_accounts: ['usernameEnc', 'passwordEnc', 'sessionEnc'],
  link_tokens: ['token'],
}

const parseJsonColumns = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => {
  if (k.endsWith('Json') && typeof v === 'string') { try { return [k, JSON.parse(v)] } catch { /* keep the text */ } }
  return [k, v]
}))

const README = (at: string, counts: [string, number][]) => [
  'Runmate – Export deiner Daten (Art. 20 DSGVO)',
  `Erstellt: ${at}`,
  '',
  'Eine JSON-Datei je Tabelle, jeweils eine Liste von Zeilen. Zeitstempel ohne Einheit sind Unix-Sekunden (UTC).',
  'Nicht enthalten: verschlüsselte Zugangsdaten und Sitzungen (Garmin) und die geheimen Links (Kalender, Apple Health).',
  'Originaldateien von Importen speichert Runmate nicht; enthalten sind die daraus gelesenen Aktivitäten.',
  '',
  ...counts.map(([name, n]) => `${name}.json: ${n} ${n === 1 ? 'Zeile' : 'Zeilen'}`),
  '',
].join('\n')

// All of the current user's rows as a ZIP: runmate-export/<table>.json + README.txt.
export async function exportUserData(now = new Date()): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const counts: [string, number][] = []
  for (const { name, table } of userTables()) {
    const rows = await db.select().from(table).where(own(table)) as Record<string, unknown>[]
    const hidden = SECRET_COLUMNS[name] ?? []
    const clean = rows.map((r) => parseJsonColumns(Object.fromEntries(Object.entries(r).filter(([k]) => !hidden.includes(k)))))
    files[`runmate-export/${name}.json`] = strToU8(JSON.stringify(clean, null, 2))
    counts.push([name, rows.length])
  }
  files['runmate-export/README.txt'] = strToU8(README(now.toISOString(), counts))
  return zipSync(files, { level: 6 })
}

// Deletes every row of the current user in every user table (Art. 17). The caller handles Paddle and Clerk
// (lib/account/delete.ts).
export async function deleteUserData(): Promise<string[]> {
  const done: string[] = []
  for (const { name, table } of userTables()) {
    await db.delete(table).where(own(table))
    done.push(name)
  }
  return done
}

// After revoking the health-data consent: activities with their streams and the Apple Health values. Plan, profile,
// account and subscription stay.
export const HEALTH_TABLES = ['activity_streams', 'activities', 'health_days', 'health_workouts']
export async function deleteHealthData(): Promise<void> {
  await db.delete(activityStreams).where(own(activityStreams))
  await db.delete(activities).where(own(activities))
  await db.delete(healthDays).where(own(healthDays))
  await db.delete(healthWorkouts).where(own(healthWorkouts))
}
