import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { CHECKLIST_IDS } from '@/lib/plan/race-week'   // the ids are the same for every race (race-week.ts raceWeek)
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const KEY = 'race_checklist'
const Body = z.object({ id: z.enum(CHECKLIST_IDS as [string, ...string[]]), checked: z.boolean() })

async function load(): Promise<Record<string, boolean>> {
  return (await getSettingJson<Record<string, boolean>>(KEY)) ?? {}
}

// Race-week checklist: which items are ticked (same on every device).
export const GET = withUser(async () => {
  await ensureLiveBlocks()
  return NextResponse.json({ checked: await load() })
})

export const PUT = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Unbekannter Punkt' }, { status: 400 })
  const checked = { ...(await load()), [parsed.data.id]: parsed.data.checked }
  await setSettingJson(KEY, checked)
  return NextResponse.json({ checked })
})
