// Writes the demo athlete's data (Phase 5): every row of the demo user is deleted, then lib/demo/generate.ts is written
// fresh. Only ever as the demo user (scripts/seed-demo.mts, the nightly /api/cron/demo-reset); refuses any other scope.
// Server/scripts only.
import { db } from '@/lib/db'
import { activities, activityStreams } from '@/lib/db/schema'
import { mine, uid } from '@/lib/db/owned'
import { setSettingJson } from '@/lib/db/settings'
import { deleteUserData } from '@/lib/account/data'
import { saveUserProfile } from '@/lib/profile-store'
import { DEMO_USER_ID } from './athlete'
import { generateDemo, type DemoData } from './generate'

const CHUNK = { activities: 50, streams: 8 }     // neon-http sends one request per statement; keep them small

export const demoEnabled = () => ['1', 'true', 'yes'].includes((process.env.DEMO_MODE ?? '').trim().toLowerCase())

export async function writeDemo(data: DemoData) {
  if (uid() !== DEMO_USER_ID) throw new Error('writeDemo runs only as the demo user')
  await deleteUserData()
  await saveUserProfile(data.profile)
  for (const [key, value] of Object.entries(data.settings)) await setSettingJson(key, value)
  for (let i = 0; i < data.activities.length; i += CHUNK.activities) {
    await db.insert(activities).values(data.activities.slice(i, i + CHUNK.activities).map((a) => mine(a)))
  }
  for (let i = 0; i < data.streams.length; i += CHUNK.streams) {
    await db.insert(activityStreams).values(data.streams.slice(i, i + CHUNK.streams).map((s) => mine(s)))
  }
  return { activities: data.activities.length, streams: data.streams.length, settings: Object.keys(data.settings).length }
}

// Regenerate for `today` and write it: the nightly reset (the block always shows week 9 of 12).
export async function resetDemo(today: string) {
  return writeDemo(generateDemo(today))
}
