// Each user's Garmin login (the `garmin` source): credentials and the persisted session, encrypted at rest
// (lib/crypto.ts), plus consent and the last error state as a code. Nothing secret is ever returned by an API or logged;
// routes only learn whether an account exists and what state it is in.
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { garminAccounts } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { decrypt, encrypt } from '@/lib/crypto'
import type { SourceErrorCode } from '@/lib/sources/types'

export interface GarminSession { oauth1: { oauth_token: string; oauth_token_secret: string }; oauth2: unknown }

const now = () => Math.floor(Date.now() / 1000)

// Only after a successful login (lib/sources/garmin-login/index.ts connect): credentials, the fresh session, consent.
export async function saveGarminAccount(username: string, password: string, session: GarminSession | null) {
  const t = now()
  const set = {
    usernameEnc: encrypt(username),
    passwordEnc: encrypt(password),
    sessionEnc: session ? encrypt(JSON.stringify(session)) : null,
    sessionAt: session ? t : null,
    consentedAt: t,
    errorCode: null,
    errorAt: null,
    updatedAt: t,
  }
  await db.insert(garminAccounts).values(mine(set)).onConflictDoUpdate({ target: garminAccounts.userId, set })
}

export async function deleteGarminAccount() {
  await db.delete(garminAccounts).where(own(garminAccounts))
}

// Status only: never the values.
export async function garminAccountStatus() {
  const [row] = await db
    .select({ sessionAt: garminAccounts.sessionAt, syncedAt: garminAccounts.syncedAt, consentedAt: garminAccounts.consentedAt, errorCode: garminAccounts.errorCode, errorAt: garminAccounts.errorAt })
    .from(garminAccounts).where(own(garminAccounts)).limit(1)
  return {
    hasCredentials: !!row,
    hasSession: !!row?.sessionAt,
    sessionUpdatedAt: row?.sessionAt ?? null,
    syncedAt: row?.syncedAt ?? null,
    consentedAt: row?.consentedAt ?? null,
    errorCode: (row?.errorCode ?? null) as SourceErrorCode | null,
    errorAt: row?.errorAt ?? null,
  }
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

// After every sync attempt: when, and the error code (null = it worked).
export async function markGarminSynced(errorCode: SourceErrorCode | null = null) {
  const t = now()
  await db.update(garminAccounts).set({ syncedAt: t, errorCode, errorAt: errorCode ? t : null }).where(own(garminAccounts))
}

// Users the daily cron syncs: everyone with a Garmin account, the least recently synced first.
export async function garminUserIds(): Promise<string[]> {
  // cross-user: the cron job lists whom to sync, then runs each user in their own scope
  const rows = await db.select({ userId: garminAccounts.userId }).from(garminAccounts).orderBy(sql`${garminAccounts.syncedAt} asc nulls first`)
  return rows.map((r) => r.userId)
}
