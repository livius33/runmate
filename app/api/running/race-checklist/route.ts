import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { CHECKLIST_IDS } from '@/lib/plan/race-week'   // the ids are the same for every race (race-week.ts raceWeek)
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'

export const runtime = 'nodejs'

const KEY = 'race_checklist'
const Body = z.object({ id: z.enum(CHECKLIST_IDS as [string, ...string[]]), checked: z.boolean() })

async function load(): Promise<Record<string, boolean>> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  try { return row ? JSON.parse(row.value) : {} } catch { return {} }
}

// Race-week checklist: which items are ticked (same on every device).
export async function GET() {
  await ensureLiveBlocks()
  return NextResponse.json({ checked: await load() })
}

export async function PUT(req: Request) {
  await ensureLiveBlocks()
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Unbekannter Punkt' }, { status: 400 })
  const checked = { ...(await load()), [parsed.data.id]: parsed.data.checked }
  const value = JSON.stringify(checked)
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return NextResponse.json({ checked })
}
