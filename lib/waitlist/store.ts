// The waitlist repository on Postgres (Phase 6). Not a user table: no owner filter (lib/db/public-schema.ts).
import { and, eq, isNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { waitlist } from '@/lib/db/public-schema'
import { asLocale, type WaitlistRepo, type WaitlistRow } from './index'

const row = (r: typeof waitlist.$inferSelect | undefined): WaitlistRow | null => (r ? { ...r, locale: asLocale(r.locale) } : null)

export const dbWaitlist: WaitlistRepo = {
  async get(email) { return row((await db.select().from(waitlist).where(eq(waitlist.email, email)).limit(1))[0]) },
  async byTokenHash(hash) { return row((await db.select().from(waitlist).where(eq(waitlist.tokenHash, hash)).limit(1))[0]) },
  async upsert(r) {
    await db.insert(waitlist).values(r).onConflictDoUpdate({
      target: waitlist.email, set: { locale: r.locale, tokenHash: r.tokenHash, createdAt: r.createdAt, confirmedAt: r.confirmedAt },
    })
  },
  async confirm(email, at) { await db.update(waitlist).set({ confirmedAt: at }).where(eq(waitlist.email, email)) },
  async remove(email) { await db.delete(waitlist).where(eq(waitlist.email, email)) },
  async purgeUnconfirmed(before) { await db.delete(waitlist).where(and(isNull(waitlist.confirmedAt), lt(waitlist.createdAt, before))) },
}
