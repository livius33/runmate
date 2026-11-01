// Per-day event versions for the calendar feed, kept in settings 'calendar_versions':
// { date: { h: content hash, seq, at } }. A day whose content changed gets seq + 1 and a new timestamp.
import { createHash } from 'crypto'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
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
  const prev = (await getSettingJson<Record<string, EventVersion>>(KEY)) ?? {}
  const { versions, changed } = nextVersions(sessions, prev, now)
  if (changed) await setSettingJson(KEY, versions)
  return versions
}
