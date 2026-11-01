// DB side of the runner's profile (lib/profile.ts): one user_profile row per user.
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userProfile } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { ZONE_MODELS, type UserProfile, type ZoneModel } from '@/lib/profile'

type Row = typeof userProfile.$inferSelect

const fromRow = (r: Row): UserProfile => ({
  hrMax: r.hrMax, hrRest: r.hrRest, lthr: r.lthr,
  zoneModel: ZONE_MODELS.includes(r.zoneModel as ZoneModel) ? r.zoneModel as ZoneModel : null,
  pbTime: r.pbTime, pbRace: r.pbRace, pbHr: r.pbHr, vo2max: r.vo2max, weightKg: r.weightKg, easyPace: r.easyPace,
  timezone: r.timezone, locale: r.locale,
})

// Read before the user's scope exists (lib/server/scope.ts runAsUser), hence the explicit id. Null = no profile yet.
export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1)
  return row ? fromRow(row) : null
}

export async function loadOwnProfile(): Promise<UserProfile | null> {
  const [row] = await db.select().from(userProfile).where(own(userProfile)).limit(1)
  return row ? fromRow(row) : null
}

export async function saveUserProfile(p: UserProfile) {
  const set = { ...p, updatedAt: Math.floor(Date.now() / 1000) }
  await db.insert(userProfile).values(mine(set)).onConflictDoUpdate({ target: userProfile.userId, set })
}
