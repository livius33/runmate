// Per-day event versions for the calendar feed, kept in settings 'calendar_versions':
// { date: { h: content hash, seq, at } }. A day whose content changed gets seq + 1 and a new timestamp.
import { createHash } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import type { PlanSession } from '@/lib/plan/types'
import { eventContent, type EventVersion } from './ics'

const KEY = 'calendar_versions'

// Pure: next versions for these sessions; `changed` = something to save.
export function nextVersions(sessions: PlanSession[], prev: Record<string, EventVersion>, now: Date) {
  const out: Record<string, EventVersion> = { ...prev }
  let changed = false
  for (const s of sessions) {
    const h = createHash('sha1').update(eventContent(s)).digest('hex').slice(0, 16)
    const p = prev[s.date]
    if (p?.h === h) continue
    out[s.date] = { h, seq: p ? p.seq + 1 : 0, at: now.toISOString() }
    changed = true
  }
  return { versions: out, changed }
}

export async function syncVersions(sessions: PlanSession[], now = new Date()) {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  const prev = row ? (JSON.parse(row.value) as Record<string, EventVersion>) : {}
  const { versions, changed } = nextVersions(sessions, prev, now)
  if (changed) {
    const value = JSON.stringify(versions)
    await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  }
  return versions
}
