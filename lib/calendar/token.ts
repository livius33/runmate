// The secret in the calendar feed URL (calendar apps cannot log in). Stored in settings, rotatable.
import { randomBytes, timingSafeEqual } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'

const KEY = 'calendar_token'

export async function getCalendarToken(): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  return row?.value ?? null
}

export async function rotateCalendarToken(): Promise<string> {
  const value = randomBytes(24).toString('base64url')
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return value
}

export async function tokenMatches(given: string) {
  const token = await getCalendarToken()
  if (!token) return false
  const a = Buffer.from(given), b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}
