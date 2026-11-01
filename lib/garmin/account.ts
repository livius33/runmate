// Each user's Garmin account (Phase 2): credentials and the persisted session, encrypted at rest (lib/crypto.ts).
// Nothing here is ever returned by an API or logged; routes only learn whether an account exists.
// Phase 3 turns this into one ActivitySource among several; logging in with the user's own credentials stays one option.
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { garminAccounts } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { decrypt, encrypt } from '@/lib/crypto'

export interface GarminSession { oauth1: { oauth_token: string; oauth_token_secret: string }; oauth2: unknown }

const now = () => Math.floor(Date.now() / 1000)

export async function saveGarminCredentials(username: string, password: string) {
  const set = { usernameEnc: encrypt(username), passwordEnc: encrypt(password), sessionEnc: null, sessionAt: null, updatedAt: now() }
  await db.insert(garminAccounts).values(mine(set)).onConflictDoUpdate({ target: garminAccounts.userId, set })
}

export async function deleteGarminAccount() {
  await db.delete(garminAccounts).where(own(garminAccounts))
}

// Status only: never the values.
export async function garminAccountStatus() {
  const [row] = await db.select({ sessionAt: garminAccounts.sessionAt, updatedAt: garminAccounts.updatedAt }).from(garminAccounts).where(own(garminAccounts)).limit(1)
  return { hasCredentials: !!row, hasSession: !!row?.sessionAt, sessionUpdatedAt: row?.sessionAt ?? null }
}

export async function loadGarminAccount(): Promise<{ username: string; password: string; session: GarminSession | null } | null> {
  const [row] = await db.select().from(garminAccounts).where(own(garminAccounts)).limit(1)
  if (!row) return null
  let session: GarminSession | null = null
  if (row.sessionEnc) {
    try { session = JSON.parse(decrypt(row.sessionEnc)) as GarminSession } catch { session = null }
  }
  return { username: decrypt(row.usernameEnc), password: decrypt(row.passwordEnc), session }
}

export async function saveGarminSession(session: GarminSession) {
  await db.update(garminAccounts).set({ sessionEnc: encrypt(JSON.stringify(session)), sessionAt: now() }).where(own(garminAccounts))
}

export async function markGarminSynced() {
  await db.update(garminAccounts).set({ syncedAt: now() }).where(own(garminAccounts))
}

// Users the daily cron syncs: everyone with a Garmin account, the least recently synced first.
export async function garminUserIds(): Promise<string[]> {
  // cross-user: the cron job lists whom to sync, then runs each user in their own scope
  const rows = await db.select({ userId: garminAccounts.userId }).from(garminAccounts).orderBy(sql`${garminAccounts.syncedAt} asc nulls first`)
  return rows.map((r) => r.userId)
}
