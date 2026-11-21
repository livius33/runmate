// The per-user key/value store (settings table, keyed by user and key). The only module that reads or writes it.
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { eq } from 'drizzle-orm'

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(own(settings, eq(settings.key, key)))
  return row?.value ?? null
}

// Parsed JSON, or null when missing or unreadable.
export async function getSettingJson<T>(key: string): Promise<T | null> {
  const v = await getSetting(key)
  if (v == null) return null
  try { return JSON.parse(v) as T } catch { return null }
}

export async function getSettings(keys: string[]): Promise<Map<string, string>> {
  if (!keys.length) return new Map()
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings).where(own(settings, inArray(settings.key, keys)))
  return new Map(rows.map((r) => [r.key, r.value]))
}

export async function setSetting(key: string, value: string) {
  await db.insert(settings).values(mine({ key, value })).onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value } })
}

export const setSettingJson = (key: string, v: unknown) => setSetting(key, JSON.stringify(v))

// Compare-and-set for a read-modify-write that two requests may run at once: writes only while the stored value is still
// `expected` (null = no row yet). False = another request wrote first; the caller reads again or gives up. One
// statement each, so it holds on both drivers (neon-http has no interactive transactions).
export async function compareAndSetSetting(key: string, expected: string | null, value: string): Promise<boolean> {
  const rows = expected == null
    ? await db.insert(settings).values(mine({ key, value })).onConflictDoNothing().returning({ key: settings.key })
    : await db.update(settings).set({ value }).where(own(settings, eq(settings.key, key), eq(settings.value, expected))).returning({ key: settings.key })
  return rows.length > 0
}
