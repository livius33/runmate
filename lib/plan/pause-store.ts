// Krank/Pause periods (07-08), stored in settings 'plan_pauses'.
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { storedPauses, type Pause } from './pause'

const KEY = 'plan_pauses'

export async function loadPauses(): Promise<Pause[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  if (!row) return []
  try { return storedPauses(JSON.parse(row.value)) } catch { return [] }
}

export async function savePauses(pauses: Pause[]) {
  const value = JSON.stringify([...pauses].sort((a, b) => a.from.localeCompare(b.from)))
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}
